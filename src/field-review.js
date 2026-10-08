import {learningSlot} from './learned.js';
const group=f=>`${f.frameId||0}|${(f.context||'').split(' · 同组字段：')[0]}`;
const degree=s=>String(s||'').match(/博士|硕士|本科|专科|高中/)?.[0];
const month=s=>{const m=String(s||'').match(/(\d{4})[-/.年](\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,'0')}`:null;};
export function relatedFieldWarnings(fields,records){
 const result=new Map();
 const value=f=>{const r=records.get(f.id);const v=['approved','filled','filled_review'].includes(r?.status)?r.proposal?.value:f.currentValue;return f.options?.find(o=>o.value===v)?.label||v||'';};
 const add=(f,reason,block=false)=>result.set(f.id,{reason,block});
 for(const f of fields){
  if(!/掌握程度|熟练程度/.test(f.label)||!/技能/.test(f.context||''))continue;
  const peers=fields.filter(x=>group(x)===group(f)&&/技能名称/.test(x.label));
  if(peers.length===1&&value(f)&&!value(peers[0]))add(f,'[RELATED_EMPTY] 同一组技能名称为空，请先确定技能名称，再确认掌握程度。',true);
 }
 const general=fields.filter(f=>learningSlot(f).category==='base'&&/毕业时间|毕业日期/.test(f.label));
 const highest=fields.find(f=>/最高学历/.test(f.label));const highestDegree=highest&&degree(value(highest));
 if(highestDegree)for(const end of fields){
  if(learningSlot(end).category!=='education'||!/^end$/.test(learningSlot(end).property)&&!/^结束时间$/.test(end.label))continue;
  const educationDegree=fields.find(f=>group(f)===group(end)&&/学历|学位/.test(f.label));
  if(!educationDegree||degree(value(educationDegree))!==highestDegree)continue;
  for(const graduation of general){const a=month(value(graduation)),b=month(value(end));if(a&&b&&a!==b){const reason=`[DATE_CONFLICT] 个人毕业时间（${a}）与${highestDegree}教育结束时间（${b}）不一致，请核对；没有自动替你选择日期。`;add(graduation,reason);add(end,reason);}}
 }
 return result;
}
export async function reconcileWritten(records,checks,fields,cache){
 const byId=new Map(fields.map(f=>[f.id,f])),byCheck=new Map(checks.map(x=>[x.id,x]));let changed=0;
 for(const record of records){
  if(!['filled','filled_review'].includes(record.status))continue;
  const checked=byCheck.get(record.fieldId);if(checked?.ok)continue;
  record.status='failed';record.warning=true;record.reason='[VALUE_CHANGED] '+(checked?.reason||'无法读取字段')+'；已撤销成功统计，请检查网页。若是你手动修改，可采用网页修改并记住。';changed++;
  try{await cache?.remove?.(byId.get(record.fieldId));}catch{record.reason+=' 加速记录移除失败，本轮不会再次使用。';}
 }
 return changed;
}
