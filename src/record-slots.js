import {experiencePolicy} from './experience-routing.js';
import {materialIndex} from './material-index.js';
export function recordTargets(sources){
 const records=materialIndex(sources).records,targets={};
 for(const category of ['education','internship','work','project']){
  const learned=records.filter(r=>r.category===category&&r.learned);const rows=records.filter(r=>r.category===category&&!r.learned);if(!rows.length){const ids=[...new Set(learned.map(r=>r.record))].sort((a,b)=>a-b);if(ids.length&&ids.every((n,i)=>n===i+1))targets[category]=ids.length;continue;}
  const structured=rows.filter(r=>/^(education|work)\./.test(r.sourceId));
  const groups=new Map();for(const r of structured.length?structured:rows){const id=structured.length?'profile':r.sourceId;if(!groups.has(id))groups.set(id,new Set());groups.get(id).add(r.record);}
  const counts=[...groups.values()].map(ids=>{const sorted=[...ids].sort((a,b)=>a-b);if(sorted.some((n,i)=>n!==i+1))throw Error('素材经历序号不连续，请先核对资料。');return ids.size;});
  if(new Set(counts).size!==1)throw Error('多份启用素材的经历数量不一致，请先选择当前要填写的素材。');
  if(counts[0]>10)throw Error('单类经历超过 10 条，请手动准备栏位后分段填写。');targets[category]=Math.max(counts[0],...learned.map(r=>r.record));
 }
 return targets;
}
export async function ensureRecordSlots({sources,sections,fields=[],knownCategories=[],add,rescan,assertFresh,onProgress=()=>{}}){
 const targets=recordTargets(sources);const policy=experiencePolicy(sources,sections,fields,knownCategories);
 if(policy.fallback){targets.work=targets.internship;delete targets.internship;}
 let current=sections,clicks=0;
 for(const [category,target]of Object.entries(targets)){
  for(;;){
   await assertFresh();const matches=current.filter(s=>s.category===category);if(!matches.length)break;
   if(matches.length!==1)throw Error('同类经历分布在多个章节或框架，无法确定添加位置，请手动补足栏位。');
   const section=matches[0];if(section.blocked)throw Error(section.blocked);
   if(section.count>=target)break;
   if(!section.canAdd)throw Error(`${section.title}需要 ${target} 组，目前只有 ${section.count} 组；未找到唯一可用的添加按钮，请手动添加后重试。`);
   if(clicks>=12)throw Error('本次新增达到 12 组上限，请检查页面后重新启动。');
   onProgress(`正在补足${section.title}：${section.count} → ${section.count+1} / ${target}`);
   const result=await add(section,target);clicks++;
   if(!result.ok)throw Error(result.reason||'未确认新增成功，已停止，避免重复添加。');
   await assertFresh();current=await rescan();await assertFresh();
   const next=current.filter(s=>s.category===category);if(next.length!==1||next[0].count!==section.count+1)throw Error('新增后经历数量不符合预期，请检查页面后重试。');
  }
 }
 return {added:clicks};
}
