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

import {sourceChunks,auditPackets,runCollaboration,localConcerns} from '../src/collaboration.js';
const teamFields=[{id:'name',label:'姓名',type:'text',supported:true,hasValue:false},{id:'about',label:'个人能力',type:'textarea',supported:true,hasValue:false},{id:'salary',label:'期望薪资',type:'text',supported:true,hasValue:false}];
const teamSources=[{id:'base.fullName',label:'姓名',text:'陈晓'},{id:'material:cv',label:'简历',text:'使用 React 完成前端项目，与团队协作完成页面开发。'}];
const teamEntries=[{id:'base.fullName',label:'姓名',aliases:['姓名'],value:'陈晓'}];
const nameProposal={fieldId:'name',value:'陈晓',evidence:[{sourceId:'base.fullName',quote:'陈晓'}]};
const aboutProposal=value=>({fieldId:'about',value,evidence:[{sourceId:'material:cv',quote:teamSources[1].text}]});
function teamJudge(payload){const answers={};payload.state.items.forEach((item,i)=>{const policy=item.field.id==='about'?'passage':'fact';answers[`q${i}_policy`]={type:'choice',choice:policy,confidence:.99,probabilities:{fact:policy==='fact'?1:0,passage:policy==='passage'?1:0,unclear:0}};for(const part of ['fit','unsupported','conflict'])answers[`q${i}_${part}`]={type:'noul',noul:part==='fit'?.99:.01};});return {answers};}
test('audit covers every source character without splitting Unicode code points',()=>{const text='甲🙂\n'.repeat(5000);const sources=[{id:'cv',label:'材料',text}];const chunks=sourceChunks(sources);assert(chunks.length>1);assert.equal(chunks.flat().filter(x=>x.id==='cv').map(x=>x.text).join(''),text);const packets=auditPackets([nameProposal],[teamFields[0]],teamSources);assert(Object.keys(packets[0].payload.questions).length<=8);assert(new TextEncoder().encode(JSON.stringify(packets[0].payload.state)).length<23000);});
test('collaboration repairs only failed fields; synonymous categories copy the original passage',async()=>{let drafts=0;const applied=[];const feedback=[];const result=await runCollaboration({fields:teamFields,sources:teamSources,entries:teamEntries,assertFresh:async()=>{},draft:async(batch,workflow)=>{drafts++;feedback.push(workflow.feedback);return {fills:batch.flatMap(f=>f.id==='name'?[nameProposal]:f.id==='about'?[aboutProposal(drafts===1?'精通 React，效率提升 50%':teamSources[1].text)]:[])};},judge:async p=>teamJudge(p),apply:async(f,value)=>{applied.push([f.id,value]);return {ok:true,reason:'verified'};}});assert.equal(drafts,2);assert.deepEqual(feedback[1].map(x=>x.fieldId),['about','salary']);assert.equal(result.find(x=>x.fieldId==='about').history.length,2);assert.equal(result.find(x=>x.fieldId==='about').status,'filled');assert.equal(result.find(x=>x.fieldId==='salary').status,'needs_review');assert.equal(applied.length,2);assert(!applied.some(x=>x[1].includes('50%')));});
test('Jev disagreement that survives repair is never automatically filled',async()=>{let writes=0;const result=await runCollaboration({fields:[teamFields[0]],sources:teamSources,entries:teamEntries,assertFresh:async()=>{},draft:async()=>({fills:[nameProposal]}),judge:async p=>{const r=teamJudge(p);r.answers.q0_conflict.noul=.8;return r;},apply:async()=>{writes++;return {ok:true}}});assert.equal(writes,0);assert.equal(result[0].status,'needs_review');assert.equal(result[0].history.length,2);});
test('a reviewer outage cannot silently fall back to unreviewed auto-fill',async()=>{let writes=0;await assert.rejects(runCollaboration({fields:[teamFields[0]],sources:teamSources,entries:teamEntries,assertFresh:async()=>{},draft:async()=>({fills:[nameProposal]}),judge:async()=>{throw Error('review unavailable')},apply:async()=>{writes++;return {ok:true}}}),/review unavailable/);assert.equal(writes,0);});
test('cancel and changed source snapshots stop writes',async()=>{const controller=new AbortController();let writes=0;await assert.rejects(runCollaboration({fields:[teamFields[0]],sources:teamSources,entries:teamEntries,signal:controller.signal,assertFresh:async()=>{},draft:async()=>({fills:[nameProposal]}),judge:async p=>{controller.abort();return teamJudge(p)},apply:async()=>{writes++;return {ok:true}}}),{name:'AbortError'});let checks=0;await assert.rejects(runCollaboration({fields:[teamFields[0]],sources:teamSources,entries:teamEntries,assertFresh:async()=>{if(++checks>1)throw Error('changed')},draft:async()=>({fills:[nameProposal]}),judge:async p=>teamJudge(p),apply:async()=>{writes++;return {ok:true}}}),/changed/);assert.equal(writes,0);});
test('failed DOM readback is reported as failed, not filled',async()=>{const result=await runCollaboration({fields:[teamFields[0]],sources:teamSources,entries:teamEntries,assertFresh:async()=>{},draft:async()=>({fills:[nameProposal]}),judge:async p=>teamJudge(p),apply:async()=>({ok:false,reason:'page discarded value'})});assert.equal(result[0].status,'failed');});
test('confirmed identity conflicts and translated free-text values are held',()=>{assert(localConcerns(teamFields[0],{...nameProposal,value:'王某'},teamEntries).length);assert.equal(localConcerns({label:'现居城市',type:'text',supported:true},{value:'Shanghai',evidence:[{quote:'上海'}]},[{id:'base.city',label:'现居城市',aliases:['现居城市'],value:'上海'}]).length,1);});

