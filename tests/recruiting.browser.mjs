import {chromium} from 'playwright';import {readFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';import {pageBridge} from '../src/page.js';import {ensureRecordSlots} from '../src/record-slots.js';
execFileSync(process.execPath,['tools/recruiting-lab.mjs']);
const b=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chromium'});const page=await b.newPage({viewport:{width:1280,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));const remote=[];await page.route('**/*',r=>{remote.push(r.request().url());return r.abort();});
try{
 await page.setContent(await readFile('test-artifacts/recruiting-lab/index.html','utf8'));let scan=await page.evaluate(pageBridge,{action:'scan',token:'test'});
 const sources=[{id:'cv',text:'教育经历：\n硕士：甲大学\n本科：乙大学\n实习经历：\n公司：示例甲\n公司：示例乙'}];
 const expand=()=>ensureRecordSlots({sources,sections:scan.sections,assertFresh:async()=>{},add:(section,target)=>page.evaluate(pageBridge,{action:'add-record',token:'test',sectionId:section.id,target}),rescan:async()=>{scan=await page.evaluate(pageBridge,{action:'scan',token:'test'});return scan.sections;}});
 assert.equal((await expand()).added,2);assert.equal((await expand()).added,0);
 assert.equal(scan.fields.length,66);assert.equal(scan.fields.filter(f=>f.supported).length,62);assert(!scan.fields.some(f=>['请输入','未命名字段'].includes(f.label)));assert(scan.fields.every(f=>f.context));
 const field=(label,group,record=1)=>scan.fields.find(f=>f.label===label&&f.context.startsWith(group+' · 第 '+record+' 条'));
 const name=field('姓名','个人信息'),degree=field('学历','教育经历'),gender=field('性别','个人信息'),school1=field('学校名称','教育经历'),school2=field('学校名称','教育经历',2);
 assert.notEqual(school1.context,school2.context);assert.equal(name.required,true);assert.equal(field('自我评价','个人信息').maxLength,2000);assert.deepEqual(degree.options.map(o=>o.value),['博士','硕士','本科','大专']);assert.equal(field('期望工作城市','求职意向').supported,false);
 const values=[[name,'测试申请人'],[school1,'示例大学甲'],[school2,'示例大学乙'],[degree,'硕士'],[gender,'男'],[field('自我评价','个人信息'),'熟悉工具链。\n参与项目开发。'],[field('开始时间','教育经历'),'2024-09']];
 const filled=await page.evaluate(pageBridge,{action:'fill',token:'test',items:values.map(([f,value])=>({id:f.id,value}))});assert(filled.results.every(r=>r.ok),JSON.stringify(filled));const verified=await page.evaluate(pageBridge,{action:'verify',token:'test',items:values.map(([f,value])=>({id:f.id,value}))});assert(verified.results.every(r=>r.ok));
 const degreeCombo=page.locator('#section-2 .record').first().locator('.phoenix-select');assert.equal(await degreeCombo.locator('input').inputValue(),'');assert.equal(await degreeCombo.locator('.phoenix-select__tag').innerText(),'硕士');assert.equal(await degreeCombo.getAttribute('aria-expanded'),'false');
 const skip=await page.evaluate(pageBridge,{action:'fill',token:'test',items:[{id:degree.id,value:'本科'}]});assert.equal(skip.results[0].ok,false);assert.match(skip.results[0].reason,/已有内容/);
 const degree2=field('学历','教育经历',2);await page.locator('#section-2 .record').nth(1).locator('[role=option]').first().evaluate(el=>el.textContent='选项变更');const stale=await page.evaluate(pageBridge,{action:'fill',token:'test',items:[{id:degree2.id,value:'硕士'}]});assert.equal(stale.results[0].ok,false);assert.match(stale.results[0].reason,/选项已变化/);
 await page.locator('#section-2 .record-list').evaluate(el=>el.prepend(el.lastElementChild));const moved=await page.evaluate(pageBridge,{action:'fill',token:'test',overwrite:true,items:[{id:school1.id,value:'错误学校'}]});assert.equal(moved.results[0].ok,false);assert.match(moved.results[0].reason,/字段已变化/);
 assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
 // Timeout must not trigger a second click, even after a new scan.
 await page.setContent(await readFile('test-artifacts/recruiting-lab/index.html','utf8'));
 await page.locator('#section-8 .lab-add').evaluate(b=>{window.addAttempts=0;b.onclick=()=>window.addAttempts++;});
 let pendingScan=await page.evaluate(pageBridge,{action:'scan',token:'pending'});let internship=pendingScan.sections.find(s=>s.category==='internship');
 const stalled=await page.evaluate(pageBridge,{action:'add-record',token:'pending',sectionId:internship.id,target:2});assert.equal(stalled.ok,false);assert.match(stalled.reason,/3 秒/);
 pendingScan=await page.evaluate(pageBridge,{action:'scan',token:'retry'});internship=pendingScan.sections.find(s=>s.category==='internship');assert(internship.blocked);
 const retry=await page.evaluate(pageBridge,{action:'add-record',token:'retry',sectionId:internship.id,target:2});assert.equal(retry.ok,false);assert.equal(await page.evaluate(()=>window.addAttempts),1);
 // A submit control with the same label is never an authorized add action.
 await page.setContent(await readFile('test-artifacts/recruiting-lab/index.html','utf8'));await page.locator('#section-8 .lab-add').evaluate(b=>{b.type='submit';const wrapper=document.createElement('div');b.replaceWith(wrapper);wrapper.append(b);});
 const submitScan=await page.evaluate(pageBridge,{action:'scan',token:'submit'});assert.equal(submitScan.sections.find(s=>s.category==='internship').canAdd,false);

 await page.setContent(`<div><div id="education">教育经历</div><div><div class="form" id="education"><div class="form-item"><label class="form-item__text">学校名称</label><div><input placeholder="请输入"></div></div><div class="form-item"><label class="form-item__text">学历</label><div class="phoenix-select"><input class="phoenix-select__input"></div></div></div></div></div>`);
 const archived=await page.evaluate(pageBridge,{action:'scan',token:'archive'});assert.equal(archived.fields.length,2);assert.equal(archived.fields[0].label,'学校名称');assert(archived.fields.every(f=>f.context.startsWith('教育经历')));assert.equal(archived.fields[1].supported,false);assert.equal(archived.fields[1].type,'custom-select');
 console.log(JSON.stringify({result:'PASS',browser:process.env.BROWSER_CHANNEL||'chromium',checks:['automatically add only two missing record groups','repeat run adds nothing','timeout prevents another click after rescan','submit button excluded','66 fields, labels and context','unassociated labels','required flags and textarea limits','repeated education/internship groups','custom dropdown option click and selected-value readback','custom radio click','no search-input false fill','multiselect held','changed options rejected','moved records rejected','no remote requests','snapshot dropdown without catalog held']}));
}finally{await b.close();}
