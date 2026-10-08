import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanCache,mergePlanCache,PLAN_CACHE_TTL} from '../src/plan-cache.js';
import {runCollaboration} from '../src/collaboration.js';
const f={id:'f1',label:'研究方向',type:'text',name:'research',context:'其他信息',supported:true,frameId:0};
const sources=[{id:'notes',label:'研究方向',text:'研究方向：机器学习'}];
const proposal={fieldId:f.id,value:'机器学习',evidence:[{sourceId:'notes',quote:'机器学习'}]};
function fixture(){let rows=[];let time=1000000000;return {rows:()=>rows,advance:n=>time+=n,options:{fields:[f],sources,pageUrl:'https://example.test/apply?token=private#resume',load:async()=>rows,save:async incoming=>{rows=mergePlanCache(rows,incoming,time);},now:()=>time}};}
test('persisted cache binds new runtime IDs, keeps exact original, contains no URL or approval claim',async()=>{
 const x=fixture(),cache=await createPlanCache(x.options);await cache.put(f,proposal);
 const changed={...f,id:'new-id'};const again=await createPlanCache({...x.options,fields:[changed]});
 assert.equal(again.get(changed).value,proposal.value);assert.equal(again.get(changed).fieldId,'new-id');
 const raw=JSON.stringify(x.rows());for(const value of ['private','example.test','confidence','approved'])assert(!raw.includes(value));
});
test('cache invalidates on source, feedback, option, record, page or context changes',async()=>{
 const x=fixture();await (await createPlanCache(x.options)).put(f,proposal);
 const cases=[{pageUrl:'https://example.test/apply?token=another-job#resume'},{pageUrl:'https://example.test/apply?token=private#other-step'},{sources:[{...sources[0],text:'研究方向：计算机视觉'}]}, {rejectedAnswers:[{value:'机器学习'}]}, {pageUrl:'https://other.test/apply'}, {pageUrl:'https://example.test/other'}, {pageContext:{title:'另一个职位'}}, {fields:[{...f,sourceRecord:{category:'internship',record:2}}]}, {fields:[{...f,options:[{label:'机器学习',value:'x'}]}]}];
 for(const change of cases){const cache=await createPlanCache({...x.options,...change});assert.equal(cache.get(change.fields?.[0]||f),null,JSON.stringify(change));}
});
test('ambiguous duplicate fields and child frames are not cached; stale/corrupt caches are ignored',async()=>{
 const x=fixture(),other={...f,id:'second'};await (await createPlanCache({...x.options,fields:[f,other]})).put(f,proposal);assert.equal(x.rows().length,0);
 const child={...f,frameId:2};await (await createPlanCache({...x.options,fields:[child]})).put(child,proposal);assert.equal(x.rows().length,0);
 await (await createPlanCache(x.options)).put(f,proposal);x.advance(PLAN_CACHE_TTL+1);assert.equal((await createPlanCache(x.options)).get(f),null);
 assert.deepEqual(mergePlanCache([{key:'bad',proposal:{}},null],null),[]);
});
test('cache read rejects fabricated evidence even with a valid key; bounds storage',async()=>{
 const x=fixture();await (await createPlanCache(x.options)).put(f,proposal);x.rows()[0].proposal.value='凭空编造';assert.equal((await createPlanCache(x.options)).get(f),null);
 const template=x.rows()[0];const rows=mergePlanCache([],Array.from({length:150},(_,i)=>({...template,key:i.toString(16).padStart(64,'0')})),1000000000);assert.equal(rows.length,96);
});
test('collaboration uses cache without either model, still marks orange and still verifies writes',async()=>{
 const x=fixture(),cache=await createPlanCache(x.options);await cache.put(f,proposal);let writes=0;
 for(const ok of [true,false]){
 const result=await runCollaboration({fields:[f],sources,entries:[],fastMode:true,fillUncertain:true,planCache:cache,assertFresh:async()=>{},judge:()=>{throw Error('Unexpected model')},draft:()=>{throw Error('Unexpected model')},apply:async(field,value,meta)=>{writes++;assert.equal(meta.uncertain,true);assert.equal(value,proposal.value);return {ok,reason:'readback'}}});
 assert.equal(result[0].status,ok?'filled_review':'failed');assert.equal(result[0].review.method,'cache');
 }assert.equal(writes,2);
});
test('cache failures do not fail verified page writes; failed writes are never saved',async()=>{
 for(const ok of [true,false]){let saved=0;
 const result=await runCollaboration({fields:[f],sources,entries:[],fastMode:true,fillUncertain:true,planCache:{get:()=>proposal,put:async()=>{saved++;throw Error('disk unavailable')}},assertFresh:async()=>{},judge:()=>{throw Error('model')},draft:()=>{throw Error('model')},apply:async()=>({ok,reason:'readback'})});
 assert.equal(saved,ok?1:0);assert.equal(result[0].status,ok?'filled_review':'failed');assert.equal(!!result[0].cacheWriteFailed,ok);
 }
});
