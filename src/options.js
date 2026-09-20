import {getResume,saveResume,deleteResume} from './storage.js';
import {BASE_FIELDS,RECORD_FIELDS,emptyProfile,basicFromText} from './core.js';
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdf.worker.mjs');
const $=id=>document.getElementById(id);let profile=emptyProfile(),savedResume=null,pdfBusy=false;
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
$('save').onclick=async()=>{profile=read();await chrome.storage.local.set({profile});status('个人资料已保存到当前浏览器。返回侧栏重新扫描即可使用。');};
$('export').onclick=async()=>{const {profile:saved}=await chrome.storage.local.get('profile');if(!saved){status('请先保存个人资料。',true);return;}const url=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='jev-apply-profile.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已导出资料。文件包含个人信息，请自行妥善保存。');};
$('import').onclick=()=>$('json-file').click();
function validated(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('资料 JSON 格式不正确');const out=emptyProfile();
 const value=x=>{if(x===undefined||x===null)return '';if(typeof x!=='string'||x.length>10000)throw Error('资料值须为不超过 10,000 字符的文本');return x;};
 out.notes=value(raw.notes);
 for(const [key]of BASE_FIELDS)out.base[key]=value(raw.base?.[key]);
 for(const group of ['education','work','custom']){if(raw[group]!==undefined&&!Array.isArray(raw[group]))throw Error('经历格式不正确');if((raw[group]||[]).length>(group==='custom'?40:10))throw Error('经历或自定义项过多');out[group]=(raw[group]||[]).map(row=>{if(!row||typeof row!=='object')throw Error('经历格式不正确');return Object.fromEntries((group==='custom'?[['label'],['value']]:RECORD_FIELDS[group]).map(([key])=>[key,value(row[key])]))});}return out;
}
$('json-file').onchange=async event=>{try{const f=event.target.files[0];if(!f)return;if(f.size>1000000)throw Error('资料文件过大');profile=validated(JSON.parse(await f.text()));render();status('资料已导入预览，请核对后点击保存。');}catch(e){status(e.message,true);}event.target.value='';};
async function refreshResume(){
 savedResume=await getResume();$('saved-pdf').hidden=!savedResume;
 $('pdf-text').textContent=savedResume?.text||'';$('pdf-details').hidden=!savedResume?.text;
 $('pdf-info').textContent=savedResume?`${savedResume.name} · ${(savedResume.size/1024).toFixed(1)} KB · ${new Date(savedResume.savedAt).toLocaleString()} 已保存${savedResume.parseError?' · 文本解析未完成':''}`:'';
}
function resumeURL(){if(!savedResume)throw Error('没有已保存的 PDF');return URL.createObjectURL(savedResume.blob);}
$('view-pdf').onclick=()=>{try{const url=resumeURL();window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){status(e.message,true);}};
$('download-pdf').onclick=()=>{try{const url=resumeURL();const link=document.createElement('a');link.href=url;link.download=savedResume.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){status(e.message,true);}};
$('delete-pdf').onclick=async()=>{if(pdfBusy||!confirm('删除本机保存的简历 PDF 和提取文本？已整理的个人资料会保留。'))return;try{await deleteResume();await refreshResume();$('pdf-file').value='';status('已删除 PDF 和提取文本，个人资料与备注仍保留。');}catch(e){status(e.message,true);}};
$('clear').onclick=async()=>{if(pdfBusy||!confirm('清除当前浏览器中保存的个人资料、零散备注和简历 PDF？API key 可在侧栏单独清除。'))return;try{await deleteResume();await chrome.storage.local.remove('profile');profile=emptyProfile();render();await refreshResume();$('pdf-file').value='';status('已清除个人资料、备注和 PDF。');}catch(e){status('清除未完成：'+e.message,true);}};
$('pdf-file').onchange=async event=>{
 let task,doc,record,persisted=false;const file=event.target.files[0];if(!file)return;status('正在本地保存并读取 PDF…');pdfBusy=true;event.target.disabled=true;$('clear').disabled=true;$('delete-pdf').disabled=true;
 try{
  if(file.size>20*1024*1024)throw Error('PDF 超过 20 MB，请使用较小文件。');
  if(!(await file.slice(0,1024).text()).includes('%PDF-'))throw Error('文件不是可识别的 PDF，未替换原有文件。');
  record={name:file.name,size:file.size,savedAt:new Date().toISOString(),blob:new Blob([file],{type:'application/pdf'}),text:'',pages:null,parseError:'等待解析'};
  await saveResume(record);persisted=true;await refreshResume();
  task=getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:chrome.runtime.getURL('vendor/cmaps/'),cMapPacked:true,standardFontDataUrl:chrome.runtime.getURL('vendor/standard_fonts/'),wasmUrl:chrome.runtime.getURL('vendor/wasm/'),useSystemFonts:true});
  task.onPassword=()=>{task.destroy();};doc=await task.promise;if(doc.numPages>40)throw Error('PDF 超过 40 页，仅保存原文件，未提取文本。');
  const pages=[];for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const text=await page.getTextContent();let previousY,lines='';for(const item of text.items){if(!('str'in item))continue;const y=item.transform?.[5];if(previousY!==undefined&&Math.abs(y-previousY)>3)lines+='\n';lines+=item.str+(item.hasEOL?'\n':' ');previousY=y;}pages.push(lines);}
  const text=pages.join('\n\n').trim();if(!text)throw Error('没有读取到文本层。扫描版 PDF 需要先 OCR，或手动填写资料。');
  await saveResume({...record,text,pages:doc.numPages,parseError:''});await refreshResume();$('pdf-details').open=true;profile=read();const basic=basicFromText(text);let added=0;for(const [k,v]of Object.entries(basic))if(!profile.base[k]){profile.base[k]=v;added++;}render();status(`已本地读取 ${doc.numPages} 页，原始 PDF 与提取文本已持久保存。补入 ${added} 项基础信息，请核对后保存个人资料。`);
 }catch(e){const reason=/password|destroy/i.test(e.message)?'加密 PDF 已保留，可下载原件；提取文本请使用未加密的版本。':e.message;if(persisted){try{await saveResume({...record,parseError:reason});await refreshResume();}catch{status('本地存储失败，请检查浏览器剩余空间并重新导入。',true);return;}}status(`${persisted?'PDF 原文件已保存，但文本读取未完成':'PDF 导入失败'}：${reason}`,true);}finally{if(task)await task.destroy().catch(()=>{});pdfBusy=false;event.target.disabled=false;event.target.value='';$('clear').disabled=false;$('delete-pdf').disabled=false;}
};
const saved=await chrome.storage.local.get('profile');if(saved.profile){try{profile=validated(saved.profile);}catch{status('已保存资料格式异常，请重新导入。',true);}}render();
try{await refreshResume();}catch{status('无法读取本地 PDF 存储，请检查浏览器设置。',true);}
