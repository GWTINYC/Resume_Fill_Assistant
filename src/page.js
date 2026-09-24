// Runs in the extension's isolated world. Keep all helpers inside this function.
export async function pageBridge(args) {
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim().slice(0,220);
  // Moka uses CSS modules: match stable component prefixes, not build hashes.
  const mokaSelect='[class*="sd-Select-container-"]';
  const selectRoots='.phoenix-select,[role="combobox"],'+mokaSelect;
  const recordRoots='.form,[class*="apply-fields-"]';
  const popupRoots='[role="listbox"],.phoenix-selectList,[class*="sd-Select-menu-"]';
  const visible=el=>el?.isConnected&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none'&&!el.closest('[inert],[hidden],.phoenix-select--disabled,[class*=sd-Select-containerDisabled-]')&&(!el.matches(mokaSelect)||!el.querySelector('input:disabled'));
  const labelText=node=>{const copy=node.cloneNode(true);for(const child of copy.querySelectorAll('input,select,textarea,button,[role="combobox"],script,style'))child.remove();return copy.textContent||'';};
  const itemOf=el=>el.closest('.form-item,.ant-form-item,.el-form-item,.form-group,[class*=apply-field-]');
  const itemLabel=el=>{const item=itemOf(el);const label=item?.querySelector('.form-item__text,.ant-form-item-label,.el-form-item__label,.control-label,[class*=title-],label');return label?labelText(label):'';};
  const labelOf=el=>{
    const labelled=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.innerText||'').join(' ');
    return clean(labelled||el.getAttribute('aria-label')||itemLabel(el)||Array.from(el.labels||[]).map(labelText).join(' ')||el.getAttribute('placeholder')||el.getAttribute('name')||'未命名字段').replace(/[\s*：:]+$/,'');
  };
  const datePartOf=el=>{
    const range=el.closest('.month-range-select');if(!range)return null;
    const controls=[...range.querySelectorAll(mokaSelect)];const index=controls.indexOf(el);
    if(index<0||![2,4].includes(controls.length))return null;
    return {unit:index%2?'month':'year',boundary:controls.length===4?(index<2?'start':'end'):'single'};
  };
  const dateLabel=part=>`${part.boundary==='start'?'开始':part.boundary==='end'?'结束':''}${part.unit==='year'?'年份':'月份'}`;
  const groupLabel=el=>clean(itemLabel(el)||el.closest('fieldset')?.querySelector('legend')?.innerText||el.closest('[role="radiogroup"]')?.getAttribute('aria-label')||'');
  const sectionInfo=el=>{
    const moka=el.closest('[class*="apply-block-"]');
    if(moka){const heading=moka.querySelector('[class*="blockTitle-"]');return {title:clean(heading?labelText(heading):''),scope:moka,form:el.closest('[class*="apply-fields-"]')};}
    const form=el.closest('.form');
    if(form){
      // Beisen puts the same id on a detached heading and a form wrapper.
      const title=form.id&&[...document.querySelectorAll('[id]')].find(n=>n.id===form.id&&!n.contains(form)&&!form.contains(n)&&!n.querySelector('input,textarea,select'));
      if(title&&title.parentElement.contains(form))return {title:clean(title.textContent),scope:title.parentElement,form};
      let n=form;
      for(let i=0;i<10&&n.parentElement;i++,n=n.parentElement){
        const prev=n.previousElementSibling;
        if(prev&&!prev.querySelector('input,textarea,select,.form')&&clean(prev.textContent).length>0&&clean(prev.textContent).length<65&&!/^第\s*\d/.test(clean(prev.textContent)))return {title:clean(prev.textContent),scope:n.parentElement,form};
      }
    }
    const group=el.closest('fieldset,section,[role="group"],[role="radiogroup"],article');
    if(group)return {title:clean(group.querySelector('legend,h1,h2,h3,h4,[role="heading"]')?.innerText||group.getAttribute('aria-label')||''),scope:group};
    let parent=el.parentElement;
    for(let i=0;i<4&&parent;i++,parent=parent.parentElement){const heading=parent.querySelector('h1,h2,h3,h4,[role="heading"]');if(heading)return {title:clean(heading.innerText),scope:parent};}
    return {title:''};
  };
  const contextOf=el=>{
    const {title,scope,form}=sectionInfo(el);if(!form)return title;
    const siblings=[...(scope?.querySelectorAll(recordRoots)||[])];const index=siblings.indexOf(form);
    const peers=[...form.querySelectorAll('.form-item__text,[class*=apply-field-] > [class*=title-]')].map(x=>clean(x.textContent)).filter(Boolean).slice(0,10);
    return [title,index>=0?`第 ${index+1} 条（页面顺序，同组字段属于同一经历）`:'',peers.length?'同组字段：'+peers.join('、'):''].filter(Boolean).join(' · ').slice(0,600);
  };
  const signature=(el,radio)=>JSON.stringify([radio?groupLabel(el):labelOf(el),el.getAttribute('name'),el.tagName,el.type,contextOf(el),datePartOf(el)]);
  const consent=/同意|隐私|条款|声明|承诺|订阅|验证码|密码|consent|privacy|terms|agree|declaration|certif|subscribe|password|captcha/i;
  const choiceSelector='[role="option"],.phoenix-selectList__listItem,[class*=sd-Menu-content-item-]';
  const radioSelector='.phoenix-radio,[role="radio"]';
  const disabled=el=>!!el.closest('[class*=sd-Menu-disabled-],[class*=sd-Select-disabled-]')||el.getAttribute('aria-disabled')==='true'||el.classList.contains('phoenix-radio--disabled')||el.classList.contains('phoenix-selectList__listItem--disabled');
  const radioSelected=el=>el.getAttribute('aria-checked')==='true'||!!el.querySelector('.phoenix-radio__circle--checked');
  const customValue=entry=>{
    if(entry.kind==='custom-radio')return [...entry.el.querySelectorAll(radioSelector)].find(radioSelected)?.textContent.trim()||'';
    const el=entry.el;const tag=el.querySelector('.phoenix-select__tag,.phoenix-select__tagItem');
    if(tag)return clean(tag.textContent);
    if(el.matches(mokaSelect))return clean(el.querySelector('[class*=sd-Input-display-value-]')?.textContent);
    if(el.matches('.phoenix-select'))return clean(el.querySelector('.phoenix-select__content')?.textContent);
    return clean(el.getAttribute('aria-valuetext')||(el.tagName==='INPUT'?el.value:el.querySelector('input')?.value)||'');
  };
  const popupFor=el=>{
    const input=el.querySelector('input');const ids=[el.getAttribute('aria-controls'),el.getAttribute('aria-owns'),input?.getAttribute('aria-controls'),input?.getAttribute('aria-owns')].filter(Boolean).join(' ').split(/\s+/);
    const owned=ids.map(id=>document.getElementById(id)).filter(n=>visible(n));
    if(owned.length===1)return owned[0];
    const owner=el.matches(mokaSelect)?el.closest('[class*=sd-Dropdown-container-]'):el;
    const inside=[...(owner||el).querySelectorAll(popupRoots)].filter(visible);return inside.length===1?inside[0]:null;
  };
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const closePopup=async el=>{(el.querySelector('input')||el).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));await pause(20);if(popupFor(el))el.click();};
  const openPopup=async el=>{
    let popup=popupFor(el);if(popup)return popup;
    const before=new Set([...document.querySelectorAll(popupRoots)].filter(visible));el.click();
    for(let i=0;i<20;i++){
      await pause(60);popup=popupFor(el);if(popup)return popup;
      // Only a newly visible, unambiguous Phoenix menu may be associated without ARIA.
      if(el.matches('.phoenix-select')){const fresh=[...document.querySelectorAll('.phoenix-selectList')].filter(n=>visible(n)&&!before.has(n));if(fresh.length===1)return fresh[0];}
    }
    return null;
  };
  const readOptions=popup=>[...popup.querySelectorAll(choiceSelector)].filter(visible).map(node=>({node,value:clean(node.querySelector('[data-key="sugar.select.label"]')?.textContent||node.textContent),label:clean(node.querySelector('[data-key="sugar.select.label"]')?.textContent||node.textContent),disabled:disabled(node)}));
  const stableOptions=async popup=>{
    let previous='',stable=0,options=[];
    for(let i=0;i<20;i++){options=readOptions(popup);const snapshot=JSON.stringify(options.map(({node,...o})=>o));stable=options.length&&snapshot===previous?stable+1:0;if(stable>=2)return options;previous=snapshot;await pause(60);}
    return [];
  };
  const safeOptions=options=>options.length>0&&options.length<=250&&options.every(o=>o.value)&&new Set(options.map(o=>o.value)).size===options.length;
  const sectionCategory=title=>({'教育背景':'education','教育经历':'education','实习经历':'internship','实习经验':'internship','工作经历':'work','工作经验':'work','工作/实习经历':'work','工作／实习经历':'work','项目经验':'project','项目经历':'project','课题项目经验':'project'}[title]);
  const addText=node=>clean(node.getAttribute('aria-label')||node.textContent).replace(/[\uE000-\uF8FF]/g,'').replace(/^[+＋]\s*/,'').replace(/\s+/g,'');
  const allowedAdd=(node,title,scope)=>{
    const action=node.closest('button,a,[role="button"]')||node;
    if(!action.matches('button,a,[role="button"]')&&action.querySelector('button,a,[role="button"],input,textarea,select'))return null;
    const scopedGeneric=scope?.matches('[class*=apply-block-]')&&action.closest('[class*=blockTitle-]')?.parentElement===scope&&['添加','新增'].includes(addText(action));
    if(!visible(action)||!scopedGeneric&&!['添加'+title,'新增'+title].includes(addText(action)))return null;
    if(action.matches('button')&&action.type==='submit')return null;
    if(action.matches('a')&&action.getAttribute('href')&&!action.getAttribute('href').startsWith('#'))return null;
    return action;
  };
  const discoverSections=()=>{
    const sections=[],seen=new Set();
    for(const form of document.querySelectorAll(recordRoots)){
      if(!visible(form))continue;const control=form.querySelector('input,textarea,select,.phoenix-radio-group');if(!control)continue;
      const {title,scope}=sectionInfo(control),category=sectionCategory(title);if(!scope||!category||seen.has(scope))continue;seen.add(scope);
      const forms=[...scope.querySelectorAll(recordRoots)].filter(visible);if(!forms.length)continue;
      const buttons=new Set();for(const node of scope.querySelectorAll('button,a,[role="button"],div,span')){const b=allowedAdd(node,title,scope);if(b&&scope.contains(b)&&!forms.some(f=>f.contains(b)))buttons.add(b);}
      const candidates=[...buttons].filter(b=>![...buttons].some(other=>b!==other&&b.contains(other)));
      const pending=globalThis.__jevApplyAddPending;
      let blocked='';if(pending&&pending.url===location.href&&pending.category===category){
        if(pending.scope===scope&&forms.length===pending.before+1&&!pending.failed)globalThis.__jevApplyAddPending=null;
        else blocked='上次新增尚未确认或页面发生异常，请检查新增栏位；不要连续重试，必要时刷新页面。';
      }
      sections.push({id:'s'+sections.length,title,category,count:forms.length,canAdd:candidates.length===1,blocked,scope,forms,button:candidates.length===1?candidates[0]:null});
    }
    return sections;
  };
  const publicSection=({scope,forms,button,...data})=>data;
  if(args.action==='add-record'){
    const state=globalThis.__jevApply,previous=state?.sections?.get(args.sectionId);
    if(!state||state.token!==args.token||state.url!==location.href||state.title!==document.title||!previous)return {ok:false,reason:'页面已变化，请重新扫描'};
    const current=discoverSections().find(s=>s.scope===previous.scope);
    if(!current||current.blocked||!current.canAdd||current.button!==previous.button||current.count!==previous.count||current.category!==previous.category)return {ok:false,reason:current?.blocked||'章节或添加按钮已变化，请重新扫描'};
    if(!Number.isInteger(args.target)||args.target<=current.count||args.target>10)return {ok:false,reason:'不需要新增或目标数量不合法'};
    // Save existing controls and their values before the only permitted click.
    const before=[...current.scope.querySelectorAll('input,textarea,select')].map(el=>({el,value:el.value,checked:el.checked}));
    const customs=[...current.scope.querySelectorAll(selectRoots+',.phoenix-radio-group')].map(el=>({el,kind:el.matches('.phoenix-radio-group')?'custom-radio':'custom-select'})).map(entry=>({...entry,value:customValue(entry)}));
    const pending={url:location.href,scope:current.scope,category:current.category,before:current.count,failed:false};globalThis.__jevApplyAddPending=pending;
    state.token=null;current.button.click();
    for(let i=0;i<30;i++){
      await pause(100);
      if(location.href!==state.url||document.title!==state.title||!current.scope.isConnected){pending.failed=true;return {ok:false,reason:'新增期间页面跳转或章节被替换，请手动核对'};}
      const count=[...current.scope.querySelectorAll(recordRoots)].filter(visible).length;
      if(count===current.count)continue;
      const preserved=before.every(x=>x.el.isConnected&&x.el.value===x.value&&x.el.checked===x.checked)&&customs.every(x=>x.el.isConnected&&customValue(x)===x.value);
      if(count!==current.count+1||!preserved){pending.failed=true;return {ok:false,reason:'新增数量异常或原栏位发生变化，已停止自动操作，请手动核对'};}
      globalThis.__jevApplyAddPending=null;return {ok:true,count};
    }
    return {ok:false,reason:'点击后 3 秒内未确认新增，已停止以避免重复添加；请等待页面完成或手动检查。'};
  }
  if(args.action==='scan'){
    const state={token:args.token,url:location.href,title:document.title,entries:new Map()};globalThis.__jevApply=state;
    const fields=[],seenRadios=new Set();
    const elements=document.querySelectorAll('input,textarea,select,'+selectRoots+',.phoenix-radio-group,[role="radiogroup"]');
    for(const el of elements){
      if(!visible(el)||['hidden','submit','reset','button','image','password','checkbox'].includes(el.type))continue;
      if(el.closest('nav,header,[role="search"]')&&!el.closest('form,.form'))continue;
      const owner=el.parentElement?.closest(selectRoots);if(owner&&owner!==el)continue;
      const customRadio=el.matches('.phoenix-radio-group,[role="radiogroup"]')&&!el.querySelector('input[type="radio"]');
      if(el.matches('[role="radiogroup"]')&&!customRadio)continue;
      const customSelect=el.matches(selectRoots)&&el.tagName!=='SELECT';
      const datePart=datePartOf(el);
      let type=customRadio?'radio':customSelect?'custom-select':el.type||'text';let radios=null,label=labelOf(el)+(datePart?' · '+dateLabel(datePart):''),options,kind;
      if(customRadio){label=groupLabel(el)||label;kind='custom-radio';options=[...el.querySelectorAll(radioSelector)].map(r=>({value:clean(r.textContent),label:clean(r.textContent),disabled:disabled(r)||!visible(r)}));}
      else if(type==='radio'){
        const group=el.closest('fieldset,[role="radiogroup"]')||el.form||document;if(!el.name)continue;
        radios=[...group.querySelectorAll('input[type="radio"]')].filter(x=>x.name===el.name&&x.form===el.form);if(seenRadios.has(radios[0]))continue;seenRadios.add(radios[0]);label=groupLabel(el)||el.name;
      }
      if(consent.test(label+' '+(el.name||'')+' '+(el.autocomplete||'')))continue;
      let supported=['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&type!=='file'&&!el.readOnly;
      let reason='自定义或暂不支持的控件，需要手动填写';
      if(el.tagName==='INPUT'&&!['text','email','tel','url','number','date','month','search','radio'].includes(type))supported=false;
      if(customSelect){
        kind='custom-select';supported=false;
        const multi=(el.classList.contains('phoenix-select--multi')||!!el.querySelector('[class*=sd-Tag-]'))||el.getAttribute('aria-multiselectable')==='true';
        const calendar=!!el.querySelector('use[href*="field_date_time_picker"],use[*|href*="field_date_time_picker"]');
        if(multi)reason='多选或级联控件，暂需手动选择';
        else if(calendar)reason='自定义日期控件，已识别栏目，需手动选择日期';
        else {const popup=await openPopup(el);if(popup){options=(await stableOptions(popup)).map(({node,...o})=>o);supported=safeOptions(options)&&popup.getAttribute('aria-multiselectable')!=='true';await closePopup(el);}if(!supported)reason='已识别下拉栏目，但未能读取唯一完整的选项列表，请手动选择';}
      }
      if(customRadio)supported=safeOptions(options);
      if(el.tagName==='SELECT'){supported=!el.multiple;options=[...el.options].map(o=>({value:o.value,label:clean(o.textContent),disabled:o.disabled||o.parentElement?.disabled===true}));}
      if(radios)options=radios.map(o=>({value:o.value,label:labelOf(o),disabled:!visible(o)}));
      if(options?.length>250||options&&new Set(options.map(o=>o.value)).size!==options.length)supported=false;
      const id='f'+fields.length,entry={el,radios,kind,signature:signature(el,!!radios),options};
      const current=kind?customValue(entry):radios?(radios.find(x=>x.checked)?.value||''):(el.value||'');let hasValue=!!current;
      if(el.tagName==='SELECT'){const selected=el.selectedOptions[0];if(selected&&(/^(请选择|选择|please select|select|choose|--)/i.test(clean(selected.textContent))||selected.disabled))hasValue=false;}
      const item=itemOf(el);const maxLength=el.maxLength>0?el.maxLength:Number(item?.querySelector('.phoenix-textarea')?.textContent.match(/\/\s*(\d+)/)?.[1])||null;
      fields.push({id,label,datePart,name:clean(el.name),type,context:contextOf(el),placeholder:clean(el.placeholder),required:el.required||el.getAttribute('aria-required')==='true'||!!item?.querySelector('.form-item__required'),maxLength,hasValue,options,supported,reason:supported?'':type==='file'?'附件需要手动上传':reason});state.entries.set(id,entry);
      if(fields.length>=100)break;
    }
    const sections=discoverSections();state.sections=new Map(sections.map(s=>[s.id,s]));
    const experienceCategories=[...new Set([...document.querySelectorAll(recordRoots)].map(form=>{const c=form.querySelector('input,textarea,select,.phoenix-radio-group');return c?sectionCategory(sectionInfo(c).title):null;}).concat([...document.querySelectorAll('h1,h2,h3,h4,[role=tab],[class*=blockTitle-]')].map(n=>sectionCategory(clean(labelText(n))))).filter(Boolean))];
    return {fields,sections:sections.map(publicSection),experienceCategories,url:location.href,title:document.title,pageContext:{title:clean(document.title),headings:[...new Set([...document.querySelectorAll('h1,h2,h3')].map(x=>clean(x.innerText)).concat(fields.map(f=>f.context.split(' · ')[0])))].filter(Boolean).slice(0,20),description:clean(document.querySelector('meta[name="description"]')?.content)},atLimit:fields.length>=100};
  }
  if(args.action==='fill'||args.action==='verify'){
    const state=globalThis.__jevApply;if(!state||state.token!==args.token||state.url!==location.href||state.title!==document.title)return {results:args.items.map(x=>({id:x.id,ok:false,reason:'页面已变化，请重新扫描'}))};
    const results=[];
    for(const item of args.items){
      const entry=state.entries.get(item.id);if(!entry){results.push({id:item.id,ok:false,reason:'字段已失效'});continue;}const {el,radios,kind}=entry;
      if((args.action==='verify'?!el.isConnected:(!visible(el)||el.readOnly))||signature(el,!!radios)!==entry.signature){results.push({id:item.id,ok:false,reason:'字段已变化，请重新扫描'});continue;}
      const current=kind?customValue(entry):radios?radios.find(x=>x.checked)?.value:el.value;
      if(args.action==='verify'){const valid=radios?radios.every(x=>x.validity.valid):!el.validity||el.validity.valid;const ok=String(current??'')===String(item.value)&&valid;results.push({id:item.id,ok,reason:ok?'已填入并读取核验一致':!valid?'网页格式校验未通过，请检查':'网页未保留预期值，请手动检查'});continue;}
      const placeholder=el.tagName==='SELECT'&&el.selectedOptions[0]&&(/^(请选择|选择|please select|select|choose|--)/i.test(clean(el.selectedOptions[0].textContent))||el.selectedOptions[0].disabled);
      if(current&&!placeholder&&!args.overwrite){results.push({id:item.id,ok:false,reason:'已有内容，已跳过'});continue;}
      if(!['string','number'].includes(typeof item.value)){results.push({id:item.id,ok:false,reason:'无有效值'});continue;}const value=String(item.value);if(value.length>10000){results.push({id:item.id,ok:false,reason:'值过长'});continue;}
      let target=el;
      try{
        if(kind){
          if(!entry.options?.some(o=>!o.disabled&&o.value===value))throw Error('没有经过扫描确认的对应选项');
          let choices,popup;
          if(kind==='custom-radio')choices=[...el.querySelectorAll(radioSelector)].map(node=>({node,value:clean(node.textContent),disabled:disabled(node)||!visible(node)}));
          else {popup=await openPopup(el);if(!popup)throw Error('无法重新打开对应下拉选项');choices=await stableOptions(popup);}
          const same=choices.length===entry.options.length&&choices.every((o,i)=>o.value===entry.options[i].value&&o.disabled===entry.options[i].disabled);
          if(!same){if(popup)await closePopup(el);throw Error('选项已变化，请重新扫描');}
          const option=choices.find(o=>!o.disabled&&o.value===value);if(!option)throw Error('选项已变化');option.node.click();await pause(80);
          for(let i=0;i<12&&customValue(entry)!==value;i++)await pause(80);
          if(customValue(entry)!==value)throw Error('网页未确认选项选择，请手动检查');
        }else if(radios){target=radios.find(o=>o.value===value&&visible(o));if(!target)throw Error('选项已变化');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked').set.call(target,true);}
        else{
          if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===value&&!o.disabled&&!o.parentElement?.disabled))throw Error('选项已变化');
          if(el.maxLength>0&&value.length>el.maxLength)throw Error('超过字段长度上限');const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);if(el.value!==value){Object.getOwnPropertyDescriptor(proto,'value').set.call(el,current||'');throw Error('该控件不接受此格式');}
        }
        if(!kind){target.dispatchEvent(new Event('input',{bubbles:true,composed:true}));target.dispatchEvent(new Event('change',{bubbles:true,composed:true}));}
        results.push({id:item.id,ok:true,reason:target.validity&&!target.validity.valid?'已填入，但网页格式校验未通过，请检查':'已填入'});
      }catch(e){results.push({id:item.id,ok:false,reason:e.message||'填写失败'});}
    }
    return {results};
  }
  return {error:'Unknown action'};
}
