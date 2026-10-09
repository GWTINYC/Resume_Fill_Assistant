import test from 'node:test';import assert from 'node:assert/strict';
import {defaultFieldValue} from '../src/core.js';import {dateComponentMatches} from '../src/date-components.js';import {validateDeepseekFills} from '../src/deepseek.js';
import {confirmationFacts} from '../src/learned.js';
const month={id:'m',label:'就读时间 · 开始月份',context:'教育背景 · 第 1 条',type:'custom-select',supported:true,datePart:{unit:'month',boundary:'start'},options:[{value:'month9',label:'九月'},{value:'month6',label:'06月'}]};
test('accepting a date choice with an opaque ID stores its displayed month and precision',()=>{
 assert.equal(defaultFieldValue(month,'month9'),'month9');
 const [fact]=confirmationFacts([{...month,value:'month9'}],'example.test');
 assert.equal(fact.value,'九月');assert.deepEqual(fact.datePart,month.datePart);
});
test('confirmed complete dates map to padded, unit-labelled or Chinese month choices by meaning',()=>{
 const sources=[{id:'education.0.start',label:'入学时间',text:'2024-09',confirmed:true}],evidence=[{sourceId:sources[0].id,quote:sources[0].text}];
 assert.equal(defaultFieldValue(month,'2024-09'),'month9');
 assert.equal(validateDeepseekFills({fills:[{fieldId:'m',value:'month9',evidence}]},[month],sources).fills.length,1);
 assert.equal(defaultFieldValue({...month,options:[{value:'opaque',label:'09月'}]},'2024-09'),'opaque');
 assert.equal(defaultFieldValue({...month,datePart:{unit:'year',boundary:'start'},options:[{value:'y24',label:'2024年'}]},'2024-09'),'y24');
});
test('ambiguous, disabled or wrong-unit date choices cannot be automatically selected',()=>{
 assert.equal(defaultFieldValue({...month,options:[{value:'a',label:'9月'},{value:'b',label:'九月'}]},'2024-09'),null);
 assert.equal(defaultFieldValue({...month,options:[{value:'a',label:'09月',disabled:true}]},'2024-09'),null);
 assert.equal(defaultFieldValue({...month,options:[{value:'a',label:'09年'}]},'2024-09'),null);
 assert.equal(defaultFieldValue({...month,datePart:{unit:'year',boundary:'start'},options:[{value:'a',label:'24年'}]},'2024-09'),null);
});
test('date representation changes retain the correct record, boundary and supplied precision',()=>{
 const source={id:'material:cv',text:'教育背景\n硕士：示例大学\n就读时间：2024.09–2027.06'},evidence=[{sourceId:source.id,quote:'2024.09–2027.06'}];
 assert(dateComponentMatches(month,'month9',evidence,[source]));assert(!dateComponentMatches(month,'month6',evidence,[source]));
 assert.equal(validateDeepseekFills({fills:[{fieldId:'m',value:'month9',evidence}]},[{...month,context:'教育背景 · 第 2 条'}],[source]).fills.length,0);
 assert.equal(defaultFieldValue({type:'date'},'2024-09'),null);
});
test('confirmed month-only feedback may use equivalent display text without gaining date precision',()=>{
 const source={id:'learned:month',text:'九月',learned:{category:'education',record:1,property:'start.month',datePart:{unit:'month',boundary:'start'}}};
 assert(dateComponentMatches(month,'month9',[{sourceId:source.id,quote:source.text}],[source]));
 assert.equal(defaultFieldValue({type:'month'},source.text),null);
});
