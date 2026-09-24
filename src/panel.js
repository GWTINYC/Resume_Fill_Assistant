import {captureDraft,LEARN_CATEGORIES,learningProperty,factKey,learnedEntries,preferredLearned,learnedSourceAllowed} from './learned.js';
import {routeExperienceFields} from './experience-routing.js';
import {ensureRecordSlots} from './record-slots.js';
import {runCollaboration} from './collaboration.js';
import {getApiKey,setApiKey,clearApiKey,getProvider,setProvider,listMaterials,materialsSnapshot,getLearnedFacts} from './storage.js';
import {profileEntries,localMapping,defaultFieldValue,mappingPayload,optionPayload,acceptedChoice} from './core.js';
import {applicantSources,DEEPSEEK_MODEL} from './deepseek.js';
const $=id=>document.getElementById(id);
let experienceCategories=[],recordSections=[],entries=[],fields=[],plan=new Map(),tabId,token,profileSnapshot='',materialSnapshot='',savedProfile={},materials=[],provider='jev',busy=false,pageContext={},collaborationController=null;
let learnedFacts=[],learnedSnapshot='',learningDraft=[];
const usage={jev:0,deepseekInput:0,deepseekOutput:0};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function lock(value){busy=value;$('collaborate').disabled=value;$('stop-collaboration').disabled=!value||!collaborationController;for(const id of ['scan','match','fill','capture-page'])$(id).disabled=value||(!['scan','capture-page'].includes(id)&&!fields.length);for(const el of $('learning-fields').querySelectorAll('input,select,textarea'))el.disabled=value;for(const id of ['save-learning','cancel-learning'])$(id).disabled=value;for(const id of ['provider','save-key','clear-key','overwrite'])$(id).disabled=value;for(const el of $('fields').querySelectorAll('select,input,textarea'))el.disabled=value||el.dataset.unsupported==='true';}
async function message(data){const r=await chrome.runtime.sendMessage(data);if(!r?.ok)throw Error(r?.error||'扩展未响应，请重新加载');return r;}
async function profile(host){
 const {profile}=await chrome.storage.local.get('profile');savedProfile=profile||{};entries=profileEntries(savedProfile);profileSnapshot=JSON.stringify(savedProfile);materials=await listMaterials();materialSnapshot=materialsSnapshot(materials);learnedFacts=await getLearnedFacts();learnedSnapshot=JSON.stringify(learnedFacts);entries.push(...learnedEntries(learnedFacts,host));
 $('profile-info').textContent=`已保存 ${entries.length} 项资料、${materials.length} 份素材、${learnedFacts.length} 项学习资料${savedProfile.notes?'，含补充备注':''} · PDF / TXT 在本机保留`;
}
async function keyStatus(){const [jev,deepseek]=await Promise.all([getApiKey('jev'),getApiKey('deepseek')]);$('key-info').textContent=(provider==='jev'?jev:deepseek)?'已持久保存':'未设置';$('team-keys').textContent=`DeepSeek：${deepseek?'已配置':'未配置'} · Jev：${jev?'已配置':'未配置'}。配置好两套密钥后可一键启动。`;}
function providerUI(){
 $('provider').value=provider;$('match').textContent=provider==='deepseek'?'DeepSeek 智能填写':'Jev 智能匹配';$('provider-model').textContent=provider==='deepseek'?`官方接口 · ${DEEPSEEK_MODEL} · 密钥与 Jev 分开保存`:'官方接口 · jev-1.13.0 · 密钥与 DeepSeek 分开保存';
 $('data-notice').textContent=provider==='deepseek'?'点击 DeepSeek 智能填写，会将网页字段、已保存的个人资料、补充备注和启用素材的文本发送给 DeepSeek，按栏目语义匹配素材原文，提供带出处的填写建议。原始 PDF / TXT 文件不上传。':'扫描和精确名称匹配在本地进行。点击 Jev 智能匹配会发送字段名称、选项及资料项目名称；选项匹配会额外发送相关单项值。素材全文与备注不发送给 Jev。';
}
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
  if(f.supported){const select=document.createElement('select');select.setAttribute('aria-label',`${f.label} 对应的资料项`);select.append(new Option('— 不填 / 选择资料项 —',''));for(const e of entries)select.append(new Option(e.label,e.id));if(p.ai)select.append(new Option('DeepSeek 建议（可编辑）','__deepseek__'));select.value=p.ai?'__deepseek__':p.entryId;select.disabled=busy;select.addEventListener('change',()=>{if(select.value!=='__deepseek__')setEntry(f,select.value);render();});card.append(select);}
  if(p.ai&&f.supported){
    const editor=document.createElement(f.options?.length?'select':'textarea');editor.setAttribute('aria-label',`${f.label} 待填内容`);editor.disabled=busy;
    if(f.options?.length)for(const o of f.options){const option=new Option(o.label,o.value);option.disabled=o.disabled;editor.append(option);}
    else editor.maxLength=10000;
    editor.value=p.value??'';editor.onchange=()=>{p.value=defaultFieldValue(f,editor.value);p.source='手动修改 DeepSeek 建议';p.edited=true;p.result=undefined;if(p.auditDescription)p.auditDescription='已手动修改，当前值尚未经过双 AI 校核';if(p.value===null||p.value===''){p.value=null;p.checked=false;}render();};card.append(editor);
  }else{const value=document.createElement('div');value.className='value';if(!f.supported)value.textContent=f.reason;else if(p.value!==null){const label=f.options?.find(x=>x.value===p.value)?.label;value.textContent=label?`${label}（${p.value}）`:String(p.value);}else value.textContent=p.entryId?'无法直接匹配网页格式或选项，可使用智能匹配或手动填写网页。':'尚无待填内容。';card.append(value);}
  if(p.evidence?.length){const evidence=document.createElement('p');evidence.className='muted';evidence.textContent=(p.edited?'原模型依据（编辑后请重新核对）：':'资料出处：')+p.evidence.map(e=>`${e.label}「${e.quote}」`).join('；');card.append(evidence);}
  if(p.reason){const reason=document.createElement('p');reason.className='muted';reason.textContent=p.reason;card.append(reason);}
  if(p.auditDescription){const audit=document.createElement('p');audit.className='muted';audit.textContent=p.auditDescription;card.append(audit);}
  if(p.result){const r=document.createElement('p');r.className='muted';r.textContent=p.result;card.append(r);}
  $('fields').append(card);
 }updateCount();
}
function updateCount(){const count=[...plan.values()].filter(x=>x.checked&&x.value!==null).length;$('count').textContent=`${count} / ${fields.length} 项已勾选`;$('fill').disabled=busy||!count;}
function showUsage(){const parts=[];if(usage.jev)parts.push(`Jev 输入 ${usage.jev.toLocaleString()} token · 估算 $${(usage.jev*.042/1e6).toFixed(6)}`);if(usage.deepseekInput||usage.deepseekOutput)parts.push(`DeepSeek 输入 ${usage.deepseekInput.toLocaleString()} / 输出 ${usage.deepseekOutput.toLocaleString()} token`);$('usage').textContent=parts.join('；');}
$('edit-profile').onclick=()=>chrome.runtime.openOptionsPage();
function renderLearning(){
 $('learning-fields').replaceChildren();$('learning-preview').hidden=!learningDraft.length;
 $('learning-summary').textContent=`读到 ${learningDraft.length} 项非空资料。读取和保存不调用 AI；之后启动智能填写时，才按页面适用范围交给模型。`;
 for(const row of learningDraft){
  const card=document.createElement('div');card.className='field';card.dataset.learningId=row.id;
  const checkLabel=document.createElement('label');checkLabel.className='check';const checked=document.createElement('input');checked.type='checkbox';checked.checked=row.selected;checked.setAttribute('aria-label','学习 '+row.label);checked.onchange=()=>row.selected=checked.checked;const title=document.createElement('span');title.textContent=row.label;checkLabel.append(checked,title);card.append(checkLabel);
  const context=document.createElement('p');context.className='muted';context.textContent=`${row.host} · ${row.section||'未分组'}${row.record?' · 第 '+row.record+' 条':''}`;card.append(context);
  const name=document.createElement('input');name.value=row.label;name.setAttribute('aria-label','资料名称 '+row.label);name.onchange=()=>{row.label=name.value;row.property=learningProperty(row.label,row.category,row.datePart);updateNote();};card.append(name);
  const group=document.createElement('div');group.className='learning-meta';const category=document.createElement('select');category.setAttribute('aria-label','资料类目 '+row.label);category.append(...Object.entries(LEARN_CATEGORIES).map(([v,l])=>new Option(l,v)));category.value=row.category;category.onchange=()=>{row.category=category.value;row.record=['base','skills'].includes(row.category)?0:Math.max(1,row.record);row.property=learningProperty(row.label,row.category,row.datePart);record.value=row.record;updateNote();};
  const record=document.createElement('input');record.type='number';record.min='0';record.max='10';record.value=row.record;record.setAttribute('aria-label','经历序号 '+row.label);record.onchange=()=>{row.record=Number(record.value);updateNote();};
  const scope=document.createElement('select');scope.append(new Option('可用于其他网站','global'),new Option('仅当前网站','site'));scope.value=row.scope;scope.setAttribute('aria-label','适用范围 '+row.label);scope.onchange=()=>{row.scope=scope.value;updateNote();};group.append(category,record,scope);card.append(group);
  const value=document.createElement('textarea');value.value=row.value;value.maxLength=10000;value.setAttribute('aria-label','学习内容 '+row.label);value.oninput=()=>row.value=value.value;card.append(value);
  const note=document.createElement('p');note.className='muted';const updateNote=()=>{const old=learnedFacts.find(f=>factKey(f)===factKey(row));note.textContent=[row.warning,old?(old.value===row.value?'已学过相同内容，保存不会重复新增。':'将更新同一资料项；原已学内容：'+old.value):''].filter(Boolean).join(' ');};updateNote();card.append(note);
  $('learning-fields').append(card);
 }
}
$('capture-page').onclick=async()=>{lock(true);try{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:/.test(tab.url||''))throw Error('请先打开填好的网申页面。');
 await profile(new URL(tab.url).hostname);const result=await message({action:'capture',tabId:tab.id});
 fields=[];plan.clear();render();learningDraft=captureDraft(result.fields,result.host);renderLearning();status(`已读取 ${learningDraft.length} 项，请核对后勾选保存。${result.atLimit?'本页达到 300 项读取上限。':''}${result.limited?'部分框架无法访问。':''}网页未被修改，资料尚未保存。`);
}catch(e){status(e.message,true);}finally{lock(false);updateCount();}};
$('cancel-learning').onclick=()=>{learningDraft=[];renderLearning();status('已取消本次学习，没有保存资料。');};
$('save-learning').onclick=async()=>{lock(true);try{
 const facts=learningDraft.filter(f=>f.selected);if(!facts.length)throw Error('请先勾选要学习的资料。');const result=await message({action:'save-learning',facts});learningDraft=[];renderLearning();await profile();fields=[];plan.clear();render();status(`已将 ${result.count} 项确认资料保存到本机。之后填写优先参考；可在资料页编辑、停用或删除。未保存招聘页面。`);
}catch(e){status(e.message,true);}finally{lock(false);updateCount();}};

