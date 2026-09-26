// Runs in the extension's isolated world. Keep all helpers inside this function.
export async function pageBridge(args) {
  const capturing=args.action==='capture';
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim().slice(0,220);
  // Moka uses CSS modules: match stable component prefixes, not build hashes.
  const mokaSelect='[class*="sd-Select-container-"]';
  const selectRoots='.phoenix-select,.ant-select,.el-select,.ant-cascader,.el-cascader,[role="combobox"],'+mokaSelect;
  const recordRoots='.form,[class*="apply-fields-"],.form-cell-inner';
  const beisenRoots='.constant-main-selector-container,.area-selector-container,.phoenix-calendar';
  const popupRoots=beisenRoots+',[role="listbox"],.phoenix-selectList,[class*="sd-Select-menu-"],.ant-select-dropdown,.el-select-dropdown,.ant-cascader-menus,.ant-cascader-dropdown,.el-cascader__dropdown';
  const visible=el=>el?.isConnected&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none'&&!el.closest('[inert],[hidden]')&&(capturing||!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('.phoenix-select--disabled,.ant-select-disabled,.el-select.is-disabled,.ant-cascader-disabled,.el-cascader.is-disabled,[class*=sd-Select-containerDisabled-]')&&(!el.matches(mokaSelect)||!el.querySelector('input:disabled')));
  const labelText=node=>{const copy=node.cloneNode(true);for(const child of copy.querySelectorAll('input,select,textarea,button,[role="combobox"],script,style,.labelRequired,.anticon'))child.remove();return copy.textContent||'';};
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
    const hotjob=el.closest('.form-cell');
    if(hotjob)return {title:clean(hotjob.querySelector('.tit-wrap .tit p')?.textContent||hotjob.querySelector('.tit-wrap .tit')?.textContent),scope:hotjob,form:el.closest('.form-cell-inner')};
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
  const choiceSelector='[role="option"],.phoenix-selectList__listItem,[class*=sd-Menu-content-item-],.ant-select-item-option,.ant-select-dropdown-menu-item,.el-select-dropdown__item,.ant-cascader-menu-item,.el-cascader-node';
  const radioSelector='.phoenix-radio,[role="radio"]';
  const disabled=el=>!!el.closest('[aria-disabled="true"],[class*=sd-Menu-disabled-],[class*=sd-Select-disabled-],.ant-select-item-option-disabled,.ant-select-dropdown-menu-item-disabled,.el-select-dropdown__item.is-disabled,.ant-cascader-menu-item-disabled,.el-cascader-node.is-disabled')||el.getAttribute('aria-disabled')==='true'||el.classList.contains('phoenix-radio--disabled')||el.classList.contains('phoenix-selectList__listItem--disabled');
  const radioSelected=el=>el.getAttribute('aria-checked')==='true'||!!el.querySelector('.phoenix-radio__circle--checked');
  const customValue=entry=>{
    if(entry.kind==='custom-radio')return [...entry.el.querySelectorAll(radioSelector)].find(radioSelected)?.textContent.trim()||'';
    const display=s=>String(s??'').trim();
    const el=entry.el;const tag=el.querySelector('.phoenix-select__tag,.phoenix-select__tagItem');
    if(tag)return display(tag.textContent);
    const ant=el.querySelector('.ant-select-selection-selected-value');if(ant)return display(ant.textContent);
    if(el.matches('.ant-select,.ant-select-selection,.ant-select-selector'))return [...el.querySelectorAll('.ant-select-selection__choice__content,.ant-select-selection-item')].map(n=>display(n.textContent)).join('、');
    if(el.matches('.ant-cascader'))return display(el.querySelector('.ant-cascader-picker-label')?.textContent||el.querySelector('input')?.value);
    if(el.matches('.el-select'))return display(el.querySelector('.el-select__selected-item:not(.is-transparent):not(.el-select__placeholder)')?.textContent||el.querySelector('input[readonly]')?.value||'');
    if(el.matches(mokaSelect))return display(el.querySelector('[class*=sd-Input-display-value-]')?.textContent);
    if(el.matches('.phoenix-select'))return display(el.querySelector('.phoenix-select__content')?.textContent);
    return display(el.getAttribute('aria-valuetext')||(el.tagName==='INPUT'?el.value:el.querySelector('input')?.value)||'');
  };
  const popupCache=new WeakMap();
  const outerMenu=node=>node.closest('.ant-select-dropdown,.el-select-dropdown,.ant-cascader-dropdown,.ant-cascader-menus,.el-cascader__dropdown')||node;
  const popupFor=el=>{
    const linked=[el,...el.querySelectorAll('[aria-controls],[aria-owns]')];
    const ids=[...new Set(linked.flatMap(n=>[n.getAttribute('aria-controls'),n.getAttribute('aria-owns')]).filter(Boolean).join(' ').split(/\s+/))];
    const owned=[...new Set(ids.map(id=>document.getElementById(id)).filter(Boolean).map(outerMenu).filter(visible))];
    if(owned.length===1)return owned[0];
    const cached=popupCache.get(el);if(visible(cached))return cached;
    const owner=el.matches(mokaSelect)?el.closest('[class*=sd-Dropdown-container-]'):el;
    const inside=[...new Set([...(owner||el).querySelectorAll(popupRoots)].map(outerMenu).filter(visible))];return inside.length===1?inside[0]:null;
  };
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const press=node=>{node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0}));node.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse',button:0}));node.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0}));if(typeof node.click==='function')node.click();else node.dispatchEvent(new MouseEvent('click',{bubbles:true}));};
  const trigger=el=>el.querySelector('.ant-select-selector,.ant-select-selection,.el-select__wrapper,.el-input__wrapper')||el;
  const closePopup=async el=>{
    const current=popupFor(el);
    if(current?.matches('.constant-main-selector-container,.area-selector-container')){
      const cancel=dialogButton(current,'取消');if(!cancel)throw Error('[SELECT_CANCEL] 弹窗缺少唯一取消按钮，已停止操作');press(cancel);await waitUntil(()=>!visible(current),'SELECT_CANCEL','取消后弹窗未关闭，请手动关闭后重试');return;
    }
    (el.querySelector('input')||el).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));await pause(30);
    if(popupFor(el)){press(trigger(el));await pause(30);}
    // Blur without clicking an unrelated page button.
    if(popupFor(el)){(el.querySelector('input')||el).blur();document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await pause(30);}
  };
  const openPopup=async el=>{
    let popup=popupFor(el);if(popup)return popup;
    const rect=el.getBoundingClientRect();
    if(rect.top<0||rect.bottom>innerHeight){el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});await pause(100);}
    for(let attempt=0;attempt<2;attempt++){
      const before=new Set([...document.querySelectorAll(popupRoots)].map(outerMenu).filter(visible));press(trigger(el));
      for(let i=0;i<25;i++){
        await pause(60);popup=popupFor(el);if(popup)return popup;
        // Portal menus can be outside the field. Only one newly visible menu is safe.
        const fresh=[...new Set([...document.querySelectorAll(popupRoots)].map(outerMenu).filter(n=>visible(n)&&!before.has(n)))];
        if(fresh.length===1){popupCache.set(el,fresh[0]);return fresh[0];}
      }
      // A missed opening may be retried once; never toggle an unassociated open menu.
      if(!visible(el)||[...document.querySelectorAll(popupRoots)].some(visible))break;
    }
    return null;
  };
  const readOptions=popup=>[...popup.querySelectorAll(popup.matches('.constant-main-selector-container')?'.left-container .list-item-container':choiceSelector)].filter(n=>visible(n)&&!n.parentElement?.closest(choiceSelector)&&(!popup.querySelector('.ant-select-item-option')||n.matches('.ant-select-item-option'))).map(node=>{
    const text=node.querySelector('.item-text-label,[data-key="sugar.select.label"],.ant-select-item-option-content,.ant-cascader-menu-item-content,.el-cascader-node__label')?.textContent||node.textContent;
    const label=String(text||'').replace(/\s+/g,' ').trim();return {node,value:label,label,disabled:disabled(node)};
  });
  const stableOptions=async popup=>{
    let previous='',stable=0,options=[];
    for(let i=0;i<25;i++){options=readOptions(popup);const snapshot=JSON.stringify(options.map(({node,...o})=>o));stable=options.length&&snapshot===previous?stable+1:0;if(stable>=3)return options;previous=snapshot;await pause(80);}
    return [];
  };
  const searchInput=el=>{const input=el.matches('input')?el:el.querySelector('input:not([type=hidden])');return input&&!input.readOnly&&!input.disabled?input:null;};
  const scrollArea=popup=>[popup,...popup.querySelectorAll('*')].find(n=>n.clientHeight>0&&n.scrollHeight>n.clientHeight+3&&/(auto|scroll)/.test(getComputedStyle(n).overflowY));
  const isCascade=el=>el.matches('.ant-cascader,.el-cascader')||el.getAttribute('data-control-type')==='cascader';
  const normalizedPath=value=>String(value).replace(/\s*(?:\/|／|>|＞|→)\s*/g,'').replace(/\s+/g,'');
  const selectedEquals=(entry,value)=>entry.kind==='beisen-calendar'?calendarValue(customValue(entry),entry.calendarType)===value:entry.kind==='beisen-area'?normalizedPath(customValue(entry))===normalizedPath(value)||entry.areaReceipt?.value===value&&entry.areaReceipt.display===customValue(entry):entry.selectionMode==='cascade'?normalizedPath(customValue(entry))===normalizedPath(value):customValue(entry)===value;
  const seekOption=async(popup,value)=>{
    const scroller=scrollArea(popup);if(scroller){scroller.scrollTop=0;scroller.dispatchEvent(new Event('scroll',{bubbles:true}));await pause(100);}
    let last=-1;
    for(let step=0;step<60;step++){
      const choices=await stableOptions(popup),matches=choices.filter(o=>!o.disabled&&o.value===value);
      if(matches.length>1)throw Error('[SELECT_AMBIGUOUS] 找到多个同名选项，请手动确认');
      if(matches.length===1)return matches[0];
      if(!scroller||scroller.scrollTop===last||scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-2)break;
      last=scroller.scrollTop;scroller.scrollTop+=Math.max(20,scroller.clientHeight*.8);scroller.dispatchEvent(new Event('scroll',{bubbles:true}));await pause(100);
    }
    return null;
  };
  const chooseCascade=async(el,popup,value)=>{
    const expected=normalizedPath(value);let consumed='';
    for(let depth=0;depth<5;depth++){
      await stableOptions(popup);
      const columns=[...popup.querySelectorAll('.ant-cascader-menu,.el-cascader-menu,[role=menu]')].filter(visible);
      const column=columns[depth];if(!column)throw Error('[CASCADE_LEVEL] 未读取到下一层级，请核对省市区是否齐全');
      const candidates=readOptions(column).filter(o=>!o.disabled&&expected.startsWith(consumed+normalizedPath(o.label)));
      if(candidates.length!==1)throw Error('[CASCADE_AMBIGUOUS] 素材无法唯一对应当前层级，请提供完整省市区路径');
      const option=candidates[0];consumed+=normalizedPath(option.label);press(option.node);await pause(200);
      if(consumed===expected)return;
    }
    throw Error('[CASCADE_DEPTH] 级联层级超过支持范围，请手动选择');
  };
  const dialogButton=(popup,label)=>{
    const footer=popup.querySelector('.selector-footer-button,.area-footer-button');
    const matches=[...(footer?.querySelectorAll('.phoenix-button__content')||[])].filter(n=>visible(n)&&clean(n.textContent)===label);
    return matches.length===1&&!matches[0].closest('[aria-disabled="true"],[class*="--disabled"],.disabled')?matches[0]:null;
  };
  const dialogLimit=popup=>{
    const text=popup.querySelector('.select-data-num,.selected-area-title,.right-container')?.textContent||'';
    return Number(text.match(/(?:已选[^\d]*)?\d+\s*[/／]\s*(\d+)/)?.[1])||null;
  };
  const waitUntil=async(fn,code,message)=>{for(let i=0;i<30;i++){const result=fn();if(result)return result;await pause(80);}throw Error(`[${code}] ${message}`);};
  const textInput=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));};
  const confirmDialog=async(popup)=>{
    const button=dialogButton(popup,'确定');if(!button)throw Error('[SELECT_CONFIRM] 弹窗没有唯一可用的确定按钮');
    press(button);await waitUntil(()=>!visible(popup),'SELECT_CONFIRM','已点确定但弹窗仍未关闭');
  };
  const chooseBeisen=async(entry,popup,value)=>{
    if(dialogLimit(popup)!==1)throw Error('[SELECT_MULTI] 当前弹窗不是可确认的单选模式');
    let option=await seekOption(popup,value);
    if(!option){
      const search=popup.querySelector('input[placeholder="搜索"]');if(!search)throw Error('[SELECT_NO_MATCH] 弹窗中没有对应选项或搜索框');
      textInput(search,value);await pause(400);option=await seekOption(popup,value);
    }
    if(!option)throw Error('[SELECT_NO_MATCH] 搜索后未找到唯一且可用的选项');
    press(option.node.querySelector('.icon-container svg')||option.node.querySelector('.icon-container')||option.node.querySelector('.item-text-label')||option.node);
    await waitUntil(()=>/已选\s*1\s*[/／]\s*1/.test(popup.querySelector('.right-container')?.textContent||''),'SELECT_STAGE','选择后未确认进入已选区');
    const right=popup.querySelector('.select-data-container');if(!right?.textContent.includes(value))throw Error('[SELECT_STAGE] 已选内容与目标不一致，未点击确定');
    await confirmDialog(popup);
  };
  const chooseBeisenArea=async(entry,popup,value)=>{
    if(dialogLimit(popup)!==1)throw Error('[SELECT_MULTI] 地区多选暂需手动确认');
    const expected=normalizedPath(value);let prefix='';
    for(let depth=0;depth<5;depth++){
      const rows=await waitUntil(()=>{const rows=[...popup.querySelectorAll('.left-container .area-item-container')].filter(visible);return rows.length?rows:null;},'AREA_LOAD','地区列表未加载完成');
      const candidates=rows.map(row=>({row,label:clean(row.querySelector('.area-text-label')?.textContent)})).filter(x=>x.label&&expected.startsWith(prefix+normalizedPath(x.label)));
      if(candidates.length!==1)throw Error('[AREA_PATH] 当前层级无法唯一匹配，请提供完整省市区名称');
      const {row,label}=candidates[0];prefix+=normalizedPath(label);
      if(prefix===expected){
        const icon=row.querySelector('.icon-container');if(!icon||!visible(icon))throw Error('[AREA_LEVEL] 当前层级不可选择');press(icon.querySelector('svg')||icon);
        await waitUntil(()=>/已选地区\s*1\s*[/／]\s*1/.test(popup.querySelector('.right-container')?.textContent||''),'SELECT_STAGE','地区未进入已选区');
        if(!popup.querySelector('.right-container')?.textContent.includes(label))throw Error('[SELECT_STAGE] 已选地区与目标不一致');
        await confirmDialog(popup);await waitUntil(()=>normalizedPath(customValue(entry))===expected||normalizedPath(customValue(entry))===normalizedPath(label),'SELECT_NOT_COMMITTED','确认地区后网页未保留预期值');
        // Leaf-only display is accepted only after this exact path was traversed and confirmed.
        entry.areaReceipt={value,display:customValue(entry)};return;
      }
      const nav=row.querySelector('.area-text-label:not(.no-hover)');if(!nav)throw Error('[AREA_PATH] 当前地区没有可进入的下一层级');
      const previous=rows.map(r=>r.textContent).join('|');press(nav);
      await waitUntil(()=>[...popup.querySelectorAll('.left-container .area-item-container')].filter(visible).map(r=>r.textContent).join('|')!==previous,'AREA_LOAD','点击地区后下一层级未加载');
    }
    throw Error('[AREA_PATH] 地区路径层级超过支持范围');
  };
  const calendarValue=(value,type)=>{
    const m=String(value).trim().match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?月?$/);if(!m||type==='date'&&!m[3]||type==='month'&&m[3])return null;
    const [year,month,day]=[Number(m[1]),Number(m[2]),Number(m[3]||1)],d=new Date(Date.UTC(year,month-1,day));
    return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?`${m[1]}-${m[2].padStart(2,'0')}${type==='date'?'-'+m[3].padStart(2,'0'):''}`:null;
  };
  const calendarDisabled=node=>disabled(node)||!!node.closest('[class*="disabled"],[aria-disabled="true"]');
  const chooseCalendar=async(entry,popup,value)=>{
    if(calendarValue(value,entry.calendarType)!==value)throw Error('[DATE_FORMAT] 日期格式或精度不符合控件要求，不能补造日期');
    const [year,month,day]=value.split('-').map(Number);
    const yearButton=popup.querySelector('.phoenix-calendar-month-panel-year-select')||popup.querySelector('.phoenix-calendar-year-select');if(!yearButton)throw Error('[DATE_PANEL] 未识别年份切换按钮');press(yearButton);
    await waitUntil(()=>popup.querySelector('.phoenix-calendar-year-panel'),'DATE_PANEL','年份面板未打开');
    let chosen=false;
    for(let step=0;step<25;step++){
      const years=[...popup.querySelectorAll('.phoenix-calendar-year-panel-year')].filter(visible);const target=years.filter(n=>Number(clean(n.textContent))===year);
      if(target.length===1){if(calendarDisabled(target[0]))throw Error('[DATE_DISABLED] 目标年份不可选');press(target[0]);chosen=true;break;}
      const numbers=years.map(n=>Number(clean(n.textContent))).filter(Number.isFinite);if(!numbers.length)throw Error('[DATE_PANEL] 未读取到年份选项');
      const nav=popup.querySelector(year<Math.min(...numbers)?'.phoenix-calendar-year-panel-prev-decade-btn':'.phoenix-calendar-year-panel-next-decade-btn');if(!nav||calendarDisabled(nav))throw Error('[DATE_RANGE] 目标年份超出控件范围');
      const previous=numbers.join();press(nav);await waitUntil(()=>[...popup.querySelectorAll('.phoenix-calendar-year-panel-year')].map(n=>Number(clean(n.textContent))).join()!==previous,'DATE_PANEL','年份翻页未生效');
    }
    if(!chosen)throw Error('[DATE_RANGE] 年份导航达到次数上限');
    await waitUntil(()=>!popup.querySelector('.phoenix-calendar-year-panel'),'DATE_PANEL','选择年份后面板未切换');
    if(!popup.querySelector('.phoenix-calendar-month-panel')){const button=popup.querySelector('.phoenix-calendar-month-select');if(!button)throw Error('[DATE_PANEL] 未识别月份按钮');press(button);}
    await waitUntil(()=>popup.querySelector('.phoenix-calendar-month-panel-month'),'DATE_PANEL','月份面板未打开');
    const months=[...popup.querySelectorAll('.phoenix-calendar-month-panel-month')].filter(n=>Number(clean(n.textContent).replace('月',''))===month&&visible(n));
    if(months.length!==1||calendarDisabled(months[0]))throw Error('[DATE_DISABLED] 目标月份不可选');press(months[0]);
    if(entry.calendarType==='month')return;
    await waitUntil(()=>!popup.querySelector('.phoenix-calendar-month-panel'),'DATE_PANEL','选择月份后日期面板未显示');
    const shownYear=Number(clean(popup.querySelector('.phoenix-calendar-year-select')?.textContent).replace('年','')),shownMonth=Number(clean(popup.querySelector('.phoenix-calendar-month-select')?.textContent).replace('月',''));
    if(shownYear!==year||shownMonth!==month)throw Error('[DATE_PANEL] 日历展示的年月与目标不一致');
    const days=[...popup.querySelectorAll('.phoenix-calendar-cell:not(.phoenix-calendar-last-month-cell):not(.phoenix-calendar-next-month-btn-day) .phoenix-calendar-date')].filter(n=>Number(clean(n.textContent))===day&&visible(n));
    if(days.length!==1||calendarDisabled(days[0]))throw Error('[DATE_DISABLED] 目标日期不可选');press(days[0]);
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
  if(args.action==='scan'||capturing){
    const state={token:args.token,url:location.href,title:document.title,entries:new Map()};globalThis.__jevApply=state;
    const fields=[],seenRadios=new Set(),capturedGroups=new Set();
    const elements=document.querySelectorAll('input,textarea,select,'+selectRoots+',.phoenix-radio-group,[role="radiogroup"]');
    for(const el of elements){
      if(!visible(el)||['hidden','submit','reset','button','image','password',...(capturing?['file']:['checkbox'])].includes(el.type))continue;
      if(el.closest(popupRoots))continue;
      if(el.closest('nav,header,[role="search"]')&&!el.closest('form,.form'))continue;
      const owner=el.parentElement?.closest(selectRoots);if(owner&&owner!==el)continue;
      const customRadio=el.matches('.phoenix-radio-group,[role="radiogroup"]')&&!el.querySelector('input[type="radio"]');
      if(el.matches('[role="radiogroup"]')&&!customRadio)continue;
      const customSelect=el.matches(selectRoots)&&el.tagName!=='SELECT';
      const datePart=datePartOf(el);
      if(capturing&&el.closest('.ant-checkbox-group')&&capturedGroups.has(el.closest('.ant-checkbox-group')))continue;
      let type=customRadio?'radio':customSelect?'custom-select':el.type||'text';let radios=null,label=labelOf(el)+(datePart?' · '+dateLabel(datePart):''),options,kind,selectionMode,calendarType;
      if(customRadio){label=groupLabel(el)||label;kind='custom-radio';options=[...el.querySelectorAll(radioSelector)].map(r=>({value:clean(r.textContent),label:clean(r.textContent),disabled:disabled(r)||!visible(r)}));}
      else if(type==='radio'){
        const group=el.closest('.ant-radio-group,fieldset,[role="radiogroup"]')||el.form||document;if(!el.name&&!el.closest('.ant-radio-group'))continue;
        radios=[...group.querySelectorAll('input[type="radio"]')].filter(x=>x.name===el.name&&x.form===el.form);if(seenRadios.has(radios[0]))continue;seenRadios.add(radios[0]);label=groupLabel(el)||el.name;
      }
      if(consent.test(label+' '+(el.name||'')+' '+(el.autocomplete||'')))continue;
      let supported=['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&type!=='file'&&!el.readOnly;
      let reason='自定义或暂不支持的控件，需要手动填写';
      if(el.tagName==='INPUT'&&!['text','email','tel','url','number','date','month','search','radio'].includes(type))supported=false;
      if(customSelect&&!capturing){
        kind='custom-select';supported=false;
        const multi=(el.classList.contains('phoenix-select--multi')||!!el.querySelector('[class*=sd-Tag-]'))||el.matches('.ant-select-multiple,.ant-select-enabled.ant-select-multiple')||!!el.querySelector('.el-select__tags,.ant-select-selection--multiple,.ant-select-selection__choice,.el-tag')||el.getAttribute('aria-multiselectable')==='true';
        const calendar=!!el.querySelector('use[href*="field_date_time_picker"],use[*|href*="field_date_time_picker"]');
        if(multi)reason='[SELECT_MULTI] 当前为多选控件，需手动确认各选项';
        else {
          const popup=await openPopup(el);
          if(popup){
            if(popup.matches('.phoenix-calendar')){
              calendarType=popup.querySelector('.phoenix-calendar-month-panel')&&!popup.querySelector('.phoenix-calendar-input')?'month':popup.querySelector('.phoenix-calendar-input')?'date':null;
              if(calendarType){type=calendarType;kind='beisen-calendar';supported=true;}
            }else if(popup.matches('.constant-main-selector-container,.area-selector-container')){
              const area=popup.matches('.area-selector-container');kind=area?'beisen-area':'beisen-select';selectionMode=area?'cascade':'search';
              options=area?[]:(await stableOptions(popup)).map(({node,...o})=>o);
              supported=dialogLimit(popup)===1&&!!dialogButton(popup,'确定')&&!!dialogButton(popup,'取消')&&(area||safeOptions(options)||!options.length);
              if(!supported)reason='[SELECT_MULTI] 弹窗不是可确认的单选模式，需手动处理';
            }else if(!calendar){
              options=(await stableOptions(popup)).map(({node,...o})=>o);
              selectionMode=isCascade(el)?'cascade':searchInput(el)?'search':scrollArea(popup)?'virtual':'list';
              supported=popup.getAttribute('aria-multiselectable')!=='true'&&(safeOptions(options)||!options.length&&selectionMode==='search');
            }
            await closePopup(el);
          }
          if(!supported)reason=popup?'[SELECT_OPTIONS] 选项为空、重复或数量过多，无法安全匹配':'[SELECT_POPUP] 未找到与字段唯一关联的下拉菜单';
        }
      }
      if(customSelect&&capturing)kind='custom-select';
      if(customRadio)supported=safeOptions(options);
      if(el.tagName==='SELECT'){supported=!el.multiple;options=[...el.options].map(o=>({value:o.value,label:clean(o.textContent),disabled:o.disabled||o.parentElement?.disabled===true}));}
      if(radios)options=radios.map(o=>({value:o.value,label:clean(o.closest('label')?labelText(o.closest('label')):labelOf(o)),disabled:!visible(o)}));
      if(options?.length>250||options&&new Set(options.map(o=>o.value)).size!==options.length)supported=false;
      const id='f'+fields.length,entry={el,radios,kind,selectionMode,calendarType,signature:signature(el,!!radios),options};
      const current=kind?customValue(entry):radios?(radios.find(x=>x.checked)?.value||''):(el.value||'');let hasValue=!!current;
      if(el.tagName==='SELECT'){const selected=el.selectedOptions[0];if(selected&&(/^(请选择|选择|please select|select|choose|--)/i.test(clean(selected.textContent))||selected.disabled))hasValue=false;}
      const item=itemOf(el);const maxLength=el.maxLength>0?el.maxLength:Number(item?.querySelector('.phoenix-textarea')?.textContent.match(/\/\s*(\d+)/)?.[1])||null;
      let capturedValue,captureWarning;
      if(capturing){
        capturedValue=kind?customValue(entry):radios?(radios.find(r=>r.checked)?.closest('label')?.textContent?.trim()||''):(el.value||'');
        if(el.tagName==='SELECT')capturedValue=hasValue?(el.selectedOptions[0]?.textContent?.trim()||''):'';
        if(el.type==='checkbox'){
          const group=el.closest('.ant-checkbox-group');if(!group)continue;capturedGroups.add(group);label=groupLabel(el)||label;
          capturedValue=[...group.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.closest('label')?.textContent?.trim()).filter(Boolean).join('、');
        }
        const item=itemOf(el),combos=item?[...item.querySelectorAll('[role=combobox]')]:[];
        if(customSelect&&combos.length>1&&!datePart){if(capturedGroups.has(item))continue;capturedGroups.add(item);capturedValue=combos.map(el=>customValue({el,kind:'custom-select'})).filter(Boolean).join(' / ');captureWarning='组合选项已按页面顺序合并，请核对含义。';}
        if(!capturedValue.trim()||/^(请选择|please select|select|choose)(?:\s|$)/i.test(capturedValue)||capturedValue.length>10000)continue;
        if(label==='未命名字段')captureWarning='未识别到字段标题，请先补全名称。';
      }
      fields.push({id,label,datePart,...(capturing?{capturedValue,captureWarning}:{}),name:clean(el.name),type,context:contextOf(el),placeholder:clean(el.placeholder),required:el.required||el.getAttribute('aria-required')==='true'||!!item?.querySelector('.form-item__required'),maxLength,hasValue,options,selectionMode,supported,reason:supported?'':type==='file'?'附件需要手动上传':reason});state.entries.set(id,entry);
      if(fields.length>=(capturing?300:100))break;
    }
    const sections=discoverSections();state.sections=new Map(sections.map(s=>[s.id,s]));
    const experienceCategories=[...new Set([...document.querySelectorAll(recordRoots)].map(form=>{const c=form.querySelector('input,textarea,select,.phoenix-radio-group');return c?sectionCategory(sectionInfo(c).title):null;}).concat([...document.querySelectorAll('h1,h2,h3,h4,[role=tab],[class*=blockTitle-]')].map(n=>sectionCategory(clean(labelText(n))))).filter(Boolean))];
    return {fields,sections:sections.map(publicSection),experienceCategories,url:location.href,title:document.title,pageContext:{title:clean(document.title),headings:[...new Set([...document.querySelectorAll('h1,h2,h3')].map(x=>clean(x.innerText)).concat(fields.map(f=>f.context.split(' · ')[0])))].filter(Boolean).slice(0,20),description:clean(document.querySelector('meta[name="description"]')?.content)},atLimit:fields.length>=(capturing?300:100)};
  }
  if(args.action==='fill'||args.action==='verify'){
    const state=globalThis.__jevApply;if(!state||state.token!==args.token||state.url!==location.href||state.title!==document.title)return {results:args.items.map(x=>({id:x.id,ok:false,reason:'页面已变化，请重新扫描'}))};
    const results=[];
    for(const item of args.items){
      const entry=state.entries.get(item.id);if(!entry){results.push({id:item.id,ok:false,reason:'字段已失效'});continue;}const {el,radios,kind}=entry;
      if((args.action==='verify'?!el.isConnected:(!visible(el)||el.readOnly&&!kind))||signature(el,!!radios)!==entry.signature){results.push({id:item.id,ok:false,reason:'字段已变化，请重新扫描'});continue;}
      const current=kind?customValue(entry):radios?radios.find(x=>x.checked)?.value:el.value;
      if(args.action==='verify'){const valid=radios?radios.every(x=>x.validity.valid):!el.validity||el.validity.valid;const ok=(kind?selectedEquals(entry,String(item.value)):String(current??'')===String(item.value))&&valid;results.push({id:item.id,ok,reason:ok?'已填入并读取核验一致':!valid?'网页格式校验未通过，请检查':'网页未保留预期值，请手动检查'});continue;}
      const placeholder=el.tagName==='SELECT'&&el.selectedOptions[0]&&(/^(请选择|选择|please select|select|choose|--)/i.test(clean(el.selectedOptions[0].textContent))||el.selectedOptions[0].disabled);
      if(current&&!placeholder&&!args.overwrite){results.push({id:item.id,ok:false,reason:'已有内容，已跳过'});continue;}
      if(!['string','number'].includes(typeof item.value)){results.push({id:item.id,ok:false,reason:'无有效值'});continue;}const value=String(item.value);if(value.length>10000){results.push({id:item.id,ok:false,reason:'值过长'});continue;}
      let target=el;
      try{
        if(kind){
          const dynamic=kind==='beisen-calendar'||['search','virtual','cascade'].includes(entry.selectionMode);
          if(!dynamic&&!entry.options?.some(o=>!o.disabled&&o.value===value))throw Error('[SELECT_VALUE] 没有经过扫描确认的对应选项');
          if(kind==='custom-radio'){
            const matches=[...el.querySelectorAll(radioSelector)].filter(n=>!disabled(n)&&visible(n)&&clean(n.textContent)===value);
            if(matches.length!==1)throw Error('[SELECT_AMBIGUOUS] 单选选项已变化或不唯一');press(matches[0]);
          }else{
            let popup,input,oldQuery,searched=false,clicked=false;
            try{
              popup=await openPopup(el);if(!popup)throw Error('[SELECT_POPUP] 无法打开对应下拉菜单');
              if(kind==='beisen-calendar'){await chooseCalendar(entry,popup,value);clicked=true;}
              else if(kind==='beisen-select'){await chooseBeisen(entry,popup,value);clicked=true;}
              else if(kind==='beisen-area'){await chooseBeisenArea(entry,popup,value);clicked=true;}
              else if(entry.selectionMode==='cascade'){await chooseCascade(el,popup,value);clicked=true;}
              else{
                input=searchInput(el);let option=await seekOption(popup,value);
                if(!option&&entry.selectionMode==='search'&&input){
                  oldQuery=input.value;input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));searched=true;
                  // Remote searches debounce and then replace their options. Never choose from stale results.
                  await pause(450);popup=popupFor(el)||popup;
                }
                for(let attempt=0;attempt<(searched?4:1)&&!option;attempt++){
                  popup=popupFor(el)||popup;option=await seekOption(popup,value);if(!option&&searched)await pause(200);
                }
                if(!option)throw Error('[SELECT_NO_MATCH] 搜索或滚动后没有唯一对应的可用选项，请核对素材与网页选项');
                press(option.node);clicked=true;
              }
              for(let i=0;i<20&&!selectedEquals(entry,value);i++)await pause(80);
              if(!selectedEquals(entry,value))throw Error('[SELECT_NOT_COMMITTED] 已点击选项，但网页未保留预期选择');
              // An input's search query alone is not proof of committed selection.
              if(el.matches('input')&&popupFor(el))throw Error('[SELECT_NOT_COMMITTED] 搜索文字尚未确认为已选值');
            }finally{
              if(searched&&!clicked&&input?.isConnected){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,oldQuery);input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));}
              await closePopup(el);
            }
          }
          if(!selectedEquals(entry,value))throw Error('[SELECT_NOT_COMMITTED] 网页未确认选项选择，请手动检查');
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
