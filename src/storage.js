// Local persistence only. No cloud sync or remote backup.
const providerKey=provider=>{if(!['jev','deepseek'].includes(provider))throw Error('未知模型服务');return provider==='jev'?'apiKey':'deepseekApiKey';};
export async function getApiKey(provider='jev') {
  const key=providerKey(provider);
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const saved=await chrome.storage.local.get(key);
  if(saved[key])return saved[key];
  if(provider==='deepseek')return '';
  const legacy=await chrome.storage.session.get('apiKey');
  if(legacy.apiKey){await chrome.storage.local.set({apiKey:legacy.apiKey});await chrome.storage.session.remove('apiKey');return legacy.apiKey;}
  return '';
}
export async function setApiKey(apiKey,provider='jev') {
  const key=providerKey(provider);
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.storage.local.set({[key]:apiKey});if(provider==='jev')await chrome.storage.session.remove('apiKey');
}
export async function clearApiKey(provider='jev') {
  const key=providerKey(provider);
  await chrome.storage.local.remove(key);if(provider==='jev')await chrome.storage.session.remove('apiKey');
}
function openResumeDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('jev-apply-files',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('files');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('无法打开本地文件存储'));
  });
}
async function resumeTransaction(mode,operation){
  const db=await openResumeDB();
  return new Promise((resolve,reject)=>{
    let result;const tx=db.transaction('files',mode);
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('本地文件保存失败'));};
    const request=operation(tx.objectStore('files'));
    request.onsuccess=()=>{result=request.result;};
  });
}
export const getResume=()=>resumeTransaction('readonly',store=>store.get('resume'));
export const saveResume=record=>resumeTransaction('readwrite',store=>store.put(record,'resume'));
export const deleteResume=()=>resumeTransaction('readwrite',store=>store.delete('resume'));

export async function getProvider(){const {provider}=await chrome.storage.local.get('provider');return ['jev','deepseek'].includes(provider)?provider:'jev';}
export async function setProvider(provider){providerKey(provider);await chrome.storage.local.set({provider});}
export const saveMaterial=(record,id=crypto.randomUUID())=>resumeTransaction('readwrite',store=>store.put(record,id)).then(()=>id);
export const deleteMaterial=id=>resumeTransaction('readwrite',store=>store.delete(id));
export const clearMaterials=()=>resumeTransaction('readwrite',store=>store.clear());
export async function listMaterials(){
  const db=await openResumeDB();
  return new Promise((resolve,reject)=>{
    const rows=[];const tx=db.transaction('files','readonly');const request=tx.objectStore('files').openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(cursor){rows.push({...cursor.value,id:String(cursor.key)});cursor.continue();}};
    tx.oncomplete=()=>{db.close();resolve(rows.sort((a,b)=>(a.savedAt||'').localeCompare(b.savedAt||'')||a.id.localeCompare(b.id)));};
    tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('无法读取本地素材'));};
  });
}
export const materialsSnapshot=items=>JSON.stringify(items.map(({id,name,text,savedAt,enabled})=>({id,name,text,savedAt,enabled})).sort((a,b)=>a.id.localeCompare(b.id)));
