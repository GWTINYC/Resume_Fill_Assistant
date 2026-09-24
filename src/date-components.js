import {fieldRecord,materialIndex} from './material-index.js';
// Only extract an explicitly supplied component; never calculate age or invent precision.
const dates=text=>[...text.matchAll(/(?<!\d)(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?月?(?!\d)/g)].filter(m=>Number(m[2])>=1&&Number(m[2])<=12);
export function dateComponentMatches(field,value,evidence,sources){
 const part=field.datePart;if(!part||!['year','month'].includes(part.unit)||!['start','end','single'].includes(part.boundary))return false;
 const option=field.options?.find(o=>!o.disabled&&o.value===value);if(!option)return false;
 const represented=String(option.label||value).match(/^\s*(\d{1,4})\s*[年月]?\s*$/);if(!represented)return false;
 const expected=fieldRecord(field),index=sources&&materialIndex(sources);
 return evidence.some(e=>{
  let text=e.quote;
  if(sources){
   const source=sources.find(s=>s.id===e.sourceId);if(!source)return false;
   const ranges=expected?index.records.filter(r=>r.sourceId===e.sourceId&&r.category===expected.category&&r.record===expected.record):[];
   const scope=ranges.length?ranges.map(r=>source.text.slice(r.start,r.end)).join('\n'):source.text;
   // Retain range order even when the model cites only one endpoint.
   const lines=scope.split('\n').filter(line=>line.includes(e.quote));if(lines.length===1)text=lines[0];
  }
  const found=dates(text);let selected;
  if(found.length===2&&part.boundary!=='single')selected=found[part.boundary==='start'?0:1];
  else if(found.length===1){
   if(part.boundary!=='single'&&sources){
    const source=sources.find(s=>s.id===e.sourceId);
    const explicit=part.boundary==='start'?/开始|入学|入职|start/i:/结束|毕业|离职|end/i;
    const structured=source?.id.endsWith(part.boundary==='start'?'.start':'.end');
    if(!structured&&!explicit.test(text))return false;
   }
   selected=found[0];
  }
  return !!selected&&e.quote.includes(selected[0])&&Number(selected[part.unit==='year'?1:2])===Number(represented[1]);
 });
}
