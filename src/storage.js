// Local persistence only. No cloud sync or remote backup.
export async function getApiKey() {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const saved=await chrome.storage.local.get('apiKey');
  if(saved.apiKey)return saved.apiKey;
  const legacy=await chrome.storage.session.get('apiKey');
  if(legacy.apiKey){await chrome.storage.local.set({apiKey:legacy.apiKey});await chrome.storage.session.remove('apiKey');return legacy.apiKey;}
  return '';
}
export async function setApiKey(apiKey) {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.storage.local.set({apiKey});await chrome.storage.session.remove('apiKey');
}
export async function clearApiKey() {
  await chrome.storage.local.remove('apiKey');await chrome.storage.session.remove('apiKey');
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
