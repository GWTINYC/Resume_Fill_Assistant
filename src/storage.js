import {nativeKeyRequest,validApiKey} from './native-keys.js';
import {AppError} from './diagnostics.js';
import {validateLearnedFacts} from './learned.js';
// Local persistence only. No cloud sync or remote backup.
const providerKey=provider=>{if(!['jev','deepseek'].includes(provider))throw Error('未知模型服务');return provider==='jev'?'apiKey':'deepseekApiKey';};
async function nativeStatus(provider,connected,code=''){await chrome.storage.local.set({['pcKeyStatus_'+provider]:{connected,code,checkedAt:new Date().toISOString()}});}
export async function getApiKey(provider='jev') {
 const key=providerKey(provider);await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
 let saved=await chrome.storage.local.get([key,'pcLinked_'+provider,'pcPending_'+provider]);
 if(!saved[key]&&provider==='jev'){const legacy=await chrome.storage.session.get('apiKey');if(legacy.apiKey){saved[key]=legacy.apiKey;await chrome.storage.local.set({[key]:legacy.apiKey});await chrome.storage.session.remove('apiKey');}}
 try{
  let value;
  if(saved['pcPending_'+provider]&&saved[key]){await nativeKeyRequest({action:'set',provider,value:saved[key]});value=saved[key];}
  else {value=(await nativeKeyRequest({action:'get',provider})).value;if(!value&&saved[key]&&!saved['pcLinked_'+provider]){await nativeKeyRequest({action:'set',provider,value:saved[key]});value=saved[key];}}
  await chrome.storage.local.set({[key]:value,['pcLinked_'+provider]:true,['pcPending_'+provider]:false});await nativeStatus(provider,true);return value;
 }catch(error){await nativeStatus(provider,false,error.code);return saved[key]||'';}
}
export async function setApiKey(apiKey,provider='jev') {
 const key=providerKey(provider);if(!validApiKey(apiKey,provider))throw new AppError('PC_KEY_INVALID','密钥格式不正确。');
 await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
 await chrome.storage.local.set({[key]:apiKey,['pcPending_'+provider]:true});if(provider==='jev')await chrome.storage.session.remove('apiKey');
 try{await nativeKeyRequest({action:'set',provider,value:apiKey});await chrome.storage.local.set({['pcLinked_'+provider]:true,['pcPending_'+provider]:false});await nativeStatus(provider,true);return {persistent:true};}
 catch(error){await nativeStatus(provider,false,error.code);return {persistent:false,reason:error.message};}
}
export async function clearApiKey(provider='jev') {
 const key=providerKey(provider);const saved=await chrome.storage.local.get('pcLinked_'+provider);
 try{await nativeKeyRequest({action:'delete',provider});await nativeStatus(provider,true);await chrome.storage.local.set({['pcLinked_'+provider]:true});}
 catch(error){await nativeStatus(provider,false,error.code);if(saved['pcLinked_'+provider]||error.code!=='PC_NOT_INSTALLED')throw error;}
 await chrome.storage.local.remove([key,'pcPending_'+provider]);if(provider==='jev')await chrome.storage.session.remove('apiKey');
}
export async function connectPcKeys(){
 await nativeKeyRequest({action:'status'});
 await getApiKey('jev');await getApiKey('deepseek');
 const states=await chrome.storage.local.get(['pcKeyStatus_jev','pcKeyStatus_deepseek']);const failed=Object.values(states).find(s=>!s.connected);if(failed)throw new AppError(failed.code||'PC_HOST_FAILED','PC 密钥连接未完成，请查看连接状态。');
 return {connected:true};
}
function openResumeDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('jev-apply-files',1);
    let settled=false;const fail=error=>{settled=true;clearTimeout(timer);reject(error);};
    const timer=setTimeout(()=>fail(new AppError('DB_TIMEOUT','本地数据库没有响应')),10000);
    request.onblocked=()=>fail(new AppError('DB_BLOCKED','本地数据库被占用'));
    request.onupgradeneeded=()=>request.result.createObjectStore('files');
    request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}settled=true;resolve(request.result);};
    request.onerror=()=>fail(request.error||Error('无法打开本地文件存储'));
  });
}
async function resumeTransaction(mode,operation){
  const db=await openResumeDB();
  return new Promise((resolve,reject)=>{
    let result,tx;try{tx=db.transaction('files',mode);}catch(error){db.close();reject(error);return;}
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('本地文件保存失败'));};
    try{const request=operation(tx.objectStore('files'));request.onsuccess=()=>{result=request.result;};}catch(error){try{tx.abort();}catch{}db.close();reject(error);}
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

export async function getLearnedFacts(){const {learnedFacts=[]}=await chrome.storage.local.get('learnedFacts');return validateLearnedFacts(learnedFacts);}
export async function setLearnedFacts(facts){await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});await chrome.storage.local.set({learnedFacts:validateLearnedFacts(facts)});}
