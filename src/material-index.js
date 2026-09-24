// Deterministic references into the original text. No generated answer text is stored here.
const titles=new Map([['教育背景','education'],['教育经历','education'],['实习经历','internship'],['工作经历','work'],['个人项目经历','project'],['项目经验','project'],['项目经历','project'],['课题项目经验','project'],['个人能力','skills'],['个人技能','skills'],['专业技能','skills'],['自我评价','skills'],['自我介绍','intro'],['在校实践','practice'],['校园经历','practice'],['获奖情况','awards'],['获奖经历','awards'],['论文/专著','publications']]);
export function fieldRecord(field){
 if(field.sourceRecord&&['education','internship','work','project','practice','awards','publications'].includes(field.sourceRecord.category)&&Number.isInteger(field.sourceRecord.record)&&field.sourceRecord.record>0)return field.sourceRecord;
 const context=field.context||'';const record=Number(context.match(/第\s*(\d+)\s*条/)?.[1]||context.match(/(?:经历|经验)\s*(\d+)/)?.[1]||(/^(教育背景|(?:教育|实习|工作|项目)(?:经历|经验))$/.test(context.trim())?'1':''));
 const category=/^教育(?:经历|背景)/.test(context)?'education':/^实习(?:经历|经验)/.test(context)?'internship':/^工作(?:经历|经验)|^工作[／/和及、]实习经历/.test(context)?'work':/^课题项目经验|^项目(?:经历|经验)/.test(context)?'project':/^在校实践/.test(context)?'practice':/^获奖情况/.test(context)?'awards':/^论文\/专著/.test(context)?'publications':null;
 return category&&record?{category,record}:null;
}
export function materialIndex(sources){
 const passages=[],records=[];
 for(const source of sources){
  const text=source.text;const structured=source.id.match(/^(education|work)\.(\d+)\./);let offset=0,category=structured?.[1]||'general',record=structured?Number(structured[2])+1:0;const counts={};const lines=[];
  for(const raw of text.split('\n')){
   const start=offset;offset+=raw.length+1;const content=raw.trim();const key=content.replace(/[：:]$/,'');
   if(titles.has(key)){category=titles.get(key);record=0;}
   else if(/仅对游戏|仅适用于游戏/.test(content)){category='gaming';record=0;}
   else if(category==='education'&&/^(博士|硕士|本科|专科|大专)\s*[：:]/.test(content))record=counts[category]=(counts[category]||0)+1;
   else if(['internship','work'].includes(category)&&/^公司\s*[：:]/.test(content))record=counts[category]=(counts[category]||0)+1;
   else if(category==='project'&&!record&&content&&!/^[-—_=]+$/.test(content)&&!titles.has(key))record=counts[category]=(counts[category]||0)+1;
   lines.push({start,end:start+raw.length,text:raw,category,record,heading:titles.has(key)||category==='gaming'&&/仅对游戏|仅适用于游戏/.test(content),separator:/^[-—_=]+$/.test(content)});
  }
  const added=new Set();
  const add=(start,end,label,kind,meta)=>{
   while(start<end&&/\s/.test(text[start]))start++;while(end>start&&/\s/.test(text[end-1]))end--;
   if(start>=end||end-start>10000)return;const key=`${start}:${end}`;if(added.has(key))return;added.add(key);
   passages.push({id:`p${passages.length}`,sourceId:source.id,category:meta.category,record:meta.record||null,label,kind,start,end,text:text.slice(start,end)});
  };
  let i=0;
  while(i<lines.length){
   const first=lines[i];let j=i+1;while(j<lines.length&&lines[j].category===first.category&&lines[j].record===first.record)j++;
   const part=lines.slice(i,j);const meaningful=part.filter(l=>l.text.trim()&&!l.heading&&!l.separator);
   if(meaningful.length){
    const start=meaningful[0].start,end=meaningful.at(-1).end;
    if(first.record)records.push({sourceId:source.id,category:first.category,record:first.record,start,end});
    add(start,end,structured?source.label:`${first.category} 原文完整段落`,'block',first);
    const contentLines=meaningful.filter(l=>!/^\s*(公司|部门|岗位)\s*[：:]/.test(l.text));
    if(['internship','work'].includes(first.category)&&contentLines.length)add(contentLines[0].start,contentLines.at(-1).end,'实习/工作内容（完整）','block',first);
    const markers=meaningful.filter(l=>/^\s*\d+[.、．]\s*(目标|工作内容|成果|项目成果|GitHub链接)\s*[：:]/.test(l.text));
    for(let k=0;k<markers.length;k++){
     const m=markers[k],match=m.text.match(/^\s*\d+[.、．]\s*([^：:]+)[：:]\s*/);add(m.start+match[0].length,k+1<markers.length?markers[k+1].start:end,match[1],'block',first);
    }
    if(markers.length)add(markers[0].start,end,'经历描述（目标、工作与成果）','block',first);
    if(first.category==='skills')for(const line of meaningful){const m=line.text.match(/^\s*\d+[.、．]\s*([^：:]+)[：:]/);if(m){const at=line.text.indexOf(m[1]);add(line.start+at,line.start+at+m[1].length,'技能名称','value',line);}}
    for(const line of meaningful){
     if(/^\s*\d+[.、．]\s*(目标|工作内容|成果|项目成果)\s*[：:]/.test(line.text)||/^\s*\(?\d{1,2}[)）.、．]/.test(line.text))continue;
     const labeled=line.text.match(/^\s*(电话|手机|邮箱|出生年月|公司|部门|岗位|硕士|博士|本科|专科|大专)\s*[：:]\s*/);
     if(labeled){
      add(line.start+labeled[0].length,line.end,labeled[1],'value',line);
      if(/硕士|博士|本科|专科|大专/.test(labeled[1])){
       const labelAt=line.text.indexOf(labeled[1]);add(line.start+labelAt,line.start+labelAt+labeled[1].length,'学历','value',line);
       const name=line.text.slice(labeled[0].length).split(/[（(]/)[0];add(line.start+labeled[0].length,line.start+labeled[0].length+name.length,'学校名称','value',line);
      }
     }else{
      add(line.start,line.end,'原文行','value',line);
      const matches=[...line.text.matchAll(/(?<!\d)\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?月?(?!\d)/g)];for(const m of matches)add(line.start+m.index,line.start+m.index+m[0].length,'原文日期','value',line);
     }
    }
   }
   i=j;
  }
 }
 return {passages,records};
}
export function recordEvidenceMatches(field,evidence,index,sources){
 const expected=fieldRecord(field);if(!expected)return true;
 const relevant=index.records.filter(r=>r.category===expected.category);
 return evidence.every(e=>{
  const source=sources.find(s=>s.id===e.sourceId);if(!source)return false;
  const structured=e.sourceId.match(/^(education|work)\.(\d+)\./);
  if(structured)return structured[1]===expected.category&&Number(structured[2])+1===expected.record&&source.text.includes(e.quote);
  const ranges=relevant.filter(r=>r.sourceId===e.sourceId&&r.record===expected.record);
  if(ranges.length)return ranges.some(r=>source.text.slice(r.start,r.end).includes(e.quote));
  // A named section cannot borrow another named section's evidence when its own is absent.
  return !index.passages.some(p=>p.sourceId===e.sourceId&&p.category!=='general'&&p.category!==expected.category&&p.text.includes(e.quote));
 });
}
