import {pageBridge} from './page.js';
import {mergeLearnedFacts} from './learned.js';
import {getLearnedFacts,setLearnedFacts,getApiKey} from './storage.js';
import {deepseekPayload,validateDeepseekFills} from './deepseek.js';
chrome.action.onClicked.addListener(tab=>{if(tab.windowId!==undefined)chrome.sidePanel.open({windowId:tab.windowId}).catch(()=>{});});
async function inject(tabId,args,frameIds){
  if(!Number.isInteger(tabId))throw Error('请先打开一个网申页面，再点击扩展图标。');
  return chrome.scripting.executeScript({target:frameIds?{tabId,frameIds}:{tabId,allFrames:true},func:pageBridge,args:[args]});
}
async function handle(message){
  if(message.action==='scan'||message.action==='capture'){
    const action=message.action;
    const token=crypto.randomUUID();let results,limited=false;
    try{results=await inject(message.tabId,{action,token});}
    catch{results=await inject(message.tabId,{action,token},[0]);limited=true;}
    const fields=results.flatMap(r=>(r.result?.fields||[]).map(f=>({...f,localId:f.id,id:`${r.frameId}:${f.id}`,frameId:r.frameId})));
    const sections=results.flatMap(r=>(r.result?.sections||[]).map(s=>({...s,localId:s.id,id:`${r.frameId}:${s.id}`,frameId:r.frameId})));
    const experienceCategories=[...new Set(results.flatMap(r=>r.result?.experienceCategories||[]))];
    return {token,fields,sections,experienceCategories,host:new URL(results.find(r=>r.frameId===0)?.result?.url||'https://unknown.invalid').hostname,pageContext:results.find(r=>r.frameId===0)?.result?.pageContext||{},limited,atLimit:results.some(r=>r.result?.atLimit),frameCount:results.length};
  }
  if(message.action==='save-learning'){
    const current=await getLearnedFacts();
    const incoming=message.facts.map(f=>({...f,id:crypto.randomUUID(),savedAt:new Date().toISOString()}));
    const facts=mergeLearnedFacts(current,incoming);await setLearnedFacts(facts);return {count:incoming.length};
  }
  if(message.action==='edit-learning'){
    const current=await getLearnedFacts(),old=current.find(f=>f.id===message.id);if(!old)throw Error('资料已变化，请刷新后重试。');
    const facts=message.remove?current.filter(f=>f.id!==message.id):current.map(f=>f.id===message.id?{...f,value:message.value,enabled:message.enabled,savedAt:new Date().toISOString()}:f);
    await setLearnedFacts(facts);return {};
  }
  if(message.action==='add-record'){
    if(!Number.isInteger(message.frameId)||typeof message.sectionId!=='string')throw Error('无效的经历章节');
    const results=await inject(message.tabId,{action:'add-record',token:message.token,sectionId:message.sectionId,target:message.target},[message.frameId]);
    const result=results[0]?.result;if(!result?.ok)throw Error(result?.reason||'未确认新增成功');return result;
  }
  if(message.action==='fill'||message.action==='verify'){
    const frames=new Map();for(const item of message.items){if(!frames.has(item.frameId))frames.set(item.frameId,[]);frames.get(item.frameId).push({id:item.localId,value:item.value});}
    const all=[];
    for(const [frameId,items]of frames){
      try{const out=await inject(message.tabId,{action:message.action,token:message.token,overwrite:message.overwrite===true,items},[frameId]);for(const r of out)all.push(...(r.result?.results||[]).map(x=>({...x,id:`${frameId}:${x.id}`})));}
      catch{all.push(...items.map(x=>({id:`${frameId}:${x.id}`,ok:false,reason:'无法访问该框架，请重新扫描'})));}
    }
    return {results:all};
  }
  if(message.action==='deepseek-fill'){
    const apiKey=await getApiKey('deepseek');if(!apiKey)throw Error('请先保存 DeepSeek 官方 API key。');
    const {fields,sources}=message;
    if(!Array.isArray(fields)||!Array.isArray(sources)||JSON.stringify({fields,sources}).length>250000)throw Error('请求过大，请减少启用素材或字段。');
    const payload=deepseekPayload(fields,sources,message.workflow||{});
    const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(90000),redirect:'error'});
    if(!response.ok){const hints={401:'DeepSeek 密钥无效',402:'DeepSeek 账户余额不足',403:'DeepSeek 账户没有访问权限',429:'DeepSeek 请求达到限额，请稍后重试',503:'DeepSeek 服务繁忙，请稍后重试'};throw Error(hints[response.status]||`DeepSeek 返回 HTTP ${response.status}`);}
    const json=await response.json();const choice=json.choices?.[0];if(choice?.finish_reason!=='stop')throw Error('DeepSeek 结果不完整，未采用这批填写建议；请减少资料或稍后重试。');
    let data;try{data=JSON.parse(choice.message.content);}catch{throw Error('DeepSeek 返回了空内容或无效 JSON，请重试。');}
    return {...validateDeepseekFills(data,fields,sources,message.workflow||{}),usage:json.usage,model:json.model};
  }
  if(message.action==='evaluate'){
    const apiKey=await getApiKey();if(!apiKey)throw Error('请先在侧栏输入 API key。');
    const payload=message.payload;
    if(payload?.model!=='jev-1.13.0'||!payload.questions||Object.keys(payload.questions).length>8||JSON.stringify(payload).length>160000)throw Error('请求过大，请减少资料项。');
    let response;
    for(let attempt=0;attempt<2;attempt++){
      response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(40000),redirect:'error'});
      if(![429,529].includes(response.status)||attempt===1)break;
      const retry=Number(response.headers.get('retry-after'));await new Promise(r=>setTimeout(r,Math.min(Math.max(Number.isFinite(retry)?retry*1000:1000,1000),5000)));
    }
    if(!response.ok){const hints={401:'API key 无效或已失效',403:'账户没有访问权限',422:'请求校验失败，请减少资料或更改问题',429:'请求达到限额，请稍后再试',529:'服务繁忙，请稍后再试'};throw Error(hints[response.status]||`服务返回 HTTP ${response.status}`);}
    const json=await response.json();if(!json.answers)throw Error('服务返回了无法识别的结果');return {answers:json.answers,usage:json.usage,model:json.model};
  }
  throw Error('Unknown action');
}
let learningWrites=Promise.resolve();
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return false;
  const task=['save-learning','edit-learning'].includes(message.action)?(learningWrites=learningWrites.catch(()=>{}).then(()=>handle(message))):handle(message);
  task.then(result=>reply({ok:true,...result})).catch(error=>reply({ok:false,error:error.name==='TimeoutError'?'服务响应超时，请稍后重试':error.message||'操作失败'}));return true;
});
