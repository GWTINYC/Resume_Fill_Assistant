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
function teamJudge(payload){const answers={};if(payload.state.stage==='route'){payload.state.fields.forEach((f,i)=>{const r=payload.state.ranges.find(r=>r.sourceId===(f.id==='name'?'base.fullName':'material:cv'));const choice=f.id==='salary'?'none':r.id;answers['q'+i]={type:'choice',choice,confidence:.99,probabilities:{[choice]:.99}};});return {answers};}payload.state.items.forEach((item,i)=>{const policy=item.field.id==='about'?'passage':'fact';answers[`q${i}_policy`]={type:'choice',choice:policy,confidence:.99,probabilities:{fact:policy==='fact'?1:0,passage:policy==='passage'?1:0,unclear:0}};for(const part of ['fit','unsupported','conflict'])answers[`q${i}_${part}`]={type:'noul',noul:part==='fit'?.99:.01};});return {answers};}
test('audit covers every source character without splitting Unicode code points',()=>{const text='甲🙂\n'.repeat(5000);const sources=[{id:'cv',label:'材料',text}];const chunks=sourceChunks(sources);assert(chunks.length>1);assert.equal(chunks.flat().filter(x=>x.id==='cv').map(x=>x.text).join(''),text);const packets=auditPackets([nameProposal],[teamFields[0]],teamSources);assert(Object.keys(packets[0].payload.questions).length<=8);assert(new TextEncoder().encode(JSON.stringify(packets[0].payload.state)).length<23000);});
test('collaboration repairs only failed fields; synonymous categories copy the original passage',async()=>{let drafts=0;const applied=[];const feedback=[];const result=await runCollaboration({fields:teamFields,sources:teamSources,entries:teamEntries,assertFresh:async()=>{},draft:async(batch,workflow)=>{drafts++;feedback.push(workflow.feedback);return {fills:batch.flatMap(f=>f.id==='name'?[nameProposal]:f.id==='about'?[aboutProposal(drafts===1?'精通 React，效率提升 50%':teamSources[1].text)]:[])};},judge:async p=>teamJudge(p),apply:async(f,value)=>{applied.push([f.id,value]);return {ok:true,reason:'verified'};}});assert.equal(drafts,2);assert.deepEqual(feedback[1].map(x=>x.fieldId),['about']);assert.equal(result.find(x=>x.fieldId==='about').history.length,2);assert.equal(result.find(x=>x.fieldId==='about').status,'filled');assert.equal(result.find(x=>x.fieldId==='salary').status,'needs_review');assert.equal(applied.length,2);assert(!applied.some(x=>x[1].includes('50%')));});
test('Jev disagreement that survives repair is never automatically filled',async()=>{let writes=0;const result=await runCollaboration({fields:[teamFields[0]],sources:teamSources,entries:teamEntries,assertFresh:async()=>{},draft:async()=>({fills:[nameProposal]}),judge:async p=>{const r=teamJudge(p);if(p.state.stage!=='route')r.answers.q0_conflict.noul=.8;return r;},apply:async()=>{writes++;return {ok:true}}});assert.equal(writes,0);assert.equal(result[0].status,'needs_review');assert.equal(result[0].history.length,2);});
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
 assert(packet.payload.questions.q0_unsupported.instructions.includes('complete relevant prepared passage'));
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

