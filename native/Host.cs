using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

class Host {
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength=20000, RecursionLimit=8 };
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
    static string Root = Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar)).FullName;
    static string Manifest = Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"native-host.json");
    static bool ValidKey(string provider, object value) {
        string text=value as string;
        return text!=null && text.Length<=4096 && !Regex.IsMatch(text,@"\s") &&
            ((provider=="jev" && text.StartsWith("apikey_")) || (provider=="deepseek" && text.StartsWith("sk-")));
    }
    static Dictionary<string,object> Object(object value) {
        var obj=value as Dictionary<string,object>;
        if(obj==null) throw new Exception("PC_FILE_INVALID");
        return obj;
    }
    static void PrivateDirectory(string path) {
        Directory.CreateDirectory(path);
        if((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0) throw new Exception("PC_FILE_INVALID");
        var sid=WindowsIdentity.GetCurrent().User;
        var acl=new DirectorySecurity();acl.SetOwner(sid);acl.SetAccessRuleProtection(true,false);
        foreach(var user in new[]{sid,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})
            acl.AddAccessRule(new FileSystemAccessRule(user,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
        Directory.SetAccessControl(path,acl);
    }
    static void PrivateFile(string path) {
        var sid=WindowsIdentity.GetCurrent().User;var acl=new FileSecurity();acl.SetOwner(sid);acl.SetAccessRuleProtection(true,false);
        foreach(var user in new[]{sid,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})acl.AddAccessRule(new FileSystemAccessRule(user,FileSystemRights.FullControl,AccessControlType.Allow));
        File.SetAccessControl(path,acl);
    }
    static Dictionary<string,object> ReadKeys() {
        string path=Path.Combine(Root,"api-keys.json");
        if(!File.Exists(path)) return new Dictionary<string,object>();
        if(new FileInfo(path).Length>20000 || (File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0) throw new Exception("PC_FILE_INVALID");
        try {
            var data=Object(Json.DeserializeObject(File.ReadAllText(path,Utf8)));
            if(!data.ContainsKey("version") || !System.Object.Equals(data["version"],1) || !data.ContainsKey("keys")) throw new Exception();
            var keys=Object(data["keys"]);
            if(keys.Any(pair=>!ValidKey(pair.Key,pair.Value))) throw new Exception();
            PrivateFile(path);return keys;
        } catch(UnauthorizedAccessException) {throw;} catch {throw new Exception("PC_FILE_INVALID");}
    }
    static void WriteKeys(Dictionary<string,object> keys) {
        string path=Path.Combine(Root,"api-keys.json"),temporary=Path.Combine(Root,".keys-"+Guid.NewGuid().ToString("N"));
        try {
            var data=new Dictionary<string,object>{{"version",1},{"keys",keys},{"updatedAt",DateTime.UtcNow.ToString("o")}};
            using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {
                byte[] encoded=Utf8.GetBytes(Json.Serialize(data));stream.Write(encoded,0,encoded.Length);stream.Flush(true);
            }
            if(File.Exists(path)) File.Replace(temporary,path,null); else File.Move(temporary,path);PrivateFile(path);
        } finally { if(File.Exists(temporary)) File.Delete(temporary); }
    }
    static object Handle(Dictionary<string,object> request) {
        if(request.Keys.Any(k=>!new[]{"action","provider","value"}.Contains(k))) throw new Exception("PC_REQUEST_INVALID");
        string action=request.ContainsKey("action")?request["action"] as string:null;
        string provider=request.ContainsKey("provider")?request["provider"] as string:null;
        if(!new[]{"status","get","set","delete"}.Contains(action) || (action!="status"&&!new[]{"jev","deepseek"}.Contains(provider))) throw new Exception("PC_REQUEST_INVALID");
        if(action=="set"&&(!request.ContainsKey("value")||!ValidKey(provider,request["value"]))) throw new Exception("PC_KEY_INVALID");
        using(var mutex=new Mutex(false,@"Local\ResumeFillKeys-"+WindowsIdentity.GetCurrent().User.Value)) {
            bool acquired=false;
            try {
                try {acquired=mutex.WaitOne(5000);} catch(AbandonedMutexException) {acquired=true;}
                if(!acquired) throw new Exception("PC_FILE_BUSY");
                PrivateDirectory(Root);
                var keys=ReadKeys();
                if(action=="status") return new {ok=true,present=new{jev=keys.ContainsKey("jev"),deepseek=keys.ContainsKey("deepseek")}};
                if(action=="get") return new{ok=true,value=keys.ContainsKey(provider)?(string)keys[provider]:""};
                if(action=="set") keys[provider]=request["value"]; else keys.Remove(provider);
                WriteKeys(keys);return new{ok=true};
            } finally {if(acquired)mutex.ReleaseMutex();}
        }
    }
    static byte[] ReadExact(Stream stream,int size) {
        byte[] data=new byte[size];int offset=0;
        while(offset<size){int n=stream.Read(data,offset,size-offset);if(n==0)throw new Exception("PC_PROTOCOL_INVALID");offset+=n;}
        return data;
    }
    static void Serve(string[] args) {
        object result;
        try {
            Stream input=Console.OpenStandardInput();uint size=BitConverter.ToUInt32(ReadExact(input,4),0);
            if(size<1||size>16384)throw new Exception("PC_REQUEST_INVALID");
            var request=Object(Json.DeserializeObject(Utf8.GetString(ReadExact(input,(int)size))));
            var manifest=Object(Json.DeserializeObject(File.ReadAllText(Manifest,Utf8)));
            var allowed=((System.Collections.IEnumerable)manifest["allowed_origins"]).Cast<object>().Select(x=>x as string);
            string origin=args.FirstOrDefault(x=>x.StartsWith("chrome-extension://"))??"";
            if(!Regex.IsMatch(origin,@"^chrome-extension://[a-p]{32}/$")||!allowed.Contains(origin))throw new Exception("PC_ORIGIN_DENIED");
            result=Handle(request);
        } catch(Exception error) {
            string code=error is UnauthorizedAccessException?"PC_FILE_ACCESS":Regex.IsMatch(error.Message,@"^PC_[A-Z_]+$")?error.Message:"PC_IO_FAILED";
            result=new{ok=false,code=code};
        }
        byte[] output=Utf8.GetBytes(Json.Serialize(result));Stream stdout=Console.OpenStandardOutput();stdout.Write(BitConverter.GetBytes((uint)output.Length),0,4);stdout.Write(output,0,output.Length);stdout.Flush();
    }
    static void Install(string[] args) {
        string text=args.Length>1?args[1]:null;
        if(String.IsNullOrWhiteSpace(text)){Console.WriteLine("Paste extension ID from panel (comma separated for Chrome + Edge):");text=Console.ReadLine()??"";}
        var ids=Regex.Split(text.Trim(),@"[,\s]+");
        if(ids.Any(x=>!Regex.IsMatch(x,@"^[a-p]{32}$")))throw new Exception("Invalid extension ID. Copy the 32-letter ID from the panel.");
        Root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".resume-fill-assistant");
        PrivateDirectory(Root);string native=Path.Combine(Root,"native");PrivateDirectory(native);
        string target=Path.Combine(native,"host.exe"),manifestPath=Path.Combine(native,"native-host.json");
        var origins=ids.Select(x=>"chrome-extension://"+x+"/").ToList();
        if(File.Exists(manifestPath)){
            var old=Object(Json.DeserializeObject(File.ReadAllText(manifestPath,Utf8)));
            origins.AddRange(((System.Collections.IEnumerable)old["allowed_origins"]).Cast<object>().OfType<string>().Where(x=>Regex.IsMatch(x,@"^chrome-extension://[a-p]{32}/$")));
        }
        File.Copy(System.Reflection.Assembly.GetExecutingAssembly().Location,target,true);
        var manifest=new{name="com.resumefill.assistant",description="Resume Fill Assistant local API keys",path=target,type="stdio",allowed_origins=origins.Distinct().ToArray()};
        File.WriteAllText(manifestPath,Json.Serialize(manifest),Utf8);
        foreach(var view in new[]{RegistryView.Registry32,RegistryView.Registry64})
        using(var current=RegistryKey.OpenBaseKey(RegistryHive.CurrentUser,view))
        foreach(var browser in new[]{@"Google\Chrome",@"Microsoft\Edge","Chromium"})
        using(var key=current.CreateSubKey(@"Software\"+browser+@"\NativeMessagingHosts\com.resumefill.assistant"))key.SetValue("",manifestPath,RegistryValueKind.String);
        Console.WriteLine("Installed. Keys: "+Path.Combine(Root,"api-keys.json"));
        Console.WriteLine("Return to the extension and click Connect / migrate local keys.");
    }
    static int Main(string[] args) {
        if(args.Length>0&&args[0]=="--install") {try{Install(args);return 0;}catch(Exception error){Console.Error.WriteLine("Install failed: "+error.Message);return 1;}}
        Serve(args);return 0;
    }
}
