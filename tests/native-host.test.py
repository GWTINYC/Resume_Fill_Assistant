"""Real native-messaging framing + durable storage; synthetic keys only.
Windows builds Host.cs with the bundled .NET Framework compiler; macOS uses Python 3.
"""
import concurrent.futures, json, os, pathlib, shutil, struct, subprocess, sys, tempfile, unittest
REPO=pathlib.Path(__file__).resolve().parents[1]
ORIGIN='chrome-extension://'+'a'*32+'/'
class NativeHostTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace=tempfile.TemporaryDirectory(prefix='resume-native-test-')
        cls.root=pathlib.Path(cls.workspace.name)
        cls.native=cls.root/'native';cls.native.mkdir()
        if os.name=='nt':
            compiler=pathlib.Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
            if not compiler.exists():compiler=pathlib.Path(os.environ['WINDIR'])/'Microsoft.NET/Framework/v4.0.30319/csc.exe'
            cls.exe=cls.native/'host.exe'
            subprocess.run([str(compiler),'/nologo','/target:exe','/reference:System.Web.Extensions.dll','/out:'+str(cls.exe),str(REPO/'native/Host.cs')],check=True,capture_output=True)
            cls.command=[str(cls.exe)]
        else:
            shutil.copyfile(REPO/'native/host.py',cls.native/'host.py')
            cls.command=[sys.executable,str(cls.native/'host.py')]
        (cls.native/'native-host.json').write_text(json.dumps({'allowed_origins':[ORIGIN]}),encoding='utf-8')
    @classmethod
    def tearDownClass(cls):cls.workspace.cleanup()
    def setUp(self):
        path=self.root/'api-keys.json'
        if path.exists():path.unlink()
    def request(self,message,origin=ORIGIN):
        raw=json.dumps(message).encode()
        process=subprocess.run(self.command+[origin],input=struct.pack('<I',len(raw))+raw,capture_output=True,timeout=10)
        self.assertEqual(process.returncode,0)
        self.assertEqual(process.stderr,b'')
        self.assertGreaterEqual(len(process.stdout),4)
        size=struct.unpack('<I',process.stdout[:4])[0]
        self.assertEqual(size,len(process.stdout)-4)
        return json.loads(process.stdout[4:])
    def test_fresh_process_restore_and_separate_delete(self):
        self.assertEqual(self.request({'action':'get','provider':'jev'})['value'],'')
        self.assertTrue(self.request({'action':'set','provider':'jev','value':'apikey_native_fixture'})['ok'])
        self.assertTrue(self.request({'action':'set','provider':'deepseek','value':'sk-native-fixture'})['ok'])
        self.assertEqual(self.request({'action':'get','provider':'jev'})['value'],'apikey_native_fixture')
        self.assertEqual(self.request({'action':'get','provider':'deepseek'})['value'],'sk-native-fixture')
        status=self.request({'action':'status'});self.assertEqual(status['present'],{'jev':True,'deepseek':True});self.assertNotIn('apikey_',json.dumps(status))
        self.request({'action':'delete','provider':'jev'})
        self.assertEqual(self.request({'action':'get','provider':'jev'})['value'],'')
        self.assertEqual(self.request({'action':'get','provider':'deepseek'})['value'],'sk-native-fixture')
        if os.name!='nt':
            self.assertEqual((self.root/'api-keys.json').stat().st_mode&0o777,0o600)
            self.assertEqual(self.root.stat().st_mode&0o777,0o700)
    def test_untrusted_origin_and_arbitrary_paths_are_rejected(self):
        self.assertEqual(self.request({'action':'get','provider':'jev'},'chrome-extension://'+'b'*32+'/')['code'],'PC_ORIGIN_DENIED')
        self.assertEqual(self.request({'action':'set','provider':'jev','value':'apikey_fixture','path':'elsewhere'})['code'],'PC_REQUEST_INVALID')
        self.assertFalse((self.root/'api-keys.json').exists())
    def test_corruption_is_not_overwritten_or_echoed(self):
        raw='PRIVATE-CORRUPT-CONTENT'
        (self.root/'api-keys.json').write_text(raw)
        result=self.request({'action':'set','provider':'jev','value':'apikey_fixture'})
        self.assertEqual(result,{'ok':False,'code':'PC_FILE_INVALID'})
        self.assertEqual((self.root/'api-keys.json').read_text(),raw)
        self.assertNotIn('PRIVATE',json.dumps(result))
    def test_concurrent_providers_do_not_lose_each_other(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(self.request,[{'action':'set','provider':'jev','value':'apikey_parallel_fixture'},{'action':'set','provider':'deepseek','value':'sk-parallel-fixture'}]))
        self.assertTrue(all(x['ok'] for x in results))
        self.assertEqual(self.request({'action':'status'})['present'],{'jev':True,'deepseek':True})
    def test_invalid_key_cannot_replace_existing(self):
        self.request({'action':'set','provider':'jev','value':'apikey_existing_fixture'})
        self.assertEqual(self.request({'action':'set','provider':'jev','value':'sk-wrong-provider'})['code'],'PC_KEY_INVALID')
        self.assertEqual(self.request({'action':'get','provider':'jev'})['value'],'apikey_existing_fixture')
if __name__=='__main__':unittest.main()
