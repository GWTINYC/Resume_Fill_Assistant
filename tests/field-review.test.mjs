import test from 'node:test';import assert from 'node:assert/strict';
import {relatedFieldWarnings,reconcileWritten} from '../src/field-review.js';
import {runCollaboration} from '../src/collaboration.js';
const field=(id,label,context,currentValue='',type='text')=>({id,label,context,currentValue,hasValue:!!currentValue,type,supported:true});
test('skill proficiency is held only when its own record name is missing',()=>{
 const fields=[field('name','技能名称','技能 · 第 1 条'),field('level','掌握程度','技能 · 第 1 条','熟练'),field('name2','技能名称','技能 · 第 2 条','Python')];
 const warnings=relatedFieldWarnings(fields,new Map());assert.equal(warnings.get('level').block,true);fields[0].currentValue='JS';assert.equal(relatedFieldWarnings(fields,new Map()).size,0);
});
test('graduation conflicts compare the highest matching education degree at month precision',()=>{
 const fields=[field('highest','最高学历','个人信息','硕士研究生'),field('grad','毕业时间','个人信息','2027-06-01'),field('degree','学历','教育经历 · 第 1 条','硕士'),field('end','结束时间','教育经历 · 第 1 条','2026-06','month'),field('degree2','学历','教育经历 · 第 2 条','本科'),field('end2','结束时间','教育经历 · 第 2 条','2024-06','month')];
 const warnings=relatedFieldWarnings(fields,new Map());assert.deepEqual([...warnings.keys()],['grad','end']);assert.match(warnings.get('grad').reason,/DATE_CONFLICT/);
 fields[3].currentValue='2027-06';assert.equal(relatedFieldWarnings(fields,new Map()).size,0);
});
test('late clear or manual change revokes success and removes cache without writing or learning',async()=>{
 const fields=[field('a','姓名','基本信息'),field('b','研究方向','其他信息')];const records=fields.map(f=>({fieldId:f.id,status:'filled',proposal:{value:'原文'}}));const removed=[];
 const n=await reconcileWritten(records,[{id:'a',ok:true},{id:'b',ok:false,reason:'网页未保留预期值'}],fields,{remove:async f=>removed.push(f.id)});
 assert.equal(n,1);assert.equal(records[0].status,'filled');assert.equal(records[1].status,'failed');assert.equal(records[1].warning,true);assert.deepEqual(removed,['b']);
});
test('whole-run verification prevents a cleared field from entering cache',async()=>{
 const f=field('f','研究方向','其他信息'),sources=[{id:'notes',label:'研究方向',text:'机器学习'}];const proposal={fieldId:'f',value:'机器学习',evidence:[{sourceId:'notes',quote:'机器学习'}]};let cached=0;
 const result=await runCollaboration({fields:[f],sources,entries:[],fastMode:true,fillUncertain:true,planCache:{get:()=>proposal,put:()=>cached++,remove:async()=>{}},assertFresh:async()=>{},judge:()=>{throw Error('no model')},draft:()=>{throw Error('no model')},apply:async()=>({ok:true,reason:'first readback'}),verifyWritten:async()=>[{id:'f',ok:false,reason:'later clear'}]});
 assert.equal(result[0].status,'failed');assert.equal(cached,0);
});
const noModel=()=>{throw Error('should not call models')};
test('already populated conflicting dates warn without overwriting or model calls',async()=>{
 const fields=[field('highest','最高学历','个人信息','硕士'),field('grad','毕业时间','个人信息','2027-06-01'),field('degree','学历','教育经历 · 第 1 条','硕士'),field('end','结束时间','教育经历 · 第 1 条','2026-06','month')];
 const result=await runCollaboration({fields,sources:[],entries:[],fastMode:true,assertFresh:async()=>{},judge:noModel,draft:noModel,apply:noModel});
 for(const id of ['grad','end']){const r=result.find(r=>r.fieldId===id);assert.equal(r.status,'needs_review');assert.equal(r.warning,true);assert.match(r.reason,/DATE_CONFLICT/);assert.equal(r.proposal.value,fields.find(f=>f.id===id).currentValue);}
});
test('skill name failure blocks proficiency even when proficiency is first in DOM',async()=>{
 const fields=[field('level','掌握程度','技能 · 第 1 条'),field('name','技能名称','技能 · 第 1 条')],values={level:'熟练',name:'Python'},written=[];
 const result=await runCollaboration({fields,sources:[{id:'notes',text:'Python 熟练'}],entries:[],fastMode:true,fillUncertain:true,planCache:{get:f=>({fieldId:f.id,value:values[f.id],evidence:[{sourceId:'notes',quote:'Python 熟练'}]})},assertFresh:async()=>{},judge:noModel,draft:noModel,apply:async f=>{written.push(f.id);return {ok:false,reason:'name rejected'}}});
 assert.deepEqual(written,['name']);assert.equal(result[0].status,'needs_review');assert.equal(result[0].warning,true);assert.match(result[0].reason,/RELATED_EMPTY/);
});
