import {fieldRecord,materialIndex} from './material-index.js';
// One page-wide decision is carried through adding slots, matching, auditing and filling.
export function experiencePolicy(sources,sections=[],fields=[],knownCategories=[]){
 const records=materialIndex(sources).records;
 const present=new Set([...knownCategories,...sections.map(s=>s.category),...fields.map(f=>fieldRecord({...f,sourceRecord:undefined})?.category)].filter(Boolean));
 const hasInternship=records.some(r=>r.category==='internship'),hasWork=records.some(r=>r.category==='work');
 return {internshipPresent:present.has('internship'),workPresent:present.has('work'),fallback:hasInternship&&!hasWork&&!present.has('internship')&&present.has('work'),onlyInternship:hasInternship&&!hasWork};
}
export function routeExperienceFields(fields,sources,sections=[],knownCategories=[]){
 const policy=experiencePolicy(sources,sections,fields,knownCategories);
 return fields.map(f=>{
  const expected=fieldRecord({...f,sourceRecord:undefined});if(!expected||expected.category!=='work')return f;
  if(policy.fallback)return {...f,sourceRecord:{category:'internship',record:expected.record},experienceRoute:'internship-in-work',routeNote:'页面没有实习栏目，按用户规则将实习原文填入工作经历。'};
  if(policy.onlyInternship&&policy.internshipPresent)return {...f,supported:false,experienceRoute:'internship-reserved',reason:'页面有实习栏目，实习资料优先填入实习经历；没有正式工作资料，此栏留空。'};
  return f;
 });
}
