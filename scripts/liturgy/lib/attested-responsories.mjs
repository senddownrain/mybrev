import { parse } from 'node-html-parser';
import attested from '../sources/attested-short-responsories.json' with { type: 'json' };
import { liturgicalText } from '../../../src/utils/liturgicalSourceHtml.js';
export const RESPONSORY_ATTESTATIONS = attested.records;
const key = text => text.replace(/[\s\u00a0]+/gu,' ').trim().toLocaleLowerCase('be');
const prefix = (fragment, full) => key(full).startsWith(key(fragment.replace(/[.!?]+$/u,'')));
const escape = text => text.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;');

/** Use a transcribed full source, never infer the repeated words from K.
 * HTML must already have logical reply paragraphs. Each variant is scoped
 * to a single parent and exact verse pair, including seasonal Alleluia. */
export function expandAttestedResponsories(html) {
  const source=String(html||''),root=parse(source),paragraphs=root.querySelectorAll('p'),edits=[],proofs=[];
  for(let index=0;index+5<paragraphs.length;index++) {
    const group=paragraphs.slice(index,index+6),lines=group.map(p=>liturgicalText(p.toString()));
    if(group.some(p=>p.parentNode!==group[0].parentNode))continue;
    if(lines.map(t=>t.match(/^([КН])\.\s/u)?.[1]||'').join('')!=='КНКНКН')continue;
    if(!/^К\. Хвала Айцу(?:\.| і Сыну, і Духу Святому\.)$/u.test(lines[4]))continue;
    const proof=RESPONSORY_ATTESTATIONS.find(r=>key(r.lines[0])===key(lines[0])&&key(r.lines[2])===key(lines[2])
      &&[1,3,5].every(i=>prefix(lines[i],r.lines[i])));
    if(!proof)continue;
    let changed=false;
    for(const n of [1,3,4,5]) {
      if(lines[n]===proof.lines[n])continue;
      const p=group[n],attrs=p.rawAttrs?` ${p.rawAttrs}`:'',text=proof.lines[n];
      const body=escape(text.slice(3)).replace(/\*/gu,'<span style="color: #ff0000;">*</span>');
      edits.push({start:p.range[0],end:p.range[1],value:`<p${attrs}><span style="color: #ff0000;">${text.slice(0,2)}</span> ${body}</p>`});
      changed=true;
    }
    if(changed)proofs.push(proof.id);
    index+=5;
  }
  return {value:edits.sort((a,b)=>b.start-a.start).reduce((text,e)=>text.slice(0,e.start)+e.value+text.slice(e.end),source),proofs:[...new Set(proofs)]};
}