import {materialIndex,recordEvidenceMatches,fieldRecord} from '../src/material-index.js';
test('indexed passages copy original whitespace without model reproduction',()=>{
 const sources=[{id:'cv',label:'素材',text:'个人能力：\n\n1. 熟悉 React。\n\n2. 能够协作。\u00a0   \n'}];const index=materialIndex(sources);const passage=index.passages.find(p=>p.kind==='block'&&p.category==='skills');
 const field={id:'skills',label:'个人技能',type:'textarea',supported:true};const result=validateDeepseekFills({fills:[{fieldId:'skills',passageId:passage.id}]},[field],sources);
 assert.equal(result.fills[0].value,passage.text);assert.equal(result.fills[0].evidence[0].quote,passage.text);assert(sources[0].text.includes(passage.text));
 assert.equal(validateDeepseekFills({fills:[{fieldId:'skills',passageId:passage.id,value:'熟悉 React，善于协作。'}]},[field],sources).fills.length,0);
});
test('material records cannot be interchanged even when both values are original',()=>{
 const sources=[{id:'cv',label:'素材',text:'教育背景：\n硕士：甲大学\n甲学院\n动力工程\n2024.09-2027.06\n本科：乙大学\n乙学院\n车辆工程\n2020.09-2024.06\n实习经历：\n公司：示例甲\n部门：研发\n公司：示例乙\n部门：产品'}];
 const index=materialIndex(sources);const wrong=index.passages.find(p=>p.text==='车辆工程');const right=index.passages.find(p=>p.text==='动力工程');const field={id:'major',label:'专业名称',context:'教育经历 · 第 1 条（页面顺序）',type:'text',supported:true};
 assert.equal(validateDeepseekFills({fills:[{fieldId:'major',passageId:right.id}]},[field],sources).fills[0].value,'动力工程');
 const rejected=validateDeepseekFills({fills:[{fieldId:'major',passageId:wrong.id}]},[field],sources);assert.equal(rejected.fills.length,0);assert.match(rejected.issues[0].reason,/经历/);
 assert.equal(validateDeepseekFills({fills:[{fieldId:'major',value:'车辆工程',evidence:[{sourceId:'cv',quote:'车辆工程'}]}]},[field],sources).fills.length,0);
 const internship={context:'实习经历 · 第 2 条'};assert(!recordEvidenceMatches(internship,[{sourceId:'cv',quote:'示例甲'}],index,sources));assert(recordEvidenceMatches(internship,[{sourceId:'cv',quote:'示例乙'}],index,sources));
});
test('indexed descriptions require complete blocks instead of single headings',()=>{
 const sources=[{id:'cv',text:'实习经历：\n公司：示例公司\n岗位：工程师\n项目标题\n\n1. 目标：完成开发。\n\n2. 工作内容：\n\n(1) 开发页面。\n\n(2) 编写测试。\n\n3. 成果：按时上线。'}];const index=materialIndex(sources);
 const field={id:'desc',label:'实习内容',context:'实习经历 · 第 1 条',type:'textarea',supported:true};const title=index.passages.find(p=>p.text==='项目标题');const body=index.passages.find(p=>p.label==='工作内容');
 assert.equal(validateDeepseekFills({fills:[{fieldId:'desc',passageId:title.id}]},[field],sources).fills.length,0);assert.equal(validateDeepseekFills({fills:[{fieldId:'desc',passageId:body.id}]},[field],sources).fills[0].value,'(1) 开发页面。\n\n(2) 编写测试。');
});

test('campus practice cannot borrow a personal project when its own material is missing',()=>{
 const sources=[{id:'cv',text:'个人项目经历：\n测试项目\n\n1. 目标：学习方法。\n\n2. 工作内容：\n完成验证。'}];const index=materialIndex(sources),passage=index.passages.find(p=>p.label==='工作内容');const field={id:'practice',label:'实践描述',context:'在校实践 · 第 1 条',type:'textarea',supported:true};
 assert.equal(validateDeepseekFills({fills:[{fieldId:'practice',passageId:passage.id}]},[field],sources).fills.length,0);
 assert.equal(validateDeepseekFills({fills:[{fieldId:'practice',value:'完成验证。',evidence:[{sourceId:'cv',quote:'完成验证。'}]}]},[field],sources).fills.length,0);
});
test('confirmed structured education values remain available to matching record candidates',()=>{
 const sources=[{id:'education.0.school',label:'学校',text:'示例大学'}],field={id:'school',label:'学校名称',context:'教育经历 · 第 1 条',type:'text',supported:true};const input=JSON.parse(deepseekPayload([field],sources).messages.at(-1).content);assert(input.fields[0].candidatePassageIds.length>0);assert.equal(validateDeepseekFills({fills:[{fieldId:'school',passageId:input.fields[0].candidatePassageIds[0]}]},[field],sources).fills[0].value,'示例大学');
});

test('date ranges never manufacture a day from the next year prefix',()=>{
 const sources=[{id:'cv',text:'教育背景：\n硕士：示例大学\n2024.09-2027.06'}],index=materialIndex(sources);const dates=index.passages.filter(p=>p.label==='原文日期').map(p=>p.text);assert.deepEqual(dates,['2024.09','2027.06']);
 const field={id:'date',type:'date',supported:true};const proposal={fieldId:'date',value:'2024-09-20',evidence:[{sourceId:'cv',quote:'2024.09-20'}]};assert.equal(validateDeepseekFills({fills:[proposal]},[field],sources).fills.length,0);
});

