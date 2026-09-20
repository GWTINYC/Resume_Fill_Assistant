import {getApiKey,setApiKey,clearApiKey} from './storage.js';
import {profileEntries,localMapping,defaultFieldValue,mappingPayload,optionPayload,acceptedChoice} from './core.js';
const $=id=>document.getElementById(id);let entries=[],fields=[],plan=new Map(),tabId,token,profileSnapshot='',inputTokens=0,busy=false;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function lock(value){busy=value;for(const id of ['scan','match','fill'])$(id).disabled=value||(id!=='scan'&&!fields.length);for(const el of $('fields').querySelectorAll('select,input'))el.disabled=value||el.dataset.unsupported==='true';}
async function message(data){const r=await chrome.runtime.sendMessage(data);if(!r?.ok)throw Error(r?.error||'扩展未响应，请重新加载');return r;}
async function profile(){const {profile}=await chrome.storage.local.get('profile');entries=profileEntries(profile||{});profileSnapshot=JSON.stringify(profile||{});$('profile-info').textContent=entries.length?`已保存 ${entries.length} 项资料 · 经历按最新优先排列`:'尚未保存资料。PDF 可在资料页本地读取。';}
async function keyStatus(){const apiKey=await getApiKey();$('key-info').textContent=apiKey?'已持久保存':'未设置';}
function setEntry(field,id,source='手动选择',checked=true){
 const e=entries.find(x=>x.id===id);const value=e?defaultFieldValue(field,e.value):null;
 plan.set(field.id,{entryId:id||'',value,source,checked:!!e&&value!==null&&field.supported&&(!field.hasValue||$('overwrite').checked)&&checked});
}
function render(){
 $('preview').hidden=!fields.length;$('fields').replaceChildren();
 for(const f of fields){
  const p=plan.get(f.id)||{entryId:'',value:null,checked:false};const card=document.createElement('div');card.className='field';
  const heading=document.createElement('label');heading.className='check';const check=document.createElement('input');check.type='checkbox';check.checked=p.checked;check.disabled=!f.supported||p.value===null||busy;check.dataset.unsupported=String(!f.supported||p.value===null);check.setAttribute('aria-label',`填入 ${f.label}`);check.addEventListener('change',()=>{p.checked=check.checked;updateCount();});const title=document.createElement('span');title.className='field-title';title.textContent=f.label;heading.append(check,title);card.append(heading);
  const meta=document.createElement('div');meta.className='field-meta';meta.textContent=[f.context,f.type,f.required?'必填':'',f.hasValue?'已有内容':'',p.source||'未匹配'].filter(Boolean).join(' · ');card.append(meta);
  if(f.supported){const select=document.createElement('select');select.setAttribute('aria-label',`${f.label} 对应的资料项`);select.append(new Option('— 不填 / 选择资料项 —',''));for(const e of entries)select.append(new Option(e.label,e.id));select.value=p.entryId;select.disabled=busy;select.addEventListener('change',()=>{setEntry(f,select.value);render();});card.append(select);}
  const value=document.createElement('div');value.className='value';
  if(!f.supported)value.textContent=f.reason;
  else if(p.value!==null){const label=f.options?.find(x=>x.value===p.value)?.label;value.textContent=label?`${label}（${p.value}）`:String(p.value);}
  else value.textContent=p.entryId?'无法直接匹配网页格式或选项。可点击 Jev 智能匹配，或手动填写网页。':'尚无待填内容。';card.append(value);
  if(p.result){const r=document.createElement('p');r.className='muted';r.textContent=p.result;card.append(r);}
  $('fields').append(card);
 }updateCount();
}
function updateCount(){const count=[...plan.values()].filter(x=>x.checked&&x.value!==null).length;$('count').textContent=`${count} / ${fields.length} 项已勾选`;$('fill').disabled=busy||!count;}
$('edit-profile').onclick=()=>chrome.runtime.openOptionsPage();
$('save-key').onclick=async()=>{const key=$('api-key').value.trim();if(!key.startsWith('apikey_')||/\s/.test(key)){status('请输入完整的官方 API key。',true);return;}await setApiKey(key);$('api-key').value='';await keyStatus();status('密钥已保存到本机，重启浏览器后仍可使用。');};
$('clear-key').onclick=async()=>{await clearApiKey();$('api-key').value='';await keyStatus();status('已清除本机保存的密钥。');};
$('scan').onclick=async()=>{lock(true);try{
 await profile();const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:/.test(tab.url||''))throw Error('请打开普通 http/https 网申页面并点击扩展图标；浏览器设置页、PDF 预览和扩展页无法扫描。');
 const r=await message({action:'scan',tabId:tab.id});tabId=tab.id;token=r.token;fields=r.fields;plan.clear();$('overwrite').checked=false;
 for(const f of fields)setEntry(f,localMapping(f,entries)||'','本地名称匹配');
 $('page-info').textContent=`${new URL(tab.url).hostname} · ${fields.length} 个可见字段 · ${r.frameCount} 个可访问框架`;
 status(fields.length?`扫描完成。先核对本地匹配，或使用 Jev 识别不同的字段名称。${r.atLimit?' 单个框架最多扫描 100 项，后续内容请分步处理。':''}${r.limited?' 部分框架不可访问。':''}`:'没有找到可见表单。自定义控件、跨域框架或 Shadow DOM 可能需要网站专用适配。');render();
 }catch(e){fields=[];plan.clear();render();status(e.message,true);}finally{lock(false);updateCount();}};
