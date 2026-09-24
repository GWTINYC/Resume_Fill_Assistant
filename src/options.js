import {AppError,importDiagnostic,diagnosticEnvironment} from './diagnostics.js';
import {validateLearnedFacts,LEARN_CATEGORIES} from './learned.js';
import {listMaterials,saveMaterial,deleteMaterial,clearMaterials,getLearnedFacts,setLearnedFacts} from './storage.js';
import {decodeText} from './text-material.js';
import {BASE_FIELDS,RECORD_FIELDS,emptyProfile,basicFromText} from './core.js';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdf.worker.mjs');
const $=id=>document.getElementById(id);let pendingLearnedImport=null;let profile=emptyProfile(),savedResume=null,materials=[],activeId='',pdfBusy=false;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function fieldInput(label,key,value,group,index){const wrapper=document.createElement('label');wrapper.textContent=label;const input=document.createElement(key==='description'||key==='value'?'textarea':'input');input.value=value||'';input.dataset.key=key;input.dataset.group=group;if(index!==undefined)input.dataset.index=index;input.autocomplete='off';input.maxLength=10000;wrapper.append(input);return wrapper;}
function read(){const out=emptyProfile();out.notes=$('notes').value;for(const group of ['education','work','custom'])out[group]=profile[group].map(()=>({}));for(const el of document.querySelectorAll('[data-key]')){const {group,key,index}=el.dataset;const target=group==='base'?out.base:out[group][Number(index)];target[key]=el.value.trim();}return out;}
function render(){
 $('notes').value=profile.notes||'';
 $('base-fields').replaceChildren(...BASE_FIELDS.map(([key,label])=>fieldInput(label,key,profile.base[key],'base')));
 for(const group of ['education','work','custom']){
  $(group).replaceChildren();profile[group].forEach((row,i)=>{const card=document.createElement('div');card.className='record';const heading=document.createElement('div');heading.className='row between';const title=document.createElement('h3');title.textContent=`${group==='education'?'教育经历':group==='work'?'工作经历':'自定义项'} ${i+1}`;const remove=document.createElement('button');remove.textContent='移除';remove.className='small';remove.onclick=()=>{profile=read();profile[group].splice(i,1);render();status('已移除，点击保存后生效。');};heading.append(title,remove);card.append(heading);const grid=document.createElement('div');grid.className='grid';for(const [key,label]of(group==='custom'?[['label','项目名称'],['value','内容']]:RECORD_FIELDS[group]))grid.append(fieldInput(label,key,row[key],group,i));card.append(grid);$(group).append(card);});
 }
}
for(const group of ['education','work','custom'])$('add-'+group).onclick=()=>{profile=read();if(profile[group].length>=(group==='custom'?40:10)){status('已达到首版支持的记录数量上限。',true);return;}profile[group].push({});render();};
$('save').onclick=async()=>{profile=read();await chrome.storage.local.set({profile});if(pendingLearnedImport!==null){await setLearnedFacts(pendingLearnedImport);pendingLearnedImport=null;await renderLearned();}status('个人资料已保存到当前浏览器。返回侧栏重新扫描即可使用。');};
$('export').onclick=async()=>{const {profile:saved}=await chrome.storage.local.get('profile');const learnedFacts=await getLearnedFacts();if(!saved&&!learnedFacts.length){status('请先保存个人资料。',true);return;}const url=URL.createObjectURL(new Blob([JSON.stringify({...saved||emptyProfile(),learnedFacts},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='jev-apply-profile.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已导出资料。文件包含个人信息，请自行妥善保存。');};
$('import').onclick=()=>$('json-file').click();
function validated(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('资料 JSON 格式不正确');const out=emptyProfile();
 const value=x=>{if(x===undefined||x===null)return '';if(typeof x!=='string'||x.length>10000)throw Error('资料值须为不超过 10,000 字符的文本');return x;};
 out.notes=value(raw.notes);
 for(const [key]of BASE_FIELDS)out.base[key]=value(raw.base?.[key]);
 for(const group of ['education','work','custom']){if(raw[group]!==undefined&&!Array.isArray(raw[group]))throw Error('经历格式不正确');if((raw[group]||[]).length>(group==='custom'?40:10))throw Error('经历或自定义项过多');out[group]=(raw[group]||[]).map(row=>{if(!row||typeof row!=='object')throw Error('经历格式不正确');return Object.fromEntries((group==='custom'?[['label'],['value']]:RECORD_FIELDS[group]).map(([key])=>[key,value(row[key])]))});}return out;
}
$('json-file').onchange=async event=>{let stage='检查资料文件';try{const f=event.target.files[0];if(!f)return;if(!f.name.toLowerCase().endsWith('.json'))throw Error('[PROFILE_TYPE] 这个按钮用于导入资料 JSON。TXT / PDF 请使用页面顶部“简历素材”的文件选择框。');if(f.size>1000000)throw Error('[PROFILE_SIZE] 资料 JSON 超过 1 MB，请检查是否选错了文件。');stage='读取资料文件';const text=await f.text();stage='解析 JSON';let raw;try{raw=JSON.parse(text);}catch{throw Error('[PROFILE_JSON] 文件不是有效的资料 JSON。请使用插件导出的 JSON；TXT 素材从顶部导入。');}stage='校验资料格式';const imported=validated(raw),learned=raw.learnedFacts?validateLearnedFacts(raw.learnedFacts):null;profile=imported;pendingLearnedImport=learned;render();status('资料已导入预览，请核对后点击保存。'+(pendingLearnedImport?'保存时也会替换已学习资料，共 '+pendingLearnedImport.length+' 项。':''));}catch(e){status(`资料导入失败（${stage}）：${stage==='读取资料文件'?'[PROFILE_READ] 无法读取文件，请先下载到本机后重新选择。':e.message}`,true);}event.target.value='';};
async function refreshResume(preferredId=activeId){
 materials=await listMaterials();savedResume=materials.find(x=>x.id===preferredId)||materials.at(-1)||null;activeId=savedResume?.id||'';
 $('saved-pdf').hidden=!savedResume;$('material-select').replaceChildren(...materials.map(m=>new Option(`${m.name}${m.enabled===false?'（不发送）':''}`,m.id)));$('material-select').value=activeId;
 $('pdf-text').textContent=savedResume?.text||'';$('pdf-details').hidden=!savedResume?.text;
 $('material-enabled').checked=savedResume?.enabled!==false;
 $('pdf-info').textContent=savedResume?`${materials.length} 份素材 · ${savedResume.name} · ${(savedResume.size/1024).toFixed(1)} KB · ${new Date(savedResume.savedAt).toLocaleString()} 已保存${savedResume.encoding?' · '+savedResume.encoding:''}${savedResume.parseError?' · 文本解析未完成':''}`:'';
}
function resumeURL(){if(!savedResume)throw Error('没有已保存的素材');return URL.createObjectURL(savedResume.blob);}
$('material-select').onchange=()=>refreshResume($('material-select').value).catch(e=>status(e.message,true));
$('material-enabled').onchange=async()=>{if(!savedResume)return;try{const {id,...record}=savedResume;await saveMaterial({...record,enabled:$('material-enabled').checked},id);await refreshResume(id);status('素材使用设置已保存。');}catch(e){status(e.message,true);}};
$('view-pdf').onclick=()=>{try{const url=resumeURL();window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){status(e.message,true);}};
$('download-pdf').onclick=()=>{try{const url=resumeURL();const link=document.createElement('a');link.href=url;link.download=savedResume.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){status(e.message,true);}};
$('replace-material').onclick=()=>$('replace-file').click();
$('delete-pdf').onclick=async()=>{if(pdfBusy||!savedResume||!confirm('删除选中的本地素材及其提取文本？其他素材、个人资料和备注会保留。'))return;try{await deleteMaterial(activeId);await refreshResume();status('已删除选中的素材，其他资料与备注仍保留。');}catch(e){status(e.message,true);}};
$('clear').onclick=async()=>{if(pdfBusy||!confirm('清除当前浏览器中保存的个人资料、已学习资料、零散备注和全部 PDF / TXT 素材？各服务的 API key 可在侧栏单独清除。'))return;try{await clearMaterials();await chrome.storage.local.remove(['profile','learnedFacts']);pendingLearnedImport=null;await renderLearned();profile=emptyProfile();render();await refreshResume();status('已清除个人资料、备注和全部素材。');}catch(e){status('清除未完成：'+e.message,true);}};
async function importMaterial(file,replaceId){
 let task,doc,record,persisted=false,textReady=false,stage='validate',id=replaceId||crypto.randomUUID();
 const kind=file.name.toLowerCase().endsWith('.txt')?'txt':file.name.toLowerCase().endsWith('.pdf')?'pdf':null;
 try{
  if(!kind)throw new AppError('FILE_TYPE','仅支持 PDF 和 TXT 文件。');
  if(file.size>(kind==='pdf'?20:2)*1024*1024)throw new AppError('FILE_SIZE',`${kind.toUpperCase()} 超过大小上限。`);
  stage='read';
  if(kind==='pdf'&&!(await file.slice(0,1024).text()).includes('%PDF-'))throw new AppError('PDF_FORMAT','不是可识别的 PDF，未替换原有素材。');
  const bytes=kind==='txt'?new Uint8Array(await file.arrayBuffer()):null;stage='decode';
  const decoded=bytes?decodeText(bytes):null;
  record={name:file.name,size:file.size,kind,enabled:replaceId?(materials.find(m=>m.id===replaceId)?.enabled!==false):true,savedAt:new Date().toISOString(),blob:new Blob([file],{type:kind==='pdf'?'application/pdf':`text/plain;charset=${decoded.encoding}`}),text:decoded?.text||'',encoding:decoded?.encoding||'',pages:null,parseError:kind==='pdf'?'等待解析':''};
  stage='store';await saveMaterial(record,id);persisted=true;textReady=kind==='txt';stage='load';await refreshResume(id);
  let text=decoded?.text;
  if(kind==='pdf'){
    stage='read';const pdfBytes=new Uint8Array(await file.arrayBuffer());stage='pdf';
    task=getDocument({data:pdfBytes,isEvalSupported:false,cMapUrl:chrome.runtime.getURL('vendor/cmaps/'),cMapPacked:true,standardFontDataUrl:chrome.runtime.getURL('vendor/standard_fonts/'),wasmUrl:chrome.runtime.getURL('vendor/wasm/'),useSystemFonts:true});
    task.onPassword=()=>{task.destroy();};doc=await task.promise;if(doc.numPages>40)throw new AppError('PDF_PAGES','PDF 超过 40 页，仅保存原文件，未提取文本。');
    const pages=[];for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const content=await page.getTextContent();let previousY,lines='';for(const item of content.items){if(!('str'in item))continue;const y=item.transform?.[5];if(previousY!==undefined&&Math.abs(y-previousY)>3)lines+='\n';lines+=item.str+(item.hasEOL?'\n':' ');previousY=y;}pages.push(lines);}
    text=pages.join('\n\n').trim();if(!text)throw new AppError('PDF_EMPTY','没有读取到文本层。扫描版 PDF 请先 OCR，或导入 TXT。');
    record={...record,text,pages:doc.numPages,parseError:''};stage='storeText';await saveMaterial(record,id);textReady=true;stage='load';await refreshResume(id);
  }
  stage='profile';$('pdf-details').open=true;profile=read();const basic=basicFromText(text);let added=0;for(const [k,v]of Object.entries(basic))if(!profile.base[k]){profile.base[k]=v;added++;}render();
  return `${kind==='pdf'?`已本地读取 ${doc.numPages} 页`:'已本地读取 TXT'}：${file.name}。原文件与文本已持久保存，补入 ${added} 项基础信息，请核对后保存个人资料。`;
 }catch(e){
  if(kind==='pdf'&&stage==='pdf'&&/password|destroy/i.test(e.message))e=new AppError('PDF_PASSWORD','PDF 需要密码。');
  const failure=importDiagnostic(e,{stage,file,persisted,textReady},diagnosticEnvironment());
  if(persisted&&!textReady&&stage==='pdf')try{await saveMaterial({...record,parseError:failure.message},id);await refreshResume(id);}catch{}
  const error=new Error(`${file.name}：${failure.message}`);error.diagnostic=failure.report;throw error;
 }finally{if(task)await task.destroy().catch(()=>{});}
}
async function importFiles(event,replace=false){
 const files=Array.from(event.target.files||[]);if(!files.length)return;pdfBusy=true;
 for(const name of ['pdf-file','replace-file','replace-material','delete-pdf','clear','material-select','material-enabled'])$(name).disabled=true;
 const messages=[],reports=[];$('import-diagnostic').hidden=true;let errors=false;try{for(const file of files){status(`正在本地读取 ${file.name}…`);try{messages.push(await importMaterial(file,replace?activeId:undefined));}catch(e){errors=true;messages.push(e.message);if(e.diagnostic)reports.push(e.diagnostic);}}status(messages.join('\n'),errors);if(reports.length){$('diagnostic-text').value=JSON.stringify(reports,null,2);$('import-diagnostic').hidden=false;}}finally{pdfBusy=false;event.target.value='';for(const name of ['pdf-file','replace-file','replace-material','delete-pdf','clear','material-select','material-enabled'])$(name).disabled=false;}
}
$('pdf-file').onchange=event=>importFiles(event);
$('replace-file').onchange=event=>importFiles(event,true);
const saved=await chrome.storage.local.get('profile');if(saved.profile){try{profile=validated(saved.profile);}catch{status('已保存资料格式异常，请重新导入。',true);}}render();
try{await refreshResume();}catch{status('无法读取本地素材，请检查浏览器设置。',true);}

async function renderLearned(){
 const rows=await getLearnedFacts();$('learned-facts').replaceChildren();
 if(!rows.length){$('learned-facts').textContent='还没有学习资料。到填好的网申页，在侧栏点击“读取已填页面”。';return;}
 for(const f of rows){
  const card=document.createElement('div');card.className='record';card.dataset.learnedId=f.id;
  const title=document.createElement('h3');title.textContent=`${LEARN_CATEGORIES[f.category]}${f.record?' 第 '+f.record+' 条':''} · ${f.label}`;
  const meta=document.createElement('p');meta.className='muted';meta.textContent=`来源：${f.host} · ${f.scope==='site'?'仅用于该网站':'可用于其他网站'} · ${f.savedAt?new Date(f.savedAt).toLocaleString():''}`;
  const value=document.createElement('textarea');value.value=f.value;value.maxLength=10000;value.setAttribute('aria-label','已学习 '+f.label);
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=f.enabled;const enabledLabel=document.createElement('label');enabledLabel.className='check';enabledLabel.append(enabled,document.createTextNode('用于之后的自动填写'));
  const save=document.createElement('button');save.textContent='保存这项';save.className='small';const remove=document.createElement('button');remove.textContent='删除这项';remove.className='small danger';
  const update=async del=>{save.disabled=remove.disabled=true;try{const r=await chrome.runtime.sendMessage({action:'edit-learning',id:f.id,remove:del,value:value.value,enabled:enabled.checked});if(!r?.ok)throw Error(r?.error||'保存失败');await renderLearned();status(del?'已删除该学习资料，原有简历素材保留。':'已更新该学习资料。');}catch(e){status(e.message,true);save.disabled=remove.disabled=false;}};
  save.onclick=()=>update(false);remove.onclick=()=>{if(confirm('删除这项已学习资料？原有简历素材和其他资料保留。'))update(true);};
  card.append(title,meta,value,enabledLabel,save,remove);$('learned-facts').append(card);
 }
}
await renderLearned();

$('copy-diagnostic').onclick=async()=>{try{await navigator.clipboard.writeText($('diagnostic-text').value);$('copy-diagnostic').textContent='诊断信息已复制';}catch{$('diagnostic-text').select();status('无法自动复制，已选中诊断信息，请按 Ctrl+C / Command+C。',true);}};
