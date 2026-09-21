// Runs in the extension's isolated world. Keep all helpers inside this function.
export async function pageBridge(args) {
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim().slice(0,220);
  const visible=el=>el?.isConnected&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none'&&!el.closest('[inert],[hidden],.phoenix-select--disabled');
  const labelText=node=>{const copy=node.cloneNode(true);for(const child of copy.querySelectorAll('input,select,textarea,button,[role="combobox"],script,style'))child.remove();return copy.textContent||'';};
  const itemOf=el=>el.closest('.form-item,.ant-form-item,.el-form-item,.form-group');
  const itemLabel=el=>{const item=itemOf(el);const label=item?.querySelector('.form-item__text,.ant-form-item-label,.el-form-item__label,.control-label,label');return label?labelText(label):'';};
  const labelOf=el=>{
    const labelled=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.innerText||'').join(' ');
    return clean(labelled||el.getAttribute('aria-label')||Array.from(el.labels||[]).map(labelText).join(' ')||itemLabel(el)||el.getAttribute('placeholder')||el.getAttribute('name')||'未命名字段').replace(/[\s*：:]+$/,'');
  };
  const groupLabel=el=>clean(itemLabel(el)||el.closest('fieldset')?.querySelector('legend')?.innerText||el.closest('[role="radiogroup"]')?.getAttribute('aria-label')||'');
  const sectionInfo=el=>{
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
    const siblings=[...(scope?.querySelectorAll('.form')||[])];const index=siblings.indexOf(form);
    const peers=[...form.querySelectorAll('.form-item__text')].map(x=>clean(x.textContent)).filter(Boolean).slice(0,10);
    return [title,index>=0?`第 ${index+1} 条（页面顺序，同组字段属于同一经历）`:'',peers.length?'同组字段：'+peers.join('、'):''].filter(Boolean).join(' · ').slice(0,600);
  };
  const signature=(el,radio)=>JSON.stringify([radio?groupLabel(el):labelOf(el),el.getAttribute('name'),el.tagName,el.type,contextOf(el)]);
  const consent=/同意|隐私|条款|声明|承诺|订阅|验证码|密码|consent|privacy|terms|agree|declaration|certif|subscribe|password|captcha/i;
  const choiceSelector='[role="option"],.phoenix-selectList__listItem';
  const radioSelector='.phoenix-radio,[role="radio"]';
  const disabled=el=>el.getAttribute('aria-disabled')==='true'||el.classList.contains('phoenix-radio--disabled')||el.classList.contains('phoenix-selectList__listItem--disabled');
  const radioSelected=el=>el.getAttribute('aria-checked')==='true'||!!el.querySelector('.phoenix-radio__circle--checked');
  const customValue=entry=>{
    if(entry.kind==='custom-radio')return [...entry.el.querySelectorAll(radioSelector)].find(radioSelected)?.textContent.trim()||'';
    const el=entry.el;const tag=el.querySelector('.phoenix-select__tag,.phoenix-select__tagItem');
    if(tag)return clean(tag.textContent);
    if(el.matches('.phoenix-select'))return clean(el.querySelector('.phoenix-select__content')?.textContent);
    return clean(el.getAttribute('aria-valuetext')||(el.tagName==='INPUT'?el.value:el.querySelector('input')?.value)||'');
  };
  const popupFor=el=>{
    const input=el.querySelector('input');const ids=[el.getAttribute('aria-controls'),el.getAttribute('aria-owns'),input?.getAttribute('aria-controls'),input?.getAttribute('aria-owns')].filter(Boolean).join(' ').split(/\s+/);
    const owned=ids.map(id=>document.getElementById(id)).filter(n=>visible(n));
    if(owned.length===1)return owned[0];
    const inside=[...el.querySelectorAll('[role="listbox"],.phoenix-selectList')].filter(visible);return inside.length===1?inside[0]:null;
  };
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const closePopup=async el=>{el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));await pause(20);if(popupFor(el))el.click();};
  const openPopup=async el=>{
    let popup=popupFor(el);if(popup)return popup;
    const before=new Set([...document.querySelectorAll('[role="listbox"],.phoenix-selectList')].filter(visible));el.click();
    for(let i=0;i<5;i++){
      await pause(60);popup=popupFor(el);if(popup)return popup;
      // Only a newly visible, unambiguous Phoenix menu may be associated without ARIA.
      if(el.matches('.phoenix-select')){const fresh=[...document.querySelectorAll('.phoenix-selectList')].filter(n=>visible(n)&&!before.has(n));if(fresh.length===1)return fresh[0];}
    }
    return null;
  };
  const readOptions=popup=>[...popup.querySelectorAll(choiceSelector)].filter(visible).map(node=>({node,value:clean(node.textContent),label:clean(node.textContent),disabled:disabled(node)}));
  const safeOptions=options=>options.length>0&&options.length<=200&&options.every(o=>o.value)&&new Set(options.map(o=>o.value)).size===options.length;
  if(args.action==='scan'){
    const state={token:args.token,url:location.href,title:document.title,entries:new Map()};globalThis.__jevApply=state;
    const fields=[],seenRadios=new Set();
    const elements=document.querySelectorAll('input,textarea,select,[role="combobox"],.phoenix-select,.phoenix-radio-group,[role="radiogroup"]');
    for(const el of elements){
      if(!visible(el)||['hidden','submit','reset','button','image','password','checkbox'].includes(el.type))continue;
      if(el.closest('nav,header,[role="search"]')&&!el.closest('form,.form'))continue;
      const owner=el.parentElement?.closest('.phoenix-select,[role="combobox"]');if(owner&&owner!==el)continue;
      const customRadio=el.matches('.phoenix-radio-group,[role="radiogroup"]')&&!el.querySelector('input[type="radio"]');
      if(el.matches('[role="radiogroup"]')&&!customRadio)continue;
      const customSelect=el.matches('.phoenix-select,[role="combobox"]')&&el.tagName!=='SELECT';
      let type=customRadio?'radio':customSelect?'custom-select':el.type||'text';let radios=null,label=labelOf(el),options,kind;
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
        const multi=el.classList.contains('phoenix-select--multi')||el.getAttribute('aria-multiselectable')==='true';
        const calendar=!!el.querySelector('use[href*="field_date_time_picker"],use[*|href*="field_date_time_picker"]');
        if(multi)reason='多选或级联控件，暂需手动选择';
        else if(calendar)reason='自定义日期控件，已识别栏目，需手动选择日期';
        else {const popup=await openPopup(el);if(popup){options=readOptions(popup).map(({node,...o})=>o);supported=safeOptions(options)&&popup.getAttribute('aria-multiselectable')!=='true';await closePopup(el);}if(!supported)reason='已识别下拉栏目，但未能读取唯一完整的选项列表，请手动选择';}
      }
      if(customRadio)supported=safeOptions(options);
      if(el.tagName==='SELECT'){supported=!el.multiple;options=[...el.options].map(o=>({value:o.value,label:clean(o.textContent),disabled:o.disabled||o.parentElement?.disabled===true}));}
      if(radios)options=radios.map(o=>({value:o.value,label:labelOf(o),disabled:!visible(o)}));
      if(options?.length>200||options&&new Set(options.map(o=>o.value)).size!==options.length)supported=false;
      const id='f'+fields.length,entry={el,radios,kind,signature:signature(el,!!radios),options};
      const current=kind?customValue(entry):radios?(radios.find(x=>x.checked)?.value||''):(el.value||'');let hasValue=!!current;
      if(el.tagName==='SELECT'){const selected=el.selectedOptions[0];if(selected&&(/^(请选择|选择|please select|select|choose|--)/i.test(clean(selected.textContent))||selected.disabled))hasValue=false;}
      const item=itemOf(el);const maxLength=el.maxLength>0?el.maxLength:Number(item?.querySelector('.phoenix-textarea')?.textContent.match(/\/\s*(\d+)/)?.[1])||null;
      fields.push({id,label,name:clean(el.name),type,context:contextOf(el),placeholder:clean(el.placeholder),required:el.required||el.getAttribute('aria-required')==='true'||!!item?.querySelector('.form-item__required'),maxLength,hasValue,options,supported,reason:supported?'':type==='file'?'附件需要手动上传':reason});state.entries.set(id,entry);
      if(fields.length>=100)break;
    }
    return {fields,url:location.href,title:document.title,pageContext:{title:clean(document.title),headings:[...new Set([...document.querySelectorAll('h1,h2,h3')].map(x=>clean(x.innerText)).concat(fields.map(f=>f.context.split(' · ')[0])))].filter(Boolean).slice(0,20),description:clean(document.querySelector('meta[name="description"]')?.content)},atLimit:fields.length>=100};
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
          else {popup=await openPopup(el);if(!popup)throw Error('无法重新打开对应下拉选项');choices=readOptions(popup);}
          const same=choices.length===entry.options.length&&choices.every((o,i)=>o.value===entry.options[i].value&&o.disabled===entry.options[i].disabled);
          if(!same){if(popup)await closePopup(el);throw Error('选项已变化，请重新扫描');}
          const option=choices.find(o=>!o.disabled&&o.value===value);if(!option)throw Error('选项已变化');option.node.click();await pause(80);
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