$('provider').onchange=async()=>{provider=$('provider').value;await setProvider(provider);$('api-key').value='';providerUI();await keyStatus();};
$('save-key').onclick=async()=>{const key=$('api-key').value.trim();if(!key||/\s/.test(key)||(provider==='jev'&&!key.startsWith('apikey_'))||(provider==='deepseek'&&!key.startsWith('sk-'))){status(`请输入完整的 ${provider==='deepseek'?'DeepSeek（sk- 开头）':'Jev'} 官方 API key。`,true);return;}await setApiKey(key,provider);$('api-key').value='';await keyStatus();status('当前服务的密钥已保存到本机，重启浏览器后仍可使用。');};
$('clear-key').onclick=async()=>{await clearApiKey(provider);$('api-key').value='';await keyStatus();status('已清除当前服务的密钥，另一服务的密钥保持不变。');};
async function scanCurrent(resetOverwrite=true){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:/.test(tab.url||''))throw Error('请打开普通 http/https 网申页面并点击扩展图标；浏览器设置页、PDF 预览和扩展页无法扫描。');
 await profile(new URL(tab.url).hostname);
 const r=await message({action:'scan',tabId:tab.id});tabId=tab.id;token=r.token;fields=r.fields;recordSections=r.sections||[];experienceCategories=r.experienceCategories||[];fields=routeExperienceFields(fields,applicantSources(entries,savedProfile,materials),recordSections,experienceCategories);pageContext=r.pageContext||{};plan.clear();if(resetOverwrite)$('overwrite').checked=false;
 for(const f of fields)setEntry(f,preferredLearned(f,entries).at(0)||localMapping(f,entries.filter(e=>learnedSourceAllowed(f,e)))||'','本地名称匹配');
 $('page-info').textContent=`${new URL(tab.url).hostname} · ${fields.length} 个可见字段 · ${r.frameCount} 个可访问框架`;
 status(fields.length?`扫描完成。可一键协作填写，也可使用单模型或手动操作。${r.atLimit?' 单个框架最多扫描 100 项，请分步处理。':''}${r.limited?' 部分框架不可访问。':''}`:'没有找到可见表单。自定义控件、跨域框架或 Shadow DOM 可能需要网站专用适配。');render();
}
$('scan').onclick=async()=>{lock(true);try{await scanCurrent();}catch(e){fields=[];plan.clear();render();status(e.message,true);}finally{lock(false);updateCount();}};
async function matchJev(){
 if(!entries.length)throw Error('Jev 需要结构化资料项，请先整理并保存，再重新扫描；直接使用素材全文可切换到 DeepSeek。');
 let mapped=0;const pending=fields.filter(f=>f.supported&&!plan.get(f.id)?.entryId&&!plan.get(f.id)?.ai);
 for(let i=0;i<pending.length;i+=6){const chunk=pending.slice(i,i+6);status(`Jev 正在识别字段 ${i+1}–${Math.min(i+6,pending.length)} / ${pending.length}…`);const r=await message({action:'evaluate',payload:mappingPayload(chunk,entries)});usage.jev+=r.usage?.input_tokens||0;
  chunk.forEach((f,j)=>{const a=r.answers['q'+j];const id=acceptedChoice(a,entries.map(x=>x.id));if(id&&learnedSourceAllowed(f,entries.find(e=>e.id===id))){setEntry(f,id,`Jev · confidence ${a.confidence.toFixed(2)}`);mapped++;}else setEntry(f,'','Jev 不确定，需手动选择',false);});
 }
 const optionItems=fields.filter(f=>f.supported&&f.options?.length&&plan.get(f.id)?.entryId&&plan.get(f.id)?.value===null).map(f=>({id:f.id,field:f,profileValue:entries.find(e=>e.id===plan.get(f.id).entryId).value}));
 for(let i=0;i<optionItems.length;i+=6){const chunk=optionItems.slice(i,i+6);status(`Jev 正在匹配第 ${i+1} 批选项…`);const r=await message({action:'evaluate',payload:optionPayload(chunk)});usage.jev+=r.usage?.input_tokens||0;
  chunk.forEach((x,j)=>{const a=r.answers['q'+j];const id=acceptedChoice(a,x.field.options.map((_,k)=>'o'+k));if(id){const option=x.field.options[Number(id.slice(1))];if(!option.disabled&&option.value!==''){const p=plan.get(x.id);p.value=option.value;p.source+=` · 选项 confidence ${a.confidence.toFixed(2)}`;p.checked=!x.field.hasValue||$('overwrite').checked;}}});
 }
 status(`匹配完成，新增识别 ${mapped} 个字段。请逐项核对后再填入；0.80 的概率/置信度门槛不是准确率保证。`);
}
async function matchDeepseek(){
 const sources=applicantSources(entries,savedProfile,materials);
 if(!sources.length)throw Error('请先导入 PDF / TXT，或保存个人资料与备注，再重新扫描。');
 const pending=fields.filter(f=>f.supported&&!plan.get(f.id)?.edited&&(plan.get(f.id)?.value===null||plan.get(f.id)?.ai));
 let accepted=0,rejected=0;
 for(let i=0;i<pending.length;i+=12){const chunk=pending.slice(i,i+12);status(`DeepSeek 正在识别字段与读取素材 ${i+1}–${Math.min(i+12,pending.length)} / ${pending.length}…`);const r=await message({action:'deepseek-fill',fields:chunk,sources});usage.deepseekInput+=r.usage?.prompt_tokens||0;usage.deepseekOutput+=r.usage?.completion_tokens||0;rejected+=r.rejected;
  for(const f of chunk)if(plan.get(f.id)?.ai)setEntry(f,'','DeepSeek 未提供可验证建议',false);
  for(const item of r.fills){const f=fields.find(x=>x.id===item.fieldId);if(!f)continue;plan.set(f.id,{entryId:'',value:item.value,source:'DeepSeek 建议',ai:true,evidence:item.evidence,reason:item.reason,checked:!f.hasValue||$('overwrite').checked});accepted++;}
 }
 status(`匹配完成，DeepSeek 提供 ${accepted} 项有出处的建议${rejected?`，过滤 ${rejected} 项无效建议`:''}。请核对内容与对应经历，再点击填入；出处存在不代表判断必然正确。`);
}
$('match').onclick=async()=>{lock(true);try{
 if(JSON.stringify(await getLearnedFacts())!==learnedSnapshot)throw Error('已学习资料发生变化，请重新扫描。');
 if(!await getApiKey(provider))throw Error(`请先保存 ${provider==='deepseek'?'DeepSeek':'Jev'} 官方 API key。`);
 if(provider==='deepseek')await matchDeepseek();else await matchJev();
 }catch(e){status(e.message+' 已完成的匹配会保留，请核对后再使用。',true);}finally{lock(false);render();showUsage();}};
