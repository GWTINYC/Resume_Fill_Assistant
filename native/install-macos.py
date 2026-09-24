#!/usr/bin/env python3
import json, os, pathlib, re, shutil, sys
ids = re.split(r'[,\s]+', sys.argv[1] if len(sys.argv)>1 else input('Paste extension ID from panel (comma separated for Chrome + Edge): ').strip())
if not ids or any(not re.fullmatch('[a-p]{32}', x) for x in ids):
    raise SystemExit('Invalid extension ID. Copy the 32-letter ID from the panel.')
root = pathlib.Path.home()/'.resume-fill-assistant'
native = root/'native'
if root.is_symlink() or native.is_symlink():
    raise SystemExit('Installation folder must not be a symbolic link.')
native.mkdir(parents=True,exist_ok=True,mode=0o700)
os.chmod(root,0o700)
os.chmod(native,0o700)
shutil.copyfile(pathlib.Path(__file__).with_name('host.py'),native/'host.py')
launcher = native/'host.command'
# Quote both paths as shell arguments; installation supports spaces in user directories.
import shlex
launcher.write_text('#!/bin/sh\nexec '+shlex.quote(sys.executable)+' '+shlex.quote(str(native/'host.py'))+' "$@"\n')
launcher.chmod(0o700)
manifest_path=native/'native-host.json'
origins=['chrome-extension://'+x+'/' for x in ids]
if manifest_path.exists():
    old=json.loads(manifest_path.read_text())
    origins += [x for x in old.get('allowed_origins',[]) if re.fullmatch(r'chrome-extension://[a-p]{32}/',x)]
manifest={'name':'com.resumefill.assistant','description':'Resume Fill Assistant local API keys','path':str(launcher),'type':'stdio','allowed_origins':list(dict.fromkeys(origins))}
manifest_path.write_text(json.dumps(manifest,indent=2))
manifest_path.chmod(0o600)
for browser in ['Google/Chrome','Google/Chrome for Testing','Microsoft Edge','Chromium']:
    folder=pathlib.Path.home()/'Library/Application Support'/browser/'NativeMessagingHosts'
    folder.mkdir(parents=True,exist_ok=True)
    destination=folder/'com.resumefill.assistant.json'
    destination.write_text(json.dumps(manifest,indent=2))
    destination.chmod(0o600)
print('Installed. Keys remain in ~/.resume-fill-assistant/api-keys.json when the extension is uninstalled.')
print('Return to the extension and click Connect / migrate local keys.')