import {recordTargets,ensureRecordSlots} from '../src/record-slots.js';
test('record targets count records, not fields or duplicate material copies',()=>{
 const text='教育经历：\n硕士：甲大学\n本科：乙大学\n实习经历：\n公司：示例甲\n公司：示例乙';
 assert.deepEqual(recordTargets([{id:'a',text},{id:'b',text}]),{education:2,internship:2});
 assert.equal(recordTargets([{id:'education.0.school',text:'甲'},{id:'education.0.major',text:'专业'},{id:'education.1.school',text:'乙'}]).education,2);
 assert.throws(()=>recordTargets([{id:'a',text},{id:'b',text:'实习经历：\n公司：示例甲'}]),/数量不一致/);
});
test('record expansion stops on cancellation, ambiguity or failed growth',async()=>{
 const sources=[{id:'a',text:'实习经历：\n公司：甲\n公司：乙'}];const section={id:'s0',category:'internship',title:'实习经历',count:1,canAdd:true};let clicks=0;
 const deps={sources,sections:[section],assertFresh:async()=>{},add:async()=>{clicks++;return {ok:false,reason:'未新增'}},rescan:async()=>[section]};
 await assert.rejects(ensureRecordSlots(deps),/未新增/);assert.equal(clicks,1);
 await assert.rejects(ensureRecordSlots({...deps,sections:[section,{...section,id:'s1'}]}),/多个章节/);assert.equal(clicks,1);
 await assert.rejects(ensureRecordSlots({...deps,assertFresh:async()=>{throw Error('已停止')}}),/已停止/);assert.equal(clicks,1);
 await assert.rejects(ensureRecordSlots({...deps,add:async()=>({ok:true})}),/数量不符合/);
});

import {experiencePolicy,routeExperienceFields} from '../src/experience-routing.js';
test('internships prefer their own page section and only fall back when it is absent',()=>{
 const sources=[{id:'cv',text:'实习经历：\n公司：甲公司\n公司：乙公司'}];const work={id:'w2',label:'公司',context:'工作经历 · 第 2 条',supported:true,type:'text'};const intern={id:'i',label:'公司',context:'实习经历 · 第 1 条',supported:true,type:'text'};
 const both=routeExperienceFields([work,intern],sources);assert.equal(both[0].supported,false);assert.equal(both[1].supported,true);
 const fallback=routeExperienceFields([work],sources)[0];assert.equal(fallback.experienceRoute,'internship-in-work');assert.deepEqual(fallback.sourceRecord,{category:'internship',record:2});
 const idx=materialIndex(sources),passage=idx.passages.find(p=>p.text==='乙公司');assert.equal(validateDeepseekFills({fills:[{fieldId:'w2',passageId:passage.id}]},[fallback],sources).fills[0].value,'乙公司');
 const wrong=idx.passages.find(p=>p.text==='甲公司');assert.equal(validateDeepseekFills({fills:[{fieldId:'w2',passageId:wrong.id}]},[fallback],sources).fills.length,0);
 assert.equal(routeExperienceFields([work],sources,[],['internship'])[0].supported,false);
 const mixed=[...sources,{id:'work',text:'工作经历：\n公司：正式单位'}];assert.equal(experiencePolicy(mixed,[],[work]).fallback,false);
});
test('fallback slot expansion adds work slots for internship records and preserves original category',async()=>{
 const sources=[{id:'cv',text:'实习经历：\n公司：甲公司\n公司：乙公司'}];let section={id:'s',category:'work',title:'工作经历',count:1,canAdd:true},calls=0;
 const result=await ensureRecordSlots({sources,sections:[section],assertFresh:async()=>{},add:async(s,target)=>{assert.equal(s.category,'work');assert.equal(target,2);calls++;section={...section,count:2};return {ok:true};},rescan:async()=>[section]});assert.equal(result.added,1);assert.equal(calls,1);assert.equal(materialIndex(sources).records[0].category,'internship');
});