$('overwrite').onchange=()=>{if(!$('overwrite').checked)for(const f of fields)if(f.hasValue)plan.get(f.id).checked=false;render();};
$('fill').onclick=async()=>{lock(true);try{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id!==tabId)throw Error('当前标签页与预览不一致，请在目标页面重新扫描。');
 const {profile}=await chrome.storage.local.get('profile');if(JSON.stringify(profile||{})!==profileSnapshot)throw Error('个人资料已更新，请重新扫描以刷新预览。');
 if(JSON.stringify(await getLearnedFacts())!==learnedSnapshot)throw Error('已学习资料发生变化，请重新扫描。');
 const items=fields.filter(f=>plan.get(f.id)?.checked&&plan.get(f.id)?.value!==null).map(f=>({...f,value:plan.get(f.id).value}));if(!items.length)throw Error('请勾选要填入的字段。');
 if(items.some(f=>plan.get(f.id)?.ai)&&materialsSnapshot(await listMaterials())!==materialSnapshot)throw Error('简历素材或使用设置已变化，请重新扫描并识别。');
 const r=await message({action:'fill',tabId,token,overwrite:$('overwrite').checked,items});for(const x of r.results){const p=plan.get(x.id);if(p){p.result=x.reason;p.checked=false;}}
 status(`已填入 ${r.results.filter(x=>x.ok).length} 项，跳过或失败 ${r.results.filter(x=>!x.ok).length} 项。请检查网页上的内容及校验提示，再自行继续网申。`);
 }catch(e){status(e.message,true);}finally{lock(false);render();}};
