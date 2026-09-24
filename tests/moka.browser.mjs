import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {pageBridge} from '../src/page.js';
import {routeExperienceFields} from '../src/experience-routing.js';
import {ensureRecordSlots} from '../src/record-slots.js';
import {validateDeepseekFills} from '../src/deepseek.js';

// Synthetic fixture based on the component structure observed in DJI's Moka form.
// No applicant data, cookies or production HTML are stored here.
const fixture=(internship=true)=>`<!doctype html><meta charset="utf-8"><title>Moka 控件回归</title>
<style>[hidden]{display:none}.sd-Select-menu-test{height:160px;overflow:auto}.sd-Select-container-test{display:inline-block;min-width:70px}input{width:100px}</style>
<div class="apply-block-test" data-section="work"><div class="blockTitle-test"><span>工作经历</span><button type="button">\uE71F添加</button></div></div>
${internship?'<div class="apply-block-test" data-section="internship"><div class="blockTitle-test"><span>实习经历</span><button type="button">\uE71F添加</button></div></div>':''}
<button type="button" id="save">保存</button><button type="submit" id="submit">提交</button>
<script>
window.saved=0;window.added={work:0,internship:0};save.onclick=submit.onclick=()=>saved++;
function select(unit){const d=document.createElement('div');d.className='sd-Dropdown-container-test';d.innerHTML='<label class="sd-Select-container-test"><span class="sd-Input-display-value-test"></span><input placeholder="'+(unit==='year'?'年':'月')+'"><span>⌄</span></label>';const label=d.firstElementChild;label.onclick=e=>{e.preventDefault();const old=d.querySelector('.sd-Select-menu-test');if(old){old.remove();return;}const menu=document.createElement('div');menu.className='sd-Select-menu-test';d.append(menu);setTimeout(()=>{const values=unit==='year'?Array.from({length:201},(_,i)=>String(2126-i)):Array.from({length:12},(_,i)=>String(i+1));for(const value of values){const option=document.createElement('div');option.className='sd-Menu-container-test';option.innerHTML='<div class="sd-Menu-content-item-test"><span data-key="sugar.select.label">'+value+'</span></div>';option.onclick=e=>{e.stopPropagation();setTimeout(()=>{label.querySelector('span').textContent=value;menu.remove();},160)};menu.append(option);}},360);};return d;}
function record(section,existing=false){const r=document.createElement('div');r.className='apply-fields-test';r.innerHTML='<div class="apply-field-test"><div class="title-test">起止时间</div><div class="month-range-select"></div></div><div class="apply-field-test"><div class="title-test">公司名称</div><label><input placeholder="请输入"></label></div><div class="apply-field-test"><div class="title-test">工作职责</div><textarea></textarea></div>';['year','month','year','month'].forEach(u=>r.querySelector('.month-range-select').append(select(u)));if(existing){r.querySelector('input[placeholder="请输入"]').value='保留已有公司';r.querySelectorAll('.month-range-select input')[3].disabled=true;}section.append(r);}
for(const s of document.querySelectorAll('.apply-block-test')){record(s,s.dataset.section==='internship');s.querySelector('button').onclick=()=>{added[s.dataset.section]++;record(s);};}
</script>`;
const browser=await chromium.launch({headless:true,channel:'chromium'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const sources=[{id:'cv',label:'素材',text:'实习经历\n公司：保留已有公司\n2025.09-2025.12\n公司：示例乙\n2026.06-2026.09\n1. 目标：原文不改。\n2. 工作内容：验证功能。'}];
 for(const separate of [true,false]){
  await page.setContent(fixture(separate));let scan;
  const rescan=async()=>{scan=await page.evaluate(pageBridge,{action:'scan',token:'moka'});scan.fields=routeExperienceFields(scan.fields,sources,scan.sections,scan.experienceCategories);return scan.sections;};
  await rescan();const category=separate?'internship':'work';
  assert.deepEqual(scan.sections.map(s=>[s.category,s.count,s.canAdd]),separate?[['work',1,true],['internship',1,true]]:[['work',1,true]]);
  assert(scan.fields.filter(f=>f.context.startsWith(separate?'实习':'工作')).every(f=>f.supported));
  assert.equal(scan.fields.find(f=>f.datePart?.unit==='year').options.length,201);
  if(separate)assert(scan.fields.filter(f=>f.context.startsWith('工作')).every(f=>!f.supported));
  const expanded=await ensureRecordSlots({sources,sections:scan.sections,fields:scan.fields,knownCategories:scan.experienceCategories,assertFresh:async()=>{},add:(s,target)=>page.evaluate(pageBridge,{action:'add-record',token:'moka',sectionId:s.id,target}),rescan});
  assert.equal(expanded.added,1);assert.deepEqual(await page.evaluate(()=>added),separate?{work:0,internship:1}:{work:1,internship:0});
  const group=separate?'实习经历':'工作经历';const second=scan.fields.filter(f=>f.context.startsWith(group+' · 第 2 条'));
  assert.equal(second.length,6);assert.deepEqual(second.filter(f=>f.datePart).map(f=>f.label),['起止时间 · 开始年份','起止时间 · 开始月份','起止时间 · 结束年份','起止时间 · 结束月份']);
  const planned=second.filter(f=>f.datePart).map(f=>({fieldId:f.id,value:f.datePart.unit==='year'?'2026':f.datePart.boundary==='start'?'6':'9',evidence:[{sourceId:'cv',quote:'2026.06-2026.09'}]}));
  planned.push({fieldId:second.find(f=>f.label==='公司名称').id,value:'示例乙',evidence:[{sourceId:'cv',quote:'示例乙'}]});
  const valid=validateDeepseekFills({fills:planned},scan.fields,sources);assert.equal(valid.fills.length,5,JSON.stringify(valid));
  const items=valid.fills.map(f=>({id:f.fieldId,value:f.value}));const filled=await page.evaluate(pageBridge,{action:'fill',token:'moka',items});assert(filled.results.every(r=>r.ok),JSON.stringify(filled));
  const verified=await page.evaluate(pageBridge,{action:'verify',token:'moka',items});assert(verified.results.every(r=>r.ok),JSON.stringify(verified));
  assert(await page.locator('[data-section='+category+'] .apply-fields-test').nth(1).locator('.sd-Select-container-test input').evaluateAll(es=>es.every(e=>e.value==='')));
  if(separate)assert.equal(await page.locator('[data-section=internship] input[placeholder=请输入]').first().inputValue(),'保留已有公司');
  const skipped=await page.evaluate(pageBridge,{action:'fill',token:'moka',items});assert(skipped.results.every(r=>!r.ok&&r.reason.includes('已有内容')));
  assert.equal(await page.evaluate(()=>saved),0);await rescan();assert.equal((await ensureRecordSlots({sources,sections:scan.sections,fields:scan.fields,assertFresh:async()=>{},add:()=>{throw Error('duplicate')},rescan})).added,0);
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',checks:['Moka labels and numbered records','scoped generic add button','internship priority and work fallback','201 year options','delayed menu population and selection','four date components and original evidence','same adapter clicks and readback','preserve existing values','repeat does not add or overwrite','never save/submit']}));
}finally{await browser.close();}