test('Moka date components keep start/end and record identity, without inventing precision',()=>{
 const sources=[{id:'cv',label:'素材',text:'教育背景\n硕士：示例大学\n2024.09-2027.06\n本科：另一大学\n2020.09-2024.06'}];
 const fields=['start','end'].flatMap(boundary=>['year','month'].map(unit=>({id:boundary+unit,label:'就读时间',context:'教育背景 · 第 1 条',type:'custom-select',datePart:{boundary,unit},supported:true,options:['2020','2024','2027','9','09','6'].map(value=>({value,label:value}))})));
 const fill=(id,value,quote='2024.09-2027.06')=>({fieldId:id,value,evidence:[{sourceId:'cv',quote}]});
 const run=(id,value,quote)=>validateDeepseekFills({fills:[fill(id,value,quote)]},fields,sources).fills.length;
 assert.equal(run('startyear','2024'),1);assert.equal(run('startmonth','9'),1);assert.equal(run('startmonth','09'),1);assert.equal(run('endyear','2027'),1);assert.equal(run('endmonth','6'),1);
 assert.equal(run('startyear','2027'),0);assert.equal(run('endmonth','9'),0);assert.equal(run('startyear','2020','2020.09-2024.06'),0);
 assert.equal(run('startyear','2027','2027.06'),0);assert.equal(run('endyear','2027','2027.06'),1);
 assert.deepEqual(fieldRecord({context:'项目经验 · 第 2 条'}),{category:'project',record:2});
});

