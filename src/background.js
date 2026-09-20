import {pageBridge} from './page.js';
import {getApiKey} from './storage.js';
chrome.action.onClicked.addListener(tab=>{if(tab.windowId!==undefined)chrome.sidePanel.open({windowId:tab.windowId}).catch(()=>{});});
async function inject(tabId,args,frameIds){
  if(!Number.isInteger(tabId))throw Error('请先打开一个网申页面，再点击扩展图标。');
  return chrome.scripting.executeScript({target:frameIds?{tabId,frameIds}:{tabId,allFrames:true},func:pageBridge,args:[args]});
}
async function handle(message){
  if(message.action==='scan'){
    const token=crypto.randomUUID();let results,limited=false;
    try{results=await inject(message.tabId,{action:'scan',token});}
    catch{results=await inject(message.tabId,{action:'scan',token},[0]);limited=true;}
    const fields=results.flatMap(r=>(r.result?.fields||[]).map(f=>({...f,localId:f.id,id:`${r.frameId}:${f.id}`,frameId:r.frameId})));
    return {token,fields,limited,atLimit:results.some(r=>r.result?.atLimit),frameCount:results.length};
  }
  if(message.action==='fill'){
    const frames=new Map();for(const item of message.items){if(!frames.has(item.frameId))frames.set(item.frameId,[]);frames.get(item.frameId).push({id:item.localId,value:item.value});}
    const all=[];
    for(const [frameId,items]of frames){
      try{const out=await inject(message.tabId,{action:'fill',token:message.token,overwrite:message.overwrite===true,items},[frameId]);for(const r of out)all.push(...(r.result?.results||[]).map(x=>({...x,id:`${frameId}:${x.id}`})));}
      catch{all.push(...items.map(x=>({id:`${frameId}:${x.id}`,ok:false,reason:'无法访问该框架，请重新扫描'})));}
    }
    return {results:all};
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
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return false;
  handle(message).then(result=>reply({ok:true,...result})).catch(error=>reply({ok:false,error:error.name==='TimeoutError'?'服务响应超时，请稍后重试':error.message||'操作失败'}));return true;
});