$('match').onclick=async()=>{lock(true);let mapped=0;try{
 if(!entries.length)throw Error('请先保存个人资料，然后重新扫描。');
 const apiKey=await getApiKey();if(!apiKey)throw Error('请先设置官方 API key。');
 const pending=fields.filter(f=>f.supported&&!plan.get(f.id)?.entryId);
 for(let i=0;i<pending.length;i+=6){const chunk=pending.slice(i,i+6);status(`Jev 正在识别字段 ${i+1}–${Math.min(i+6,pending.length)} / ${pending.length}…`);const r=await message({action:'evaluate',payload:mappingPayload(chunk,entries)});inputTokens+=r.usage?.input_tokens||0;
  chunk.forEach((f,j)=>{const a=r.answers['q'+j];const id=acceptedChoice(a,entries.map(x=>x.id));if(id){setEntry(f,id,`Jev · confidence ${a.confidence.toFixed(2)}`);mapped++;}else{setEntry(f,'','Jev 不确定，需手动选择',false);}});
 }
 const optionItems=fields.filter(f=>f.supported&&f.options?.length&&plan.get(f.id)?.entryId&&plan.get(f.id)?.value===null).map(f=>({id:f.id,field:f,profileValue:entries.find(e=>e.id===plan.get(f.id).entryId).value}));
 for(let i=0;i<optionItems.length;i+=6){const chunk=optionItems.slice(i,i+6);status(`Jev 正在匹配 ${i+1}–${Math.min(i+6,optionItems.length)} 项下拉或单选值…`);const r=await message({action:'evaluate',payload:optionPayload(chunk)});inputTokens+=r.usage?.input_tokens||0;
  chunk.forEach((x,j)=>{const a=r.answers['q'+j];const id=acceptedChoice(a,x.field.options.map((_,k)=>'o'+k));if(id){const option=x.field.options[Number(id.slice(1))];if(!option.disabled&&option.value!==''){const p=plan.get(x.id);p.value=option.value;p.source+=` · 选项 confidence ${a.confidence.toFixed(2)}`;p.checked=!x.field.hasValue||$('overwrite').checked;}}});
 }
 status(`匹配完成，新增识别 ${mapped} 个字段。请逐项核对后再填入；0.80 的概率/置信度门槛只是初始设置，不代表准确率保证。`);
 }catch(e){status(e.message+' 已完成的匹配会保留，请核对后再使用。',true);}finally{lock(false);render();$('usage').textContent=`本次侧栏累计输入 ${inputTokens.toLocaleString()} token · 按标价估算 $${(inputTokens*.042/1e6).toFixed(6)}`;}};
$('overwrite').onchange=()=>{if(!$('overwrite').checked)for(const f of fields)if(f.hasValue)plan.get(f.id).checked=false;render();};
$('fill').onclick=async()=>{lock(true);try{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id!==tabId)throw Error('当前标签页与预览不一致，请在目标页面重新扫描。');
 const {profile}=await chrome.storage.local.get('profile');if(JSON.stringify(profile||{})!==profileSnapshot)throw Error('个人资料已更新，请重新扫描以刷新预览。');
 const items=fields.filter(f=>plan.get(f.id)?.checked&&plan.get(f.id)?.value!==null).map(f=>({...f,value:plan.get(f.id).value}));if(!items.length)throw Error('请勾选要填入的字段。');
 const r=await message({action:'fill',tabId,token,overwrite:$('overwrite').checked,items});for(const x of r.results){const p=plan.get(x.id);if(p){p.result=x.reason;p.checked=false;}}
 status(`已填入 ${r.results.filter(x=>x.ok).length} 项，跳过或失败 ${r.results.filter(x=>!x.ok).length} 项。请检查网页上的内容及校验提示，再自行继续网申。`);
 }catch(e){status(e.message,true);}finally{lock(false);render();}};
await profile();await keyStatus();