import {captureDraft,mergeLearnedFacts,learnedEntries,preferredLearned,validateLearnedFacts,learnedSourceAllowed,learningContextWarning} from '../src/learned.js';
const learnedFact=(extra={})=>({id:'a',label:'移动电话',value:'13900000001',category:'base',record:0,section:'个人基本信息',host:'example.test',scope:'global',enabled:true,...extra});
test('page learning scopes family and preferences, requires confirmation, and preserves exact text',()=>{
 const rows=captureDraft([{label:'姓名',context:'家庭关系 · 第 2 条',capturedValue:'示例母亲'},{label:'期望薪资',context:'个人基本信息',capturedValue:'面议'},{label:'工作描述',context:'实习经历 · 第 2 条',capturedValue:'原文。\n\n  空白不改。'},{label:'密码',capturedValue:'excluded'}],'example.test');
 assert.equal(rows.length,3);assert.equal(rows[0].category,'family');assert.equal(rows[0].record,2);assert(!rows[0].selected);assert.equal(rows[1].scope,'site');assert(!rows[1].selected);assert.equal(rows[2].value,'原文。\n\n  空白不改。');assert(rows[2].selected);
});
test('learned values deduplicate, replace explicitly, disable and respect website scope',()=>{
 const a=learnedFact(),b=learnedFact({id:'b',value:'13900000002'});const merged=mergeLearnedFacts([a],[b]);assert.equal(mergeLearnedFacts([],[a,a]).length,1);assert.equal(merged.length,1);assert.equal(merged[0].id,'a');assert.equal(merged[0].value,b.value);
 const site=learnedFact({id:'site',scope:'site',value:'13900000003'});const all=validateLearnedFacts([a,site]);assert.equal(learnedEntries(all,'example.test')[0].value,site.value);assert.equal(learnedEntries(all,'another.test')[0].value,a.value);
 assert.equal(learnedEntries(validateLearnedFacts([learnedFact({enabled:false})]),'example.test').length,0);
 assert.throws(()=>mergeLearnedFacts([],[a,b]),/重复字段/);assert.throws(()=>validateLearnedFacts([learnedFact({label:'API key'})]),/无效字段/);
});
test('confirmed learned sources override older values only within the corresponding property and record',()=>{
 const facts=validateLearnedFacts([learnedFact(),learnedFact({id:'skill',category:'skills',label:'评价内容',value:'原文技能\n第二行。',section:'自我评价'}),learnedFact({id:'family',category:'family',record:1,label:'姓名',value:'示例父亲',section:'家庭关系'})]);
 const sources=applicantSources(learnedEntries(facts,'example.test'),{notes:'手机号：13900000000'},[]);const phone={id:'phone',label:'手机号',type:'text',supported:true};
 assert.deepEqual(preferredLearned(phone,sources),['learned:a']);
 const input=JSON.parse(deepseekPayload([phone],sources).messages.at(-1).content);assert(input.passages.every(p=>p.sourceId==='learned:a'));
 assert.equal(validateDeepseekFills({fills:[{fieldId:'phone',value:'13900000000',evidence:[{sourceId:'notes',quote:'13900000000'}]}]},[phone],sources).fills.length,0);
 const source=sources.find(s=>s.id==='learned:a');assert.equal(validateDeepseekFills({fills:[{fieldId:'phone',value:source.text,evidence:[{sourceId:source.id,quote:source.text}]}]},[phone],sources).fills.length,1);
 assert.deepEqual(preferredLearned({label:'个人能力',context:'应聘资料'},sources),['learned:skill']);
 const name={id:'name',label:'姓名',type:'text',supported:true};assert.equal(validateDeepseekFills({fills:[{fieldId:'name',value:'示例父亲',evidence:[{sourceId:'learned:family',quote:'示例父亲'}]}]},[name],sources).fills.length,0);
});
test('learned experiences retain records and supplement slot counts without treating each fact as a record',()=>{
 const facts=validateLearnedFacts([learnedFact({id:'c1',category:'internship',record:1,label:'企业名称',value:'甲公司'}),learnedFact({id:'d1',category:'internship',record:1,label:'工作描述',value:'第一段'}),learnedFact({id:'c2',category:'internship',record:2,label:'企业名称',value:'乙公司'})]);const sources=applicantSources(learnedEntries(facts,'example.test'),{},[]);
 assert.deepEqual(recordTargets(sources),{internship:2});const field={id:'co',label:'公司名称',context:'实习经历 · 第 2 条',supported:true,type:'text'};assert.deepEqual(preferredLearned(field,sources),['learned:c2']);
 assert.equal(validateDeepseekFills({fills:[{fieldId:'co',value:'甲公司',evidence:[{sourceId:'learned:c1',quote:'甲公司'}]}]},[field],sources).fills.length,0);
});
test('experience labels without record context require review instead of becoming global base facts',()=>{
 const labels=['学校名称','学院名称','专业名称','公司名称','职务','项目名称','项目职务','项目职责'];
 const rows=captureDraft(labels.map(label=>({label,capturedValue:'合成资料'})),'example.test');
 for(const row of rows){assert.equal(row.category,'other',row.label);assert.equal(row.scope,'site');assert.equal(row.selected,false);assert.match(row.warning,/资料类目和第几条经历/);}
 const basic=captureDraft([{label:'姓名',capturedValue:'示例本人'},{label:'手机号',capturedValue:'13900000001'},{label:'最高学历',capturedValue:'硕士'}],'example.test');
 assert(basic.every(row=>row.category==='base'&&row.scope==='global'&&row.selected));
 assert(learningContextWarning({label:'学校名称',context:'教育经历'}));
 assert.equal(learningContextWarning({label:'学校名称',context:'教育经历 · 第 2 条'}),'');
 assert.equal(learningContextWarning({label:'公司名称',sourceRecord:{category:'internship',record:2}}),'');
});
test('repeated captured fields without explicit records stay unselected even when their values agree',()=>{
 for(const values of [['甲大学','乙大学'],['同一大学','同一大学']]){
  const rows=captureDraft(values.map(capturedValue=>({label:'学校',context:'教育经历',capturedValue})),'example.test');
  assert(rows.every(row=>!row.selected&&row.scope==='site'&&row.warning));
 }
 const names=captureDraft(['甲','乙'].map(capturedValue=>({label:'姓名',capturedValue})),'example.test');
 assert(names.every(row=>!row.selected&&/同名资料/.test(row.warning)));
 const numbered=captureDraft(['甲大学','乙大学'].map((capturedValue,i)=>({label:'学校',context:`教育经历 · 第 ${i+1} 条`,capturedValue})),'example.test');
 assert(numbered.every(row=>row.selected&&row.scope==='global'));assert.deepEqual(numbered.map(row=>row.record),[1,2]);
});
test('experience dates and descriptions require context while numbered records still match their own facts',()=>{
 const groups=[
  ['教育经历','education',['开始日期','结束日期','开始时间','结束时间','起始时间','入学时间','毕业时间','学院名称']],
  ['实习经历','internship',['入职时间','离职时间','实习内容','实习描述','实习职责','部门名称']],
  ['工作经历','work',['工作职责','职务','公司名称']],
  ['项目经历','project',['项目职务','项目职责','项目中职责','项目描述','项目介绍']]
 ];
 for(const [section,category,labels] of groups)for(const label of labels){
  assert(learningContextWarning({label}),label);
  assert.equal(captureDraft([{label,capturedValue:'合成资料'}],'example.test')[0].selected,false,label);
  const facts=validateLearnedFacts([1,2].map(record=>learnedFact({id:'record'+record,label,value:'第'+record+'条原文',category,record,section})));
  const sources=applicantSources(learnedEntries(facts,'another.test'),{},[]);
  for(const record of [1,2]){
   const target={label,context:`${section} · 第 ${record} 条`};assert.equal(learningContextWarning(target),'',label);
   assert.deepEqual(preferredLearned(target,sources),['learned:record'+record],label);
   assert.equal(learnedSourceAllowed(target,sources[record-1]),true,label);assert.equal(learnedSourceAllowed(target,sources[2-record]),false,label);
  }
 }
});
test('legacy base experience facts cannot fill contextless targets through local, model or routed matching',()=>{
 const facts=validateLearnedFacts([learnedFact({id:'school',label:'学校名称',value:'甲大学',section:''}),learnedFact({id:'role',label:'项目职务',value:'负责人',section:''})]);
 const entries=learnedEntries(facts,'another.test'),sources=applicantSources(entries,{},[]);
 const fields=[{id:'school1',label:'学校名称'},{id:'school2',label:'学校名称'},{id:'role',label:'项目职务'}].map(f=>({...f,type:'text',supported:true,context:''}));
 for(const field of fields){
  assert.deepEqual(preferredLearned(field,sources),[]);
  assert.equal(localMapping(field,entries.filter(entry=>learnedSourceAllowed(field,entry))),null);
  for(const source of sources)assert.equal(learnedSourceAllowed(field,source),false);
 }
 const input=JSON.parse(deepseekPayload(fields,sources).messages.at(-1).content);assert.equal(input.passages.length,0);assert(input.fields.every(f=>f.candidatePassageIds.length===0));
 assert.equal(routingPackets(fields,sources).packets.length,0);
 const source=sources[0],index=materialIndex(sources),passage=index.passages.find(p=>p.sourceId===source.id);
 for(const field of fields.slice(0,2)){
  for(const proposal of [{fieldId:field.id,passageId:passage.id},{fieldId:field.id,value:source.text,evidence:[{sourceId:source.id,quote:source.text}]}]){
   const result=validateDeepseekFills({fills:[proposal]},fields,sources);assert.equal(result.fills.length,0);assert.equal(result.rejected,1);assert(result.issues.length);
  }
  const range=sourceRanges(sources).find(r=>r.sourceId===source.id),routes=[{fieldId:field.id,rangeId:range.id}];
  assert.equal(routedRange(field,sources,routes),null);
  assert.equal(validateDeepseekFills({fills:[{fieldId:field.id,rangeId:range.id,quote:source.text,value:source.text}]},fields,sources,{routes}).fills.length,0);
 }
 // Keep old entries available for management/export, but not as unrelated base-field evidence.
 assert.equal(entries.length,2);assert.equal(learnedSourceAllowed({label:'姓名'},source),false);
 assert.equal(learnedSourceAllowed(fields[0],{id:'notes',text:'甲大学'}),true);
});
test('confirmed record assignments support a correction and relearning cycle without changing another record',()=>{
 const draft=captureDraft(['甲大学','乙大学'].map(capturedValue=>({label:'学校名称',capturedValue})),'example.test');
 const confirmed=draft.map((row,i)=>({...row,category:'education',record:i+1,scope:'global',selected:true}));
 const first=mergeLearnedFacts([],confirmed);assert.equal(first.length,2);
 const targets=[1,2].map(record=>({id:'school'+record,label:'学校名称',context:`教育经历 · 第 ${record} 条`,type:'text',supported:true}));
 let sources=applicantSources(learnedEntries(first,'another.test'),{},[]);
 for(const [i,target] of targets.entries()){
  assert.deepEqual(preferredLearned(target,sources),['learned:'+first[i].id]);
  const input=JSON.parse(deepseekPayload([target],sources).messages.at(-1).content);assert.equal(input.passages.length,1);
  const result=validateDeepseekFills({fills:[{fieldId:target.id,passageId:input.passages[0].id}]},[target],sources);assert.equal(result.fills[0].value,confirmed[i].value);
 }
 const corrected=captureDraft([{...targets[1],capturedValue:'乙大学（已更正）'}],'another.test');assert(corrected[0].selected);
 const updated=mergeLearnedFacts(first,corrected);assert.equal(updated.length,2);assert.equal(updated[0].value,'甲大学');assert.equal(updated[1].id,first[1].id);assert.equal(updated[1].value,'乙大学（已更正）');
 sources=applicantSources(learnedEntries(updated,'third.test'),{},[]);
 const preferred=preferredLearned(targets[1],sources);assert.deepEqual(preferred,['learned:'+first[1].id]);assert.equal(sources.find(s=>s.id===preferred[0]).text,'乙大学（已更正）');
 const wrong=sources.find(s=>s.id==='learned:'+first[0].id);assert.equal(validateDeepseekFills({fills:[{fieldId:targets[1].id,value:wrong.text,evidence:[{sourceId:wrong.id,quote:wrong.text}]}]},targets,sources).fills.length,0);
});

