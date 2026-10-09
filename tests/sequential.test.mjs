import test from 'node:test';
import assert from 'node:assert/strict';
import {runSequentialFill} from '../src/sequential.js';
const f=(id,currentValue='',label='研究方向',context='其他信息')=>({id,label,context,type:'text',supported:true,currentValue,hasValue:!!currentValue});
function harness(fields,values={}){
 const events=[],actual=new Map(fields.map(f=>[f.id,f.currentValue])),source={id:'notes',label:'原始素材',text:'机器学习 Python 熟练'};
 const proposal=f=>({fieldId:f.id,value:values[f.id]||'机器学习',evidence:[{sourceId:'notes',quote:source.text}]});
 const options={fields,sources:[source],entries:[],reviewExisting:true,fastMode:true,fillUncertain:true,assertFresh:async()=>{},
 readField:async f=>{events.push('read:'+f.id);return {ok:true,value:actual.get(f.id)}},
 judge:async p=>{assert.equal(p.state.stage,'route');assert.equal(p.state.fields.length,1);const field=p.state.fields[0];events.push('judge:'+field.id);const choice=field.id==='missing'?'none':p.state.ranges[0].id;return {answers:{q0:{type:'choice',choice,confidence:1,probabilities:{[choice]:1}}}}},
 draft:async fields=>{events.push('draft:'+fields[0].id);return {fills:fields.map(proposal)}},
 apply:async(f,v,meta)=>{events.push('write:'+f.id);if(actual.get(f.id)!==meta.expectedCurrent)return {ok:false,reason:'[REVIEW_CHANGED]'};actual.set(f.id,v);return {ok:true,reason:'verified'}},
 verifyWritten:async items=>{events.push('verify');return items.map(f=>({id:f.id,ok:actual.get(f.id)===f.value,value:actual.get(f.id)}))},
 planCache:{get:()=>null,put:async f=>events.push('cache:'+f.id),remove:async f=>events.push('remove:'+f.id)},
 onProgress:p=>{if(p.stage==='visit'&&p.message.endsWith('读取当前控件'))events.push('visit:'+p.message.match(/· (.*)：/)[1]);if(p.stage==='complete')events.push('complete')}
 };return {options,events,actual,proposal};
}
test('mixed populated and blank controls are read, analysed and completed in page order',async()=>{
 const h=harness([f('a','旧方向'),f('b'),f('c','机器学习'),f('d')]);
 const rows=await runSequentialFill(h.options);
 assert.deepEqual(h.events.filter(x=>/^(read|judge|draft|write|verify|cache):?/.test(x)),['read:a','judge:a','draft:a','write:a','read:b','judge:b','draft:b','write:b','read:c','judge:c','draft:c','read:d','judge:d','draft:d','write:d','verify','cache:a','cache:b','cache:d']);
 assert.deepEqual(rows.map(r=>r.status),['filled_review','filled_review','unchanged','filled_review']);
});
test('no source and unsupported controls stay visible while following controls are visited',async()=>{
 const h=harness([f('missing','保留'),{...f('file'),supported:false,reason:'附件需手动上传'},f('next')]);
 const rows=await runSequentialFill(h.options);
 assert.deepEqual(rows.map(r=>r.status),['needs_review','unsupported','filled_review']);assert.equal(h.actual.get('missing'),'保留');assert(rows[0].warning&&rows[1].warning);assert(h.events.includes('read:next'));
});
test('relationships are checked after ordered writes; late clearing revokes success and caching',async()=>{
 const h=harness([f('level','','掌握程度','技能 · 第 1 条'),f('name','','技能名称','技能 · 第 1 条')],{level:'熟练',name:'Python'});
 const verify=h.options.verifyWritten;h.options.verifyWritten=async items=>{h.actual.set('name','');return verify(items)};
 const rows=await runSequentialFill(h.options);
 assert.deepEqual(h.events.filter(x=>x.startsWith('write:')),['write:level','write:name']);assert.equal(rows[1].status,'failed');assert.match(rows[0].ruleWarning,/RELATED_EMPTY/);assert(!h.events.some(x=>x.startsWith('cache:')));
});
test('a change before a later control is reached remains protected against stale overwrite',async()=>{
 const h=harness([f('a'),f('b','旧方向')]),apply=h.options.apply;
 h.options.apply=async(...args)=>{const result=await apply(...args);if(args[0].id==='a')h.actual.set('b','用户修改');return result};
 const rows=await runSequentialFill(h.options);assert.equal(rows[1].status,'failed');assert.match(rows[1].reason,/REVIEW_CHANGED/);assert.equal(h.actual.get('b'),'用户修改');
});
test('abort or model failure stops future work but preserves preceding real writes',async()=>{
 for(const mode of ['abort','outage']){
  const h=harness([f('a'),f('b'),f('c')]),controller=new AbortController(),judge=h.options.judge;h.options.signal=controller.signal;
  h.options.judge=async p=>{if(p.state.fields[0].id==='b'){if(mode==='outage')throw Error('service unavailable');controller.abort();}return judge(p)};
  await assert.rejects(runSequentialFill(h.options),mode==='abort'?{name:'AbortError'}:/service unavailable/);
  assert.equal(h.actual.get('a'),'机器学习');assert.equal(h.actual.get('b'),'');assert(!h.events.includes('read:c'));assert(!h.events.some(x=>x.startsWith('cache:')));
 }
});
test('nonempty native placeholder uses raw scan snapshot for compare-and-set',async()=>{
 const field={...f('a'),type:'select-one',snapshotValue:'-1',options:[{value:'-1',label:'请选择'},{value:'ml',label:'机器学习'}]},h=harness([field],{a:'ml'});h.actual.set('a','-1');
 const rows=await runSequentialFill(h.options);assert.equal(rows[0].status,'filled_review');assert.equal(h.actual.get('a'),'ml');
});