test('semantic category prompts permit synonyms but forbid rewriting in both modes',()=>{
 for(const workflow of [{},{collaborative:true}]){
  const prompts=deepseekPayload(teamFields,teamSources,workflow).messages.map(m=>m.content).join(' ');
  assert(prompts.includes('个人能力'));assert(prompts.includes('个人技能'));assert(prompts.includes('Do not paraphrase'));
 }
 const packet=auditPackets([aboutProposal(teamSources[1].text)],teamFields,teamSources)[0];
 assert(packet.payload.questions.q0_fit.instructions.includes('个人技能'));
 assert(packet.payload.questions.q0_unsupported.instructions.includes('complete prepared passage'));
});
test('verbatim gate preserves multiline wording but rejects paraphrase, translation and stitching',()=>{
 const source={id:'cv',label:'个人技能',text:'个人技能：\n熟悉 React；参与页面开发。\n能够与团队沟通需求。\n其他：英语四级。'};
 const field={id:'skills',label:'个人能力',type:'textarea',supported:true,maxLength:200};
 const original='熟悉 React；参与页面开发。\n能够与团队沟通需求。';
 const fill=value=>({fieldId:field.id,value,evidence:[{sourceId:'cv',quote:original}]});
 const good=validateDeepseekFills({fills:[fill(original)]},[field],[source]);assert.equal(good.fills[0].value,original);
 for(const value of ['熟悉 React，具备页面开发和团队沟通能力。','Familiar with React.','熟悉 React；参与页面开发。能够与团队沟通需求。','熟悉 React；参与页面开发。\n其他：英语四级。']){
  const r=validateDeepseekFills({fills:[fill(value)]},[field],[source]);assert.equal(r.fills.length,0);assert.match(r.issues[0].reason,/连续原文/);
 }
 const changedQuote={...fill(original),evidence:[{sourceId:'cv',quote:original.replace('\n',' ')}]};
 assert.equal(validateDeepseekFills({fills:[changedQuote]},[field],[source]).fills.length,0);
 const tooLong=validateDeepseekFills({fills:[fill(original)]},[{...field,maxLength:8}],[source]);assert.equal(tooLong.fills.length,0);assert.match(tooLong.issues[0].reason,/不要缩写/);
});
test('native dates allow deterministic formatting but cannot use unrelated evidence or invent a day',()=>{
 const source={id:'cv',label:'日期',text:'入学：2023年9月；出生：2000年2月3日。'};
 const fields=[{id:'date',type:'date',supported:true},{id:'month',type:'month',supported:true}];
 const fill=(fieldId,value,quote)=>({fieldId,value,evidence:[{sourceId:'cv',quote}]});
 assert.equal(validateDeepseekFills({fills:[fill('date','2000-02-03','2000年2月3日')]},fields,[source]).fills[0].value,'2000-02-03');
 assert.equal(validateDeepseekFills({fills:[fill('month','2023-09','2023年9月')]},fields,[source]).fills[0].value,'2023-09');
 assert.equal(validateDeepseekFills({fills:[fill('date','2023-09-01','2023年9月')]},fields,[source]).fills.length,0);
 assert.equal(validateDeepseekFills({fills:[fill('date','2001-02-03','2000年2月3日')]},fields,[source]).fills.length,0);
});
test('reviewer approval cannot override the local no-rewriting rule',async()=>{
 let writes=0;
 const result=await runCollaboration({fields:[teamFields[1]],sources:teamSources,entries:teamEntries,assertFresh:async()=>{},draft:async()=>({fills:[aboutProposal('具备前端开发与团队协作能力。')]}),judge:async p=>teamJudge(p),apply:async()=>{writes++;return {ok:true}}});
 assert.equal(writes,0);assert.equal(result[0].status,'needs_review');assert.match(result[0].reason,/连续原文/);
});
