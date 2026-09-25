import {BASE_FIELDS,RECORD_FIELDS,normalize} from './core.js';
import {fieldRecord} from './material-index.js';
export const LEARN_CATEGORIES={base:'个人基本信息',education:'教育经历',internship:'实习经历',work:'工作经历',project:'项目经验',language:'外语能力',family:'家庭关系',skills:'个人能力 / 自我评价',awards:'获奖经历',other:'其他信息'};
const privateLabel=/证件|身份证|护照|准考证|成绩单编号|家庭|父亲|母亲/;
const siteLabel=/期望|意向|调剂|应聘|招聘|渠道|薪资|薪酬|服从/;
export const forbiddenLabel=/密码|验证码|同意|隐私|条款|声明|签名|password|captcha|consent|privacy|terms|token|api.?key/i;
// A school/company/project label alone cannot identify which experience it belongs to.
// Keep general degree questions (for example 最高学历) and personal/contact fields unchanged.
const experienceLabels=new Set([
 ...['education','internship','work','project'].flatMap(definitions).filter(([key])=>key!=='degree'),
 ['college','学院',['学院名称','院系','院系名称','所属学院']],
 ['department','部门',['部门名称','所属部门']],
 ['title','职务名称',['项目职务','项目角色','担任角色']],
 ['duties','实习职责',[]],['project','项目内容',[]]
].flatMap(([,title,aliases])=>[title,...aliases]).map(normalize).filter(label=>!['description','from','to'].includes(label)));
const experienceLabel=label=>experienceLabels.has(normalize(String(label||'').replace(/[（(][^）)]*[）)]/g,'')));
function explicitLearningRecord(field){
 const ref=fieldRecord(field);if(!ref)return null;
 const explicitSource=field.sourceRecord?.category===ref.category&&field.sourceRecord?.record===ref.record;
 return explicitSource||/第\s*\d+\s*条|(?:经历|经验)\s*\d+/.test(field.context||'')?ref:null;
}
export function learningContextWarning(field){
 const section=(field.context||'').split(' · ')[0];
 const experience=experienceLabel(field.label)||/^(教育(?:经历|背景)|实习(?:经历|经验)|工作(?:经历|经验|[／/和及、]实习经历)|(?:课题)?项目(?:经历|经验))/.test(section);
 return experience&&!explicitLearningRecord(field)?'未能确认这项资料属于哪段经历，请先确认资料类目和第几条经历；不会自动复用到缺少经历上下文的字段。':'';
}
export function learningCategory(field){
 const section=(field.context||'').split(' · ')[0];const r=fieldRecord(field);if(r)return r.category;
 if(/家庭|亲属|紧急联系/.test(section))return 'family';
 if(/外语|语言/.test(section))return 'language';
 if(/自我评价|个人能力|个人技能|专业技能/.test(section+' '+(field.label||'')))return 'skills';
 if(/获奖/.test(section))return 'awards';
 if(learningContextWarning(field))return 'other';
 if(!section||/^(个人|基本|联系)/.test(section)||BASE_FIELDS.some(([,title,aliases])=>[title,...aliases].some(a=>normalize(a)===normalize(field.label))))return 'base';return 'other';
}
function definitions(category){
 const time=[['start','开始日期',['开始时间','开始日期','起始时间','入学时间','入职时间','start date']],['end','结束日期',['结束时间','结束日期','毕业时间','离职时间','end date']]];
 if(category==='base')return [...BASE_FIELDS,['degree','最高学历',['学历','最高学历']],['city','现居城市',['现居住地','所在地']],['phone','手机号',['移动电话']]];
 if(category==='education')return [...RECORD_FIELDS.education,...time];
 if(['internship','work'].includes(category))return [...RECORD_FIELDS.work,...time,['company','公司',['企业名称','单位名称','实习公司']],['title','职位',['职位名称','岗位','实习岗位']],['description','工作内容',['工作职责','工作描述','实习内容','实习描述']]];
 if(category==='project')return [...time,['name','项目名称',['项目名称']],['responsibilities','项目职责',['项目职责','项目中职责']],['description','项目描述',['项目描述','项目介绍']]];
 if(category==='skills')return [['description','个人能力',['个人技能','个人能力','专业技能','自我评价','评价内容']]];
 return time;
}
export function learningProperty(label,category,datePart){
 if(datePart&&datePart.boundary!=='single')return datePart.boundary+'.'+datePart.unit;
 label=String(label||'');const norm=normalize(label.replace(/[（(][^）)]*[）)]/g,''));
 const match=definitions(category).find(([key,title,aliases])=>[title,...aliases].some(x=>normalize(x)===norm));
 return match?.[0]||'label:'+normalize(label);
}
export function learningSlot(field){
 const ref=fieldRecord(field),category=ref?.category||learningCategory(field);
 return {category,record:['base','skills'].includes(category)?0:ref?.record||Number((field.context||'').match(/第\s*(\d+)\s*条/)?.[1]||1),section:(field.context||'').split(' · ')[0],property:learningProperty(field.label,category,field.datePart)};
}
const key=x=>[x.category,x.record,x.category==='other'?normalize(x.section):'',x.property].join('|');
export const factKey=x=>[x.scope,x.scope==='site'?x.host:'',key(x)].join('|');
export function validateLearnedFacts(raw){
 if(!Array.isArray(raw)||raw.length>300)throw Error('已学习资料最多保存 300 项。');
 return raw.map(x=>{
  if(!x||!LEARN_CATEGORIES[x.category]||!Number.isInteger(x.record)||x.record<0||x.record>10||!['global','site'].includes(x.scope))throw Error('学习资料的类目、经历序号或使用范围不正确。');
  for(const k of ['id','label','value','section','host'])if(typeof x[k]!=='string'||x[k].length>(k==='value'?10000:220))throw Error('学习资料内容格式不正确或过长。');
  if(!x.id||!x.label.trim()||!x.value.trim()||forbiddenLabel.test(x.label)||!/^([a-z0-9-]+\.)*[a-z0-9-]+(?::\d+)?$/i.test(x.host))throw Error('学习资料含无效字段。');
  const datePart=x.datePart&&['year','month'].includes(x.datePart.unit)&&['start','end','single'].includes(x.datePart.boundary)?x.datePart:undefined;
  return {id:x.id,label:x.label,value:x.value,category:x.category,record:['base','skills'].includes(x.category)?0:Math.max(1,x.record),section:x.section,property:learningProperty(x.label,x.category,datePart),scope:x.scope,host:x.host,datePart,enabled:x.enabled!==false,savedAt:typeof x.savedAt==='string'?x.savedAt:''};
 });
}
export function captureDraft(fields,host){
 const captured=fields.filter(f=>typeof f.capturedValue==='string'&&f.capturedValue.trim()&&!forbiddenLabel.test(f.label));
 const slots=new Map();for(const f of captured){const k=key(learningSlot(f));slots.set(k,(slots.get(k)||0)+1);}
 return captured.map((f,i)=>{
  const slot=learningSlot(f),contextWarning=learningContextWarning(f)||(!explicitLearningRecord(f)&&slots.get(key(slot))>1?'同名资料缺少可区分的经历序号，请先确认资料类目和第几条经历，再勾选保存。':'');
  const review=contextWarning||privateLabel.test(f.label)||slot.category==='family'||siteLabel.test(f.label)||f.captureWarning;
  return {...slot,id:'draft-'+i,label:f.label,value:f.capturedValue,host,scope:contextWarning||siteLabel.test(f.label)||slot.category==='other'?'site':'global',datePart:f.datePart,enabled:true,selected:!review,warning:[contextWarning,f.captureWarning||(privateLabel.test(f.label)||slot.category==='family'?'请按需要勾选这项个人或家庭资料。':siteLabel.test(f.label)?'与本次应聘有关，默认仅用于当前网站。':'')].filter(Boolean).join(' ')};
 });
}
export function mergeLearnedFacts(existing,incoming){
 const result=new Map(validateLearnedFacts(existing).map(x=>[factKey(x),x]));const seen=new Map();
 for(const fact of validateLearnedFacts(incoming)){const k=factKey(fact);if(seen.has(k)){if(seen.get(k)!==fact.value)throw Error('勾选内容中同一类目和经历有重复字段且值不同，请核对后再保存。');continue;}seen.set(k,fact.value);const old=result.get(k);result.set(k,{...fact,id:old?.id||fact.id});}
 return validateLearnedFacts([...result.values()]);
}
export function learnedEntries(facts,host){
 // Site-specific confirmation wins over the global value on that site only.
 const selected=new Map();for(const fact of facts.filter(f=>f.enabled&&f.scope==='global'))selected.set(key(fact),fact);
 for(const fact of facts.filter(f=>f.enabled&&f.scope==='site'&&f.host===host))selected.set(key(fact),fact);
 return [...selected.values()].map(f=>({id:'learned:'+f.id,label:`已确认 · ${LEARN_CATEGORIES[f.category]}${f.record?' 第 '+f.record+' 条':''} · ${f.label}`,value:f.value,aliases:[f.label],learned:{category:f.category,record:f.record,property:f.property,section:f.section,label:f.label,scope:f.scope,host:f.host,datePart:f.datePart,savedAt:f.savedAt}}));
}
export function preferredLearned(field,sources){
 if(learningContextWarning(field))return [];
 const slot=learningSlot(field),allowed=sources.filter(s=>s.learned&&learnedSourceAllowed(field,s));let matches=allowed.filter(s=>key(s.learned)===key(slot));if(!matches.length&&field.datePart)matches=allowed.filter(s=>key(s.learned)===key({...slot,property:field.datePart.boundary}));return matches.map(s=>s.id);
}
export function learnedSourceAllowed(field,source){
 if(!source.learned)return true;const slot=learningSlot(field),fact=source.learned;
 if(learningContextWarning(field)||fact.category==='base'&&experienceLabel(fact.label))return false;
 return fact.category===slot.category&&fact.record===slot.record&&(fact.category!=='other'||normalize(fact.section)===normalize(slot.section));
}
