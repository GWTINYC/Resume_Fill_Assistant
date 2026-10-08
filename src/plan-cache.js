// A cache of executed suggestions, never a record of human approval or model confidence.
// Inspired by form-structure caching; implementation is independent of external projects.
import {allowedRanges,sourceRanges,evidenceInRange} from './source-routing.js';
import {validateDeepseekFills} from './deepseek.js';
import {wasRejected} from './learned.js';

export const PLAN_CACHE_KEY='executedPlanCache';
export const PLAN_CACHE_VERSION=2;
export const PLAN_CACHE_TTL=7*24*60*60*1000;
const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;
const digest=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(n=>n.toString(16).padStart(2,'0')).join('');
function fieldShape(f){
 return {frame:f.frameId||0,label:f.label,name:f.name,type:f.type,context:(f.context||'').split(' · 同组字段：')[0],placeholder:f.placeholder,required:!!f.required,maxLength:f.maxLength,datePart:f.datePart,sourceRecord:f.sourceRecord,experienceRoute:f.experienceRoute,selectionMode:f.selectionMode,options:f.options?.map(o=>({value:o.value,label:o.label,disabled:!!o.disabled}))};
}
function cleanRow(row,now){
 if(row?.version!==PLAN_CACHE_VERSION||!/^[a-f0-9]{64}$/.test(row.key||'')||!Number.isFinite(row.savedAt)||row.savedAt>now+60000||now-row.savedAt>PLAN_CACHE_TTL)return null;
 const p=row.proposal;
 if(typeof p?.value!=='string'||!p.value.trim()||p.value.length>10000||!Array.isArray(p.evidence)||!p.evidence.length||p.evidence.length>5)return null;
 if(p.evidence.some(e=>typeof e?.sourceId!=='string'||e.sourceId.length>220||typeof e.quote!=='string'||!e.quote.trim()||e.quote.length>10000))return null;
 const result={version:PLAN_CACHE_VERSION,key:row.key,savedAt:row.savedAt,proposal:{value:p.value,evidence:p.evidence.map(e=>({sourceId:e.sourceId,quote:e.quote}))}};
 return bytes(result)<=65000?result:null;
}
export function mergePlanCache(existing,incoming,now=Date.now()){
 const rows=new Map();
 for(const raw of [...(Array.isArray(existing)?existing:[]),...(Array.isArray(incoming)?incoming:[])]){const row=cleanRow(raw,now);if(row)rows.set(row.key,row);}
 const kept=[];let total=0;
 for(const row of [...rows.values()].sort((a,b)=>b.savedAt-a.savedAt)){const n=bytes(row);if(kept.length>=96||total+n>2000000)break;kept.push(row);total+=n;}
 return kept;
}
export async function createPlanCache({fields,sources,pageUrl,pageContext={},rejectedAnswers=[],load,save,remove=async()=>{},now=Date.now}){
 const url=new URL(pageUrl);
 if(!['https:','http:'].includes(url.protocol))return null;
 // Hash all active source contents and feedback. Even an unrelated source change
 // invalidates predictions: it may introduce an explicit correction or contradiction.
 const generation=await digest({version:PLAN_CACHE_VERSION,page:await digest(url.href),pageContext,sources:[...sources].sort((a,b)=>a.id.localeCompare(b.id)),rejectedAnswers});
 const shapes=fields.map(f=>JSON.stringify(fieldShape(f))),counts=new Map();
 for(const shape of shapes)counts.set(shape,(counts.get(shape)||0)+1);
 const keys=new Map(await Promise.all(fields.map(async(f,i)=>[f.id,counts.get(shapes[i])===1&&(f.frameId||0)===0?await digest([generation,shapes[i]]):null])));
 let stored=[];try{stored=await load();}catch{} // Cache availability must not disable filling.
 const rows=new Map(mergePlanCache(stored,[],now()).map(x=>[x.key,x])),ranges=sourceRanges(sources);
 return {
  get(field){
   const row=rows.get(keys.get(field.id));if(!row||!cleanRow(row,now()))return null;
   const proposal={...row.proposal,fieldId:field.id,reason:'复用相同页面字段与素材下上次执行成功的建议；仍待人工确认'};
   if(wasRejected(field,proposal.value,rejectedAnswers)||!allowedRanges(field,ranges,sources).some(range=>evidenceInRange(proposal,range)))return null;
   return validateDeepseekFills({fills:[proposal]},[field],sources).fills[0]||null;
  },
  async remove(field){const key=keys.get(field.id);if(key){rows.delete(key);await remove([key]);}},
  async put(field,proposal){
   const key=keys.get(field.id);if(!key)return;
   const row=cleanRow({version:PLAN_CACHE_VERSION,key,savedAt:now(),proposal},now());
   if(row){await save([row]);rows.set(key,row);}
  }
 };
}
