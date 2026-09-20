// Runs in the extension's isolated world. This function must be self-contained.
export function pageBridge(args) {
  const visible=el=>el.isConnected&&!el.disabled&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none'&&!el.closest('[inert]');
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim().slice(0,220);
  const labelText=node=>{const copy=node.cloneNode(true);for(const child of copy.querySelectorAll('input,select,textarea,button,[role="combobox"],script,style'))child.remove();return copy.textContent||'';};
  const labelOf=el=>{
    const labelled=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.innerText||'').join(' ');
    return clean(labelled||el.getAttribute('aria-label')||Array.from(el.labels||[]).map(labelText).join(' ')||el.getAttribute('placeholder')||el.getAttribute('name')||'未命名字段').replace(/[\s*：:]+$/,'');
  };
  const groupLabel=el=>clean(el.closest('fieldset')?.querySelector('legend')?.innerText||el.closest('[role="radiogroup"]')?.getAttribute('aria-label')||'');
  const contextOf=el=>{
    const group=el.closest('fieldset,section,[role="group"],[role="radiogroup"],article');
    if(group)return clean(group.querySelector('legend,h1,h2,h3,h4,[role="heading"]')?.innerText||group.getAttribute('aria-label')||'');
    let parent=el.parentElement;
    for(let i=0;i<3&&parent;i++,parent=parent.parentElement){const heading=parent.querySelector('h1,h2,h3,h4,[role="heading"]');if(heading)return clean(heading.innerText);}
    return '';
  };
  const signature=(el,radio)=>JSON.stringify([radio?groupLabel(el):labelOf(el),el.getAttribute('name'),el.tagName,el.type]);
  const consent=/同意|隐私|条款|声明|承诺|订阅|验证码|密码|consent|privacy|terms|agree|declaration|certif|subscribe|password|captcha/i;
  if(args.action==='scan'){
    const state={token:args.token,url:location.href,title:document.title,entries:new Map()};globalThis.__jevApply=state;
    const fields=[];const seenRadios=new Set();
    const elements=document.querySelectorAll('input,textarea,select,[role="combobox"]');
    for(const el of elements){
      if(!visible(el)||['hidden','submit','reset','button','image','password','checkbox'].includes(el.type))continue;
      const type=el.type||el.getAttribute('role')||'text';
      let radios=null,label=labelOf(el);
      if(type==='radio'){
        const group=el.closest('fieldset,[role="radiogroup"]')||el.form||document;
        if(!el.name)continue;
        radios=Array.from(group.querySelectorAll('input[type="radio"]')).filter(x=>x.name===el.name&&x.form===el.form);
        if(seenRadios.has(radios[0]))continue;seenRadios.add(radios[0]);
        label=groupLabel(el)||el.name;
      }
      if(consent.test(label+' '+(el.name||'')+' '+(el.autocomplete||'')))continue;
      let supported=['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&type!=='file'&&!el.readOnly;
      if(el.tagName==='INPUT'&&!['text','email','tel','url','number','date','month','search','radio'].includes(type))supported=false;
      if(el.getAttribute('role')==='combobox'&&el.tagName!=='SELECT')supported=false;
      let options;
      if(el.tagName==='SELECT') {supported=!el.multiple;options=Array.from(el.options).map(o=>({value:o.value,label:clean(o.textContent),disabled:o.disabled||o.parentElement?.disabled===true}));}
      if(radios)options=radios.map(o=>({value:o.value,label:labelOf(o),disabled:!visible(o)}));
      if(options?.length>200)supported=false;
      if(options&&new Set(options.map(o=>o.value)).size!==options.length)supported=false;
      const id='f'+fields.length;
      let current=radios?(radios.find(x=>x.checked)?.value||''):(el.value||'');
      let hasValue=!!current;
      if(el.tagName==='SELECT'){
        const selected=el.selectedOptions[0];
        if(selected&&(/^(请选择|选择|please select|select|choose|--)/i.test(clean(selected.textContent))||selected.disabled))hasValue=false;
      }
      const field={id,label,name:clean(el.name),type:radios?'radio':type,context:contextOf(el),placeholder:clean(el.placeholder),required:el.required,maxLength:el.maxLength>0?el.maxLength:null,hasValue,options,supported,reason:supported?'':type==='file'?'附件需要手动上传':'自定义或暂不支持的控件，需要手动填写'};
      fields.push(field);state.entries.set(id,{el,radios,signature:signature(el,!!radios)});
      if(fields.length>=100)break;
    }
    return {fields,url:location.href,title:document.title,pageContext:{title:clean(document.title),headings:Array.from(document.querySelectorAll('h1,h2,h3')).slice(0,12).map(x=>clean(x.innerText)),description:clean(document.querySelector('meta[name="description"]')?.content)},atLimit:fields.length>=100};
  }
  if(args.action==='fill'||args.action==='verify'){
    const state=globalThis.__jevApply;
    if(!state||state.token!==args.token||state.url!==location.href||state.title!==document.title)return {results:args.items.map(x=>({id:x.id,ok:false,reason:'页面已变化，请重新扫描'}))};
    const results=[];
    for(const item of args.items){
      const entry=state.entries.get(item.id);
      if(!entry){results.push({id:item.id,ok:false,reason:'字段已失效'});continue;}
      const {el,radios}=entry;
      if((args.action==='verify'?!el.isConnected:(!visible(el)||el.readOnly))||signature(el,!!radios)!==entry.signature){results.push({id:item.id,ok:false,reason:'字段已变化，请重新扫描'});continue;}
      if(args.action==='verify'){
        const actual=radios?radios.find(x=>x.checked)?.value:el.value;const valid=radios?radios.every(x=>x.validity.valid):!el.validity||el.validity.valid;
        const ok=String(actual??'')===String(item.value)&&valid;results.push({id:item.id,ok,reason:ok?'已填入并读取核验一致':!valid?'网页格式校验未通过，请检查':'网页未保留预期值，请手动检查'});continue;
      }
      // Re-evaluate the current state immediately before writing.
      const current=radios?radios.find(x=>x.checked)?.value:el.value;
      const placeholder=el.tagName==='SELECT'&&el.selectedOptions[0]&&(/^(请选择|选择|please select|select|choose|--)/i.test(clean(el.selectedOptions[0].textContent))||el.selectedOptions[0].disabled);
      if(current&&!placeholder&&!args.overwrite){results.push({id:item.id,ok:false,reason:'已有内容，已跳过'});continue;}
      if(!['string','number'].includes(typeof item.value)){results.push({id:item.id,ok:false,reason:'无有效值'});continue;}
      const value=String(item.value);
      if(value.length>10000){results.push({id:item.id,ok:false,reason:'值过长'});continue;}
      let target=el;
      try{
        if(radios){
          target=radios.find(o=>o.value===value&&visible(o));if(!target)throw Error('选项已变化');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked').set.call(target,true);
        }else{
          if(el.tagName==='SELECT'&&!Array.from(el.options).some(o=>o.value===value&&!o.disabled&&!o.parentElement?.disabled))throw Error('选项已变化');
          if(el.maxLength>0&&value.length>el.maxLength)throw Error('超过字段长度上限');
          const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
          if(el.value!==value){Object.getOwnPropertyDescriptor(proto,'value').set.call(el,current||'');throw Error('该控件不接受此格式');}
        }
        target.dispatchEvent(new Event('input',{bubbles:true,composed:true}));target.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
        results.push({id:item.id,ok:true,reason:target.validity&&!target.validity.valid?'已填入，但网页格式校验未通过，请检查':'已填入'});
      }catch(e){results.push({id:item.id,ok:false,reason:e.message||'填写失败'});}
    }
    return {results};
  }
  return {error:'Unknown action'};
}