function showCollaboration(progress){
 for(const record of progress.records){
  if(!record.proposal){const current=plan.get(record.fieldId);if(current){current.checked=false;current.result=record.status==='needs_review'?record.reason:undefined;}continue;}
  const labels={checking:'等待 Jev 校核',approved:'Jev 校核通过',needs_review:'需人工核对',filled:'协作已填入',failed:'网页核验未通过'};
  const p={entryId:'',value:record.proposal.value,source:labels[record.status]||'协作草案',ai:true,evidence:record.proposal.evidence,reason:record.proposal.reason,checked:false,result:record.reason};
  if(record.review){const r=record.review;p.auditDescription=`${r.policy==='passage'?'原文段落':r.policy==='fact'?'事实字段':'类型不明确'} · ${r.approved?'Jev 已校核栏目对应、原文完整性和素材冲突':'Jev 校核存在疑问'}${record.history.at(-1)?.round>1?' · 已修正复核':''}`;}
  plan.set(record.fieldId,p);
 }
 status(progress.message);render();showUsage();
}
$('stop-collaboration').onclick=()=>{collaborationController?.abort();$('stop-collaboration').disabled=true;status('正在停止：当前请求可能仍会完成，但不会开始新的步骤；已填内容保留。');};
$('collaborate').onclick=async()=>{
 collaborationController=new AbortController();const controller=collaborationController;lock(true);
 try{
  const keys=await Promise.all([getApiKey('deepseek'),getApiKey('jev')]);if(!keys[0]||!keys[1])throw Error(`一键协作需要两套密钥，请先配置${!keys[0]?' DeepSeek':''}${!keys[1]?' Jev':''}。`);
  if(controller.signal.aborted)throw new DOMException('协作已停止','AbortError');
  await scanCurrent(false);const sources=applicantSources(entries,savedProfile,materials);if(!sources.length)throw Error('请先导入素材或保存个人资料，再启动协作。');
  const overwrite=$('overwrite').checked;
  const assertFresh=async()=>{if(controller.signal.aborted)throw new DOMException('协作已停止；已填内容保留。','AbortError');const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id!==tabId)throw Error('当前标签页已切换，已停止协作填写。');const {profile}=await chrome.storage.local.get('profile');if(JSON.stringify(profile||{})!==profileSnapshot||materialsSnapshot(await listMaterials())!==materialSnapshot||JSON.stringify(await getLearnedFacts())!==learnedSnapshot)throw Error('个人资料或素材已变化，请重新启动协作。');};
  const prepared=await ensureRecordSlots({sources,sections:recordSections,fields,knownCategories:experienceCategories,assertFresh,onProgress:text=>status(text),
    add:(section,target)=>message({action:'add-record',tabId,token,frameId:section.frameId,sectionId:section.localId,target}),
    rescan:async()=>{const r=await message({action:'scan',tabId});token=r.token;fields=r.fields;recordSections=r.sections||[];experienceCategories=r.experienceCategories||[];fields=routeExperienceFields(fields,applicantSources(entries,savedProfile,materials),recordSections,experienceCategories);pageContext=r.pageContext||{};plan.clear();for(const f of fields)setEntry(f,preferredLearned(f,entries).at(0)||localMapping(f,entries.filter(e=>learnedSourceAllowed(f,e)))||'','新增后重新扫描');render();return recordSections;}
  });
  const result=await runCollaboration({fields,sources,entries,pageContext,overwrite,signal:controller.signal,assertFresh,onProgress:showCollaboration,
    draft:async(batch,workflow)=>{const r=await message({action:'deepseek-fill',fields:batch,sources,workflow});usage.deepseekInput+=r.usage?.prompt_tokens||0;usage.deepseekOutput+=r.usage?.completion_tokens||0;return r;},
    judge:async payload=>{const r=await message({action:'evaluate',payload});usage.jev+=r.usage?.input_tokens||0;return r;},
    apply:async(f,value)=>{const items=[{...f,value}];const written=await message({action:'fill',tabId,token,overwrite,items});const first=written.results?.find(x=>x.id===f.id);if(!first?.ok)return {ok:false,reason:first?.reason||'网页未返回填写结果'};await new Promise(resolve=>setTimeout(resolve,250));const verified=await message({action:'verify',tabId,token,items});return verified.results?.find(x=>x.id===f.id)||{ok:false,reason:'无法核验网页值，请手动检查'};}
  });
  const count=state=>result.filter(x=>x.status===state).length;status(`协作完成：已填入并核验 ${count('filled')} 项，待人工核对 ${count('needs_review')} 项，填写失败 ${count('failed')} 项，跳过 ${count('skipped')} 项。${prepared.added?`已自动新增 ${prepared.added} 组经历。`:""}已保留出处与校核结果，请检查后自行提交。`);
 }catch(e){status(e.message+(e.name==='AbortError'?'':' 尚未执行的字段不会自动填入。'),e.name!=='AbortError');}
 finally{collaborationController=null;lock(false);for(const p of plan.values())p.checked=false;render();showUsage();await keyStatus();}
};
provider=await getProvider();providerUI();await profile();await keyStatus();