import {AppError,importDiagnostic} from '../src/diagnostics.js';
test('import diagnostics distinguish failures and redact file content, paths and raw exceptions',()=>{
 const context={stage:'decode',file:{name:'private-person.txt',size:321},persisted:false};
 const encoding=importDiagnostic(new AppError('TXT_ENCODING','SENSITIVE-CONTENT'),context,{version:'test',platform:'Windows'});assert.equal(encoding.code,'TXT_ENCODING');assert.match(encoding.message,/UTF-8/);assert.match(encoding.message,/未替换原有素材/);assert(!JSON.stringify(encoding).includes('SENSITIVE'));assert(!JSON.stringify(encoding.report).includes('private-person'));
 const read=importDiagnostic(new DOMException('secret','NotReadableError'),{...context,stage:'read'});assert.equal(read.code,'FILE_READ');assert.match(read.message,/OneDrive/);
 const quota=importDiagnostic(new DOMException('secret','QuotaExceededError'),{...context,stage:'store'});assert.equal(quota.code,'STORE_QUOTA');
 const preview=importDiagnostic(new TypeError('secret'),{...context,stage:'profile',persisted:true,textReady:true});assert.match(preview.message,/原文件和文本已保存/);assert(!preview.message.includes('文本提取尚未完成'));
});
test('unsupported TXT encoding, disguised formats, empty text and binary bytes have actionable codes',()=>{
 const rejects=(bytes,code)=>assert.throws(()=>decodeText(bytes),e=>e.code===code);
 rejects(new Uint8Array(),'TXT_EMPTY');rejects(new TextEncoder().encode('  \r\n'),'TXT_EMPTY');rejects(new Uint8Array([0x81]),'TXT_ENCODING');rejects(new Uint8Array([0,1,2]),'TXT_BINARY');
 rejects(new TextEncoder().encode('%PDF-1.7'),'TXT_FORMAT');rejects(new TextEncoder().encode('{\\rtf1 hello}'),'TXT_FORMAT');
});

