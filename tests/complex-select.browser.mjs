import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {pageBridge} from '../src/page.js';
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(`<!doctype html><meta charset="utf-8"><title>复杂下拉回归</title><style>[hidden]{display:none!important}.menu{border:1px solid;min-height:25px}.ant-select,.el-select,.ant-cascader{width:280px;min-height:30px}.scroller{height:140px;overflow:auto;position:relative}.row{height:28px}.ant-cascader-menu{display:inline-block;vertical-align:top}</style>
 <form><div class="ant-form-item"><label class="ant-form-item-label">毕业学校</label><div id="remote" class="ant-select"><div class="ant-select-selector"><span class="ant-select-selection-item"></span><input role="combobox" aria-controls="remote-list"></div></div></div>
 <div class="ant-form-item"><label class="ant-form-item-label">专业</label><div id="virtual" class="ant-select"><div class="ant-select-selector"><span class="ant-select-selection-item"></span><input readonly role="combobox" aria-controls="virtual-list"></div></div></div>
 <div class="el-form-item"><label class="el-form-item__label">学历</label><div id="element" class="el-select"><div class="el-input__wrapper"><input readonly role="combobox" aria-controls="element-list"></div></div></div>
 <div class="ant-form-item"><label class="ant-form-item-label">籍贯</label><div id="cascade" class="ant-cascader"><span class="ant-cascader-picker-label"></span><input readonly aria-controls="cascade-list"></div></div>
 <div class="ant-form-item"><label class="ant-form-item-label">失败选框</label><div id="discard" class="ant-select"><div class="ant-select-selector"><span class="ant-select-selection-item"></span><input readonly aria-controls="discard-list"></div></div></div>
 <div class="ant-form-item"><label class="ant-form-item-label">多选技能</label><div class="ant-select ant-select-multiple"><input role="combobox"></div></div><button id="save" type="button">保存</button><button>提交</button></form>
 <script>
 window.saved=0;window.submitted=0;window.searches=[];save.onclick=()=>saved++;document.querySelector('form').onsubmit=e=>{e.preventDefault();submitted++};
 function menu(id,cls){const m=document.createElement('div');m.className=cls+' menu';m.id=id+'-list';m.hidden=true;document.body.append(m);return m;}
 function bind(id,m){const root=document.getElementById(id),trigger=root.querySelector('.ant-select-selector,.el-input__wrapper')||root;trigger.onmousedown=e=>{e.preventDefault();m.hidden=!m.hidden;};root.addEventListener('keydown',e=>{if(e.key==='Escape')m.hidden=true;});return root;}
 function option(m,label,cls,fn,disabled=false){const n=document.createElement('div');n.className=cls;n.textContent=label;if(disabled)n.setAttribute('aria-disabled','true');n.onmousedown=e=>{e.preventDefault();if(!disabled)fn(n);};m.append(n);return n;}
 const rm=menu('remote','ant-select-dropdown');const remote=bind('remote',rm);let timer;
 remote.querySelector('input').oninput=e=>{const q=e.target.value;searches.push(q);clearTimeout(timer);rm.replaceChildren();timer=setTimeout(()=>{if(!q)return;option(rm,'示例理工大学','ant-select-item-option',()=>{setTimeout(()=>{remote.querySelector('span').textContent='示例理工大学';remote.querySelector('input').value='';rm.hidden=true;},150)});option(rm,'禁用大学','ant-select-item-option',()=>{},true);},700)};
 const vm=menu('virtual','ant-select-dropdown');const virtual=bind('virtual',vm);vm.innerHTML='<div class="scroller"><div style="height:8400px"></div><div class="window" style="position:absolute;top:0;left:0;right:0"></div></div>';const sc=vm.firstElementChild,w=sc.lastElementChild;
 function render(){const start=Math.floor(sc.scrollTop/28);w.style.top=start*28+'px';w.replaceChildren();for(let i=start;i<Math.min(300,start+7);i++)option(w,'专业'+i,'ant-select-item-option row',n=>{virtual.querySelector('span').textContent=n.textContent;vm.hidden=true;});}sc.onscroll=render;render();
 const em=menu('element','el-select-dropdown');const element=bind('element',em);['本科','硕士'].forEach(label=>option(em,label,'el-select-dropdown__item',()=>{element.querySelector('input').value=label;em.hidden=true;}));
 const cm=menu('cascade','ant-cascader-menus');const cascade=bind('cascade',cm);let path=[];
 function level(depth,labels){while(cm.children.length>depth)cm.lastElementChild.remove();const col=document.createElement('ul');col.className='ant-cascader-menu';cm.append(col);labels.forEach(label=>option(col,label,'ant-cascader-menu-item',()=>{path=path.slice(0,depth);path.push(label);if(depth===0)setTimeout(()=>level(1,['杭州市','宁波市']),120);else if(depth===1)setTimeout(()=>level(2,['西湖区','上城区']),120);else{cascade.querySelector('span').textContent=path.join(' / ');cm.hidden=true;}}));}level(0,['浙江省','江苏省']);
 const dm=menu('discard','ant-select-dropdown');bind('discard',dm);option(dm,'应该保留的值','ant-select-item-option',()=>{dm.hidden=true;});
 </script>`);
 const scan=await page.evaluate(pageBridge,{action:'scan',token:'complex'});
 assert.equal(scan.fields.length,6,JSON.stringify(scan.fields));const byLabel=label=>scan.fields.find(f=>f.label===label);
 assert.equal(byLabel('毕业学校').selectionMode,'search');assert(byLabel('毕业学校').supported);
 assert.equal(byLabel('专业').selectionMode,'virtual');assert(byLabel('专业').options.length<300);
 assert.equal(byLabel('籍贯').selectionMode,'cascade');assert(!byLabel('多选技能').supported);
 const values={'毕业学校':'示例理工大学','专业':'专业185','学历':'硕士','籍贯':'浙江省杭州市西湖区'};
 for(const [label,value]of Object.entries(values)){
  const items=[{id:byLabel(label).id,value}];
  const result=await page.evaluate(pageBridge,{action:'fill',token:'complex',items});assert(result.results[0].ok,label+JSON.stringify(result));
  const verified=await page.evaluate(pageBridge,{action:'verify',token:'complex',items});assert(verified.results[0].ok,label+JSON.stringify(verified));
 }
 assert((await page.evaluate(()=>searches)).includes('示例理工大学'));
 const retained=await page.locator('#remote .ant-select-selection-item').textContent();
 const absent=await page.evaluate(pageBridge,{action:'fill',token:'complex',overwrite:true,items:[{id:byLabel('毕业学校').id,value:'不存在的大学'}]});assert(!absent.results[0].ok);assert.match(absent.results[0].reason,/SELECT_NO_MATCH/);assert.equal(await page.locator('#remote .ant-select-selection-item').textContent(),retained);assert.equal(await page.locator('#remote input').inputValue(),'');
 const bad=await page.evaluate(pageBridge,{action:'fill',token:'complex',items:[{id:byLabel('失败选框').id,value:'应该保留的值'}]});assert(!bad.results[0].ok);assert.match(bad.results[0].reason,/SELECT_NOT_COMMITTED/);
 const kept=await page.evaluate(pageBridge,{action:'fill',token:'complex',items:[{id:byLabel('学历').id,value:'本科'}]});assert.match(kept.results[0].reason,/已有内容/);
 // Reordered options are still valid when the exact enabled target remains unique.
 await page.evaluate(()=>document.querySelector('#element-list').prepend(document.querySelector('#element-list').lastElementChild));
 const reordered=await page.evaluate(pageBridge,{action:'fill',token:'complex',overwrite:true,items:[{id:byLabel('学历').id,value:'本科'}]});assert(reordered.results[0].ok,JSON.stringify(reordered));
 // Two identically named live options must fail instead of choosing the first.
 await page.evaluate(()=>{const n=document.querySelector('#element-list').lastElementChild;n.parentElement.append(n.cloneNode(true));});
 const duplicate=await page.evaluate(pageBridge,{action:'fill',token:'complex',overwrite:true,items:[{id:byLabel('学历').id,value:'本科'}]});assert(!duplicate.results[0].ok);assert.match(duplicate.results[0].reason,/SELECT_AMBIGUOUS/);
 assert.equal(await page.evaluate(()=>saved+submitted),0);assert.deepEqual(errors,[]);
 // Readonly combobox inputs are selectable, and a hidden ARIA mirror is not another live option.
 await page.setContent('<label>只读下拉<input role="combobox" readonly aria-controls="owned-list"></label><div class="ant-select-dropdown" hidden><div id="owned-list" role="listbox" style="height:0;overflow:hidden"><div role="option">测试值</div></div><div class="ant-select-item-option">测试值</div></div>');
 await page.evaluate(()=>{const input=document.querySelector('input'),menu=document.querySelector('.ant-select-dropdown');input.onmousedown=()=>menu.hidden=!menu.hidden;input.onkeydown=e=>{if(e.key==='Escape')menu.hidden=true;};menu.querySelector('.ant-select-item-option').onmousedown=()=>{input.value='测试值';menu.hidden=true;};});
 const readonlyScan=await page.evaluate(pageBridge,{action:'scan',token:'readonly'});assert.equal(readonlyScan.fields.length,1);assert.equal(readonlyScan.fields[0].options.length,1);assert(readonlyScan.fields[0].supported);
 const readonlyFill=await page.evaluate(pageBridge,{action:'fill',token:'readonly',items:[{id:readonlyScan.fields[0].id,value:'测试值'}]});assert(readonlyFill.results[0].ok,JSON.stringify(readonlyFill));

 console.log(JSON.stringify({result:'PASS',checks:['portal mousedown triggers','remote debounce and exact search','virtual 300-option scroll to unseen target','Element readonly input','three-level cascade path and readback','reordered options','duplicate option rejection','search failure restores query and existing selection','uncommitted click fails','existing values preserved','no save or submit']}));
}finally{await browser.close();}
