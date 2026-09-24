#!/usr/bin/env python3
"""One-request native messaging host. No network; no paths accepted in messages."""
import contextlib, datetime, fcntl, json, os, pathlib, re, struct, sys, tempfile, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = pathlib.Path(__file__).with_name('native-host.json')
class VaultError(Exception):
    pass

def valid_key(provider, value):
    return provider in ('jev', 'deepseek') and isinstance(value, str) and len(value) <= 4096 and not re.search(r'\s', value) and value.startswith('apikey_' if provider == 'jev' else 'sk-')

@contextlib.contextmanager
def locked():
    if ROOT.is_symlink():
        raise VaultError('PC_FILE_INVALID')
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(ROOT, 0o700)
    fd = os.open(str(ROOT / '.keys.lock'), os.O_CREAT | os.O_RDWR, 0o600)
    try:
        deadline = time.monotonic() + 5
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise VaultError('PC_FILE_BUSY')
                time.sleep(0.05)
        yield
    finally:
        os.close(fd)

def read_keys():
    path = ROOT / 'api-keys.json'
    if not path.exists():
        return {}
    try:
        if path.is_symlink() or path.stat().st_size > 20000:
            raise ValueError()
        data = json.loads(path.read_text(encoding='utf-8-sig'))
        keys = data['keys']
        if data.get('version') != 1 or not isinstance(keys, dict) or any(not valid_key(k, v) for k, v in keys.items()):
            raise ValueError()
        os.chmod(path, 0o600)
        return keys
    except (ValueError, KeyError, UnicodeError):
        raise VaultError('PC_FILE_INVALID')

def write_keys(keys):
    data = json.dumps({'version': 1, 'keys': keys, 'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}, ensure_ascii=False)
    fd, temporary = tempfile.mkstemp(prefix='.keys-', dir=ROOT)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, ROOT / 'api-keys.json')
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def handle(message):
    if not isinstance(message, dict) or set(message) - {'action', 'provider', 'value'}:
        raise VaultError('PC_REQUEST_INVALID')
    action = message.get('action')
    provider = message.get('provider')
    if action not in ('status', 'get', 'set', 'delete') or action != 'status' and provider not in ('jev', 'deepseek'):
        raise VaultError('PC_REQUEST_INVALID')
    if action == 'set' and not valid_key(provider, message.get('value')):
        raise VaultError('PC_KEY_INVALID')
    with locked():
        keys = read_keys()
        if action == 'status':
            return {'ok': True, 'present': {p: bool(keys.get(p)) for p in ('jev', 'deepseek')}}
        if action == 'get':
            return {'ok': True, 'value': keys.get(provider, '')}
        if action == 'set':
            keys[provider] = message['value']
        else:
            keys.pop(provider, None)
        write_keys(keys)
        return {'ok': True}

def read_exact(stream, size):
    data = bytearray()
    while len(data) < size:
        part = stream.read(size - len(data))
        if not part:
            raise VaultError('PC_PROTOCOL_INVALID')
        data.extend(part)
    return bytes(data)

def main():
    try:
        size = struct.unpack('<I', read_exact(sys.stdin.buffer, 4))[0]
        if not 0 < size <= 16384:
            raise VaultError('PC_REQUEST_INVALID')
        message = json.loads(read_exact(sys.stdin.buffer, size).decode('utf-8'))
        allowed = json.loads(MANIFEST.read_text(encoding='utf-8-sig'))['allowed_origins']
        origin = next((a for a in sys.argv[1:] if a.startswith('chrome-extension://')), '')
        if not re.fullmatch(r'chrome-extension://[a-p]{32}/', origin) or origin not in allowed:
            raise VaultError('PC_ORIGIN_DENIED')
        result = handle(message)
    except VaultError as error:
        result = {'ok': False, 'code': str(error)}
    except PermissionError:
        result = {'ok': False, 'code': 'PC_FILE_ACCESS'}
    except Exception:
        result = {'ok': False, 'code': 'PC_IO_FAILED'}
    encoded = json.dumps(result).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(encoded)) + encoded)
    sys.stdout.buffer.flush()

if __name__ == '__main__':
    main()
