import {runCollaboration} from './collaboration.js';
import {reconcileWritten,relatedFieldWarnings} from './field-review.js';

// Process the scanned page order, including populated controls. Keep whole-page
// context for record identity, but do not analyse later fields before this one finishes.
export async function runSequentialFill(options){
 if(!options.reviewExisting)return runCollaboration(options);
 const fields=options.fields.map(f=>({...f,expectedCurrent:f.snapshotValue??f.currentValue??''}));
 const records=new Map(fields.map(f=>[f.id,{fieldId:f.id,status:'deferred',reason:'等待按页面顺序处理',history:[]}])) ,pendingCache=new Map();
 const cache=options.planCache&&{
  get:f=>options.planCache.get(f),
  put:async(f,p)=>pendingCache.set(f.id,{field:f,proposal:p}),
  remove:async f=>{pendingCache.delete(f.id);await options.planCache.remove?.(f);}
 };
 const emit=(stage,message)=>options.onProgress?.({stage,message,records:[...records.values()]});
 for(const [index,field]of fields.entries()){
  if(options.signal?.aborted)throw new DOMException('协作已停止；已填内容保留。','AbortError');
  await options.assertFresh();
  const prefix=`逐项填写 ${index+1}/${fields.length} · ${field.label}`;
  emit('visit',prefix+'：读取当前控件');
  if(field.supported&&options.readField){
   const current=await options.readField(field);
   if(!current?.ok){records.set(field.id,{fieldId:field.id,status:'needs_review',warning:true,reason:'[FIELD_READ] '+(current?.reason||'无法读取当前控件'),history:[]});emit('visit',prefix+'：读取失败，已标注原因');continue;}
   field.currentValue=String(current.value??'');field.hasValue=!!field.currentValue;
  }
  const result=await runCollaboration({...options,fields,activeFieldIds:[field.id],deferRelatedReview:true,planCache:cache,verifyWritten:null,
   onProgress:progress=>{const row=progress.records.find(r=>r.fieldId===field.id);if(row)records.set(field.id,row);emit(progress.stage,prefix+'：'+progress.message);}
  });
  const row=result.find(r=>r.fieldId===field.id);records.set(field.id,row);
  if(['filled','filled_review','unchanged'].includes(row.status)){field.currentValue=row.proposal.value;field.hasValue=true;}
 }
 await options.assertFresh();emit('whole-review','所有控件已按顺序处理，正在统一复核保留结果与关联关系…');
 const all=[...records.values()],written=all.filter(r=>['filled','filled_review','unchanged'].includes(r.status));
 if(written.length&&options.verifyWritten){
  const items=written.map(r=>({...fields.find(f=>f.id===r.fieldId),value:r.proposal.value}));
  const checks=await options.verifyWritten(items);
  for(const check of checks){const f=fields.find(f=>f.id===check.id);if(f&&Object.hasOwn(check,'value')){f.currentValue=String(check.value??'');f.hasValue=!!f.currentValue;}}
  await reconcileWritten(all,checks,fields,cache);
 }
 for(const [id,issue]of relatedFieldWarnings(fields,records)){
  const row=records.get(id),field=fields.find(f=>f.id===id);row.warning=true;row.ruleWarning=issue.reason;row.reason=issue.reason;
  if(['filled','filled_review'].includes(row.status))row.status='filled_review';else if(row.status!=='failed')row.status='needs_review';
  if(!row.proposal&&field.hasValue)row.proposal={fieldId:id,value:field.currentValue,evidence:[],reason:issue.reason};
 }
 for(const {field,proposal}of pendingCache.values()){
  const row=records.get(field.id);if(!['filled','filled_review'].includes(row.status)||row.ruleWarning)continue;
  try{await options.planCache.put(field,proposal);}catch{row.cacheWriteFailed=true;row.reason+=' 本次加速记录未保存。';}
 }
 emit('complete','逐项填写与整页复核完成');return all;
}