import {nativeKeyRequest} from '../src/native-keys.js';
test('PC connection errors distinguish missing host from an unauthorized extension ID',async()=>{
 const original=globalThis.chrome;
 try{
  for(const [message,code]of [['Specified native messaging host not found.','PC_NOT_INSTALLED'],['Access to the specified native messaging host is forbidden.','PC_ORIGIN_DENIED'],['Native host has exited.','PC_HOST_FAILED']]){
   globalThis.chrome={runtime:{sendNativeMessage:async()=>{throw Error(message)}}};await assert.rejects(()=>nativeKeyRequest({action:'status'}),e=>e.code===code);
  }
  globalThis.chrome={runtime:{sendNativeMessage:async()=>({ok:true,value:'PRIVATE-INVALID-KEY'})}};await assert.rejects(()=>nativeKeyRequest({action:'get',provider:'jev'}),e=>e.code==='PC_PROTOCOL_INVALID'&&!e.message.includes('PRIVATE-INVALID'));
 }finally{globalThis.chrome=original;}
});

import {sourceRanges,routingPackets,routedRange} from '../src/source-routing.js';
test('Jev assigns material before extraction; second internship scope cannot borrow first internship',()=>{
 const sources=[{id:'cv',label:'TXT',text:'实习经历\n公司：示例甲\n岗位：开发\n2024.06—2024.09\n公司：示例乙\n岗位：测试\n2025.06—2025.09'}];
 const f={id:'f',label:'公司名称',context:'实习经历 · 第 2 条',type:'text',supported:true};
 const range=sourceRanges(sources).find(r=>r.record===2),workflow={collaborative:true,routes:[{fieldId:'f',rangeId:range.id}]};
 const packets=routingPackets([f],sources).packets;assert(!Object.keys(packets[0].payload.questions.q0.criteria).includes(sourceRanges(sources)[0].id));
 const input=JSON.parse(deepseekPayload([f],sources,workflow).messages.at(-1).content);assert.equal(input.assignments[0].range.text,range.text);assert.deepEqual(input.sources,[]);assert.deepEqual(input.passages,[]);
 const fill=(value,quote=value)=>({fieldId:'f',rangeId:range.id,value,quote});
 assert.equal(validateDeepseekFills({fills:[fill('示例乙')]},[f],sources,workflow).fills[0].value,'示例乙');
 assert.match(validateDeepseekFills({fills:[fill('示例甲')]},[f],sources,workflow).issues[0].reason,/SOURCE_RANGE/);
 assert.equal(validateDeepseekFills({fills:[{...fill('示例乙'),rangeId:'r-unknown'}]},[f],sources,workflow).fills.length,0);
 const date={...f,label:'开始月份',type:'month'};assert.equal(validateDeepseekFills({fills:[fill('2025-06','2025.06')]},[date],sources,workflow).fills[0].value,'2025-06');
 assert.equal(validateDeepseekFills({fills:[fill('2025-06-01','2025.06')]},[{...date,type:'date'}],sources,workflow).fills.length,0);
});
test('routed extraction can take an atomic fact from prose without inventing a pre-indexed answer',()=>{
 const sources=[{id:'notes',label:'零散信息',text:'我的备用邮箱是 backup@example.test，平时不用。'}],f={id:'email',label:'备用邮箱',type:'email',supported:true};
 const range=sourceRanges(sources)[0],workflow={routes:[{fieldId:f.id,rangeId:range.id}]};
 const result=validateDeepseekFills({fills:[{fieldId:f.id,rangeId:range.id,quote:sources[0].text,value:'backup@example.test'}]},[f],sources,workflow);assert.equal(result.fills[0].value,'backup@example.test');
 const wrong=validateDeepseekFills({fills:[{fieldId:f.id,rangeId:range.id,quote:sources[0].text,value:'other@example.test'}]},[f],sources,workflow);assert.equal(wrong.fills.length,0);
});
test('low-confidence routing never reaches DeepSeek or page writes',async()=>{
 let draft=0,writes=0;
 const results=await runCollaboration({fields:[teamFields[0]],sources:teamSources,entries:teamEntries,assertFresh:async()=>{},judge:async p=>{const result=teamJudge(p);result.answers.q0.confidence=.6;return result;},draft:async()=>{draft++;return {fills:[nameProposal]}},apply:async()=>{writes++;return {ok:true}}});
 assert.equal(draft,0);assert.equal(writes,0);assert.match(results[0].reason,/ROUTE_NONE/);
});
test('routing partitions cover every source and competing regions are held as ambiguous',async()=>{
 const sources=Array.from({length:24},(_,i)=>({id:'s'+i,label:'资料'+i,text:'示例姓名'}));const seen=new Set();let drafts=0;
 const results=await runCollaboration({fields:[teamFields[0]],sources,entries:[],assertFresh:async()=>{},judge:async p=>{assert.equal(p.state.stage,'route');p.state.ranges.forEach(r=>seen.add(r.sourceId));const id=Object.keys(p.questions.q0.criteria).find(x=>x!=='none');return {answers:{q0:{type:'choice',choice:id,confidence:1,probabilities:{[id]:1}}}}},draft:async()=>{drafts++;return {fills:[]}},apply:async()=>{throw Error('unexpected write')}});
 assert.equal(seen.size,24);assert.equal(drafts,0);assert.match(results[0].reason,/ROUTE_AMBIGUOUS/);
});
test('dynamic selectors permit only grounded original search/path values beyond the observed options',()=>{
 const sources=[{id:'cv',label:'资料',text:'学校：示例理工大学\n籍贯：浙江省杭州市西湖区'}];
 for(const [selectionMode,value]of [['search','示例理工大学'],['virtual','示例理工大学'],['cascade','浙江省杭州市西湖区']]){
  const f={id:'f',label:'信息',type:'custom-select',selectionMode,supported:true,options:[{value:'其他',label:'其他'}]};
  assert.equal(validateDeepseekFills({fills:[{fieldId:'f',value,evidence:[{sourceId:'cv',quote:sources[0].text}]}]},[f],sources).fills.length,1);
  assert.equal(validateDeepseekFills({fills:[{fieldId:'f',value:'凭空猜测',evidence:[{sourceId:'cv',quote:sources[0].text}]}]},[f],sources).fills.length,0);
 }
});
