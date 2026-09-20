import test from 'node:test';import assert from 'node:assert/strict';
import {profileEntries,emptyProfile,localMapping,defaultFieldValue,mappingPayload,acceptedChoice,basicFromText,optionPayload}from'../src/core.js';
test('field mapping sends field descriptions, never stored personal values',()=>{const p=emptyProfile();p.base.fullName='TEST-PRIVATE-NAME';p.base.email='private-example@example.test';const entries=profileEntries(p);const body=mappingPayload([{id:'0:f0',label:'Candidate full name',type:'text'}],entries);assert(!JSON.stringify(body).includes('TEST-PRIVATE-NAME'));assert(!JSON.stringify(body).includes('private-example@example.test'));assert.equal(body.questions.q0.criteria['base.fullName'],'姓名');});
test('duplicate education labels need review instead of silently picking first',()=>{const p=emptyProfile();p.education=[{school:'A'},{school:'B'}];assert.equal(localMapping({label:'学校',supported:true},profileEntries(p)),null);});
test('local matching does not confuse employer or school with personal name',()=>{const p=emptyProfile();p.base.fullName='A';assert.equal(localMapping({label:'公司名称',supported:true},profileEntries(p)),null);assert.equal(localMapping({label:'Full name *',supported:true},profileEntries(p)),'base.fullName');});
test('date values are normalized without inventing a day',()=>{assert.equal(defaultFieldValue({type:'date'},'2023-09'),null);assert.equal(defaultFieldValue({type:'month'},'2023年9月'),'2023-09');assert.equal(defaultFieldValue({type:'date'},'2000.2.03'),'2000-02-03');});
test('select requires an unambiguous enabled option',()=>{const f={type:'select-one',options:[{value:'b',label:'本科'},{value:'m',label:'硕士',disabled:true}]};assert.equal(defaultFieldValue(f,'本科'),'b');assert.equal(defaultFieldValue(f,'硕士'),null);assert.equal(defaultFieldValue(f,'博士'),null);});
test('model proposals must pass confidence, probability and allowlist checks',()=>{const a={type:'choice',choice:'base.email',confidence:.9,probabilities:{'base.email':.9}};assert.equal(acceptedChoice(a,['base.email']),'base.email');assert.equal(acceptedChoice({...a,confidence:.2},['base.email']),null);assert.equal(acceptedChoice({...a,choice:'invented'},['base.email']),null);assert.equal(acceptedChoice({...a,probabilities:{}},['base.email']),null);});
test('PDF basic extraction only extracts supplied contact data',()=>{assert.deepEqual(basicFromText('Name X\nname@example.test\n138 1234 5678'),{email:'name@example.test',phone:'13812345678'});assert.deepEqual(basicFromText('No contact details'),{});});
test('semantic option matching only receives the necessary single value',()=>{const payload=optionPayload([{id:'f1',profileValue:'本科',field:{label:'Degree',options:[{label:'Bachelor',value:'x'}]}}]);assert.equal(payload.state.items[0].profileValue,'本科');assert.equal(payload.questions.q0.criteria.o0,'Bachelor');});

import {decodeText} from '../src/text-material.js';
import {applicantSources,deepseekPayload,validateDeepseekFills} from '../src/deepseek.js';
test('TXT decodes UTF-8, UTF-16 BOM and GBK without treating binary as text',()=>{
 assert.equal(decodeText(new TextEncoder().encode('\uFEFF姓名：陈晓')).text,'姓名：陈晓');
 const utf16=new Uint8Array([255,254,45,78,135,101]);assert.equal(decodeText(utf16).text,'中文');
 assert.equal(decodeText(new Uint8Array([0xd6,0xd0,0xce,0xc4])).text,'中文');
 assert.throws(()=>decodeText(new Uint8Array([0,1,2,3])));assert.throws(()=>decodeText(new TextEncoder().encode('  \n')));
});
test('DeepSeek sources include only enabled text and never raw files or keys',()=>{
 const sources=applicantSources([{id:'base.fullName',label:'姓名',value:'陈晓'}],{notes:'可实习三个月',deepseekApiKey:'secret'},[{id:'m1',name:'resume.txt',enabled:true,text:'本科',blob:'RAW FILE'},{id:'m2',name:'disabled.txt',enabled:false,text:'DO NOT SEND'}]);
 assert.equal(sources.length,3);assert(!JSON.stringify(sources).includes('secret'));assert(!JSON.stringify(sources).includes('RAW FILE'));assert(!JSON.stringify(sources).includes('DO NOT SEND'));
 const payload=deepseekPayload([{id:'0:f0',label:'姓名',type:'text',supported:true}],sources);assert.equal(payload.model,'deepseek-flash');assert.equal(payload.response_format.type,'json_object');assert(payload.messages[0].content.includes('JSON'));assert.throws(()=>deepseekPayload([{id:'x'}],[{text:'x'.repeat(100001)}]));
});
const dsFields=[{id:'name',type:'text',supported:true},{id:'degree',type:'select-one',supported:true,options:[{value:'b',label:'Bachelor'},{value:'m',label:'Master',disabled:true}]},{id:'date',type:'date',supported:true},{id:'file',type:'file',supported:false}];
const dsSources=[{id:'cv',label:'简历',text:'姓名：陈晓；学历：本科；日期：2000-02-30'}];
const propose=(fieldId,value,quote='陈晓')=>({fieldId,value,evidence:[{sourceId:'cv',quote}]});
test('DeepSeek plans require known fields and verbatim evidence; no commands accepted',()=>{
 const r=validateDeepseekFills({fills:[propose('name','陈晓'),propose('unknown','x'),propose('file','/tmp/private'),{...propose('degree','b','不存在的博士')},propose('degree','m','本科')]},dsFields,dsSources);
 assert.equal(r.fills.length,1);assert.equal(r.fills[0].value,'陈晓');assert.equal(r.rejected,4);
 assert.throws(()=>validateDeepseekFills({actions:[{script:'document.submit()'}]},dsFields,dsSources));
});
test('DeepSeek select values must be exact and impossible dates are rejected',()=>{
 const r=validateDeepseekFills({fills:[propose('degree','Bachelor','本科'),propose('date','2000-02-30','2000-02-30')]},dsFields,dsSources);assert.equal(r.fills.length,0);
 assert.equal(validateDeepseekFills({fills:[propose('degree','b','本科')]},dsFields,dsSources).fills[0].value,'b');
});
test('duplicate model field proposals are rejected rather than silently overwritten',()=>{
 const r=validateDeepseekFills({fills:[propose('name','陈晓'),propose('name','其他姓名')]},dsFields,dsSources);assert.equal(r.fills.length,0);assert.equal(r.rejected,2);
});
