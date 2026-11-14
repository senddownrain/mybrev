/** Editorial display expansion under the owner's PR245 v3 models.
 * No new words, cross-variant lookup, runtime rendering or doxology expansion. */
import { parse } from 'node-html-parser';
import { createHash } from 'node:crypto';
import { liturgicalText } from '../../../src/utils/liturgicalSourceHtml.js';
export const editorialHash = text => createHash('sha256').update(String(text)).digest('hex');
const escape = text => String(text).replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;');
const tokens = text => String(text).toLocaleLowerCase('be').match(/[\p{L}\p{N}]+(?:[’'ʼ][\p{L}\p{N}]+)*/gu) || [];
const role = p => liturgicalText(p?.innerHTML||'').match(/^([КН])\s*\.\s/u)?.[1] || '';
const visible = node => node.nodeType===3 ? node.text : node.rawTagName==='br' ? ' ' : node.childNodes.map(visible).join('');
function sliceHtml(node,start,end){
 let position=0;
 const visit=n=>{
  if(n.nodeType===3){const text=n.text,a=Math.max(0,start-position),b=Math.min(text.length,end-position);position+=text.length;return b>a?escape(text.slice(a,b)):'';}
  if(n.rawTagName==='br'){const keep=position>=start&&position<end;position++;return keep?'<br />':'';}
  const inner=n.childNodes.map(visit).join('');if(!inner)return '';
  if(n===node)return inner;
  return `<${n.rawTagName}${n.rawAttrs?' '+n.rawAttrs:''}>${inner}</${n.rawTagName}>`;
 };return visit(node);
}
function bodyOf(p){const text=visible(p),label=text.match(/^\s*[КН]\s*\.\s*/u);if(!label)return null;return {text:text.slice(label[0].length),html:sliceHtml(p,label[0].length,text.length)};}
function capitalizeLike(html,original){
 const first=original.trim()[0];if(!first||first!==first.toLocaleUpperCase('be'))return html;
 let done=false;return html.split(/(<[^>]*>)/u).map(part=>{if(done||part.startsWith('<'))return part;return part.replace(/\p{L}/u,c=>{done=true;return c.toLocaleUpperCase('be');});}).join('');
}
const completeWordPrefix=(fragment,expected)=>{const a=tokens(fragment),b=tokens(expected);return a.length>0&&a.length<=b.length&&a.every((t,i)=>t===b[i]);};
function operation(target,expectedHtml,source,mode){
 const old=bodyOf(target);if(!old)return {error:'missing-reply-label'};
 const expected=liturgicalText(expectedHtml),a=tokens(old.text),b=tokens(expected);
 if(a.length===b.length&&a.every((t,i)=>t===b[i]))return {alreadyFull:true};
 if(!completeWordPrefix(old.text,expected))return {error:'reply-is-not-a-whole-word-prefix',original:old.text,expected,expectedHtml:capitalizeLike(expectedHtml,old.text)};
 const body=capitalizeLike(expectedHtml,old.text);
 if(JSON.stringify(tokens(liturgicalText(body)))!==JSON.stringify(b))throw Error('New words in response expansion');
 const replacement=`<p${target.rawAttrs?' '+target.rawAttrs:''}><span style="color: #ff0000;">Н.</span> ${body}</p>`;
 return {edit:{start:target.range[0],end:target.range[1],beforeHtml:source.slice(...target.range),afterHtml:replacement,
  originalReply:liturgicalText(target.innerHTML),expandedReply:'Н. '+liturgicalText(body),initialCaseAdjustment:liturgicalText(body)===expected?null:'Capitalized initial letter to match existing N. reply; words and source punctuation retained.',mode,sourceHtml:expectedHtml,sourceWords:b,
  beforeSha256:editorialHash(source.slice(...target.range)),afterSha256:editorialHash(replacement)}};
}
const contiguous=nodes=>nodes.every((p,i)=>!i||(nodes[i-1].parentNode===p.parentNode&&nodes[i-1].nextElementSibling===p));
const sameArray=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function expandEditorialResponsories(html,field,{allow=null}={}){
 const source=String(html||''),kind=/^officeOfReadingsR[12]$/u.test(field)?'long':/^(?:laudes|vesper1?)R$/u.test(field)?'short':null;
 if(!kind)return {kind,status:'already-full',value:source,edits:[],blocks:[],exceptions:[],repeatedReplies:0,alreadyFullReplies:0};
 const paragraphs=parse(source).querySelectorAll('p'),covered=new Set(),blocks=[],exceptions=[],edits=[],replyChecks=[];let repeatedReplies=0,alreadyFullReplies=0;
 const reject=(group,reason,details={})=>exceptions.push({kind,reason,lines:group.map(p=>liturgicalText(p.innerHTML)),paragraphIndices:group.map(p=>paragraphs.indexOf(p)),...details});
 for(let index=0;index<paragraphs.length;index++){
  if(covered.has(index))continue;
  const p=paragraphs[index];let group,opening,verse,targets,expected,signature;
  if(kind==='short'){
   if(role(p)!=='К')continue;
   group=paragraphs.slice(index,index+6);
   if(group.length!==6||!contiguous(group)||group.map(role).join('')!=='КНКНКН')continue;
   group.forEach(node=>covered.add(paragraphs.indexOf(node)));
   if(!/^Хвала Айцу(?:\b|[\s.,])/u.test(bodyOf(group[4])?.text||'')){reject(group,'fifth-reply-is-not-source-doxology');continue;}
   opening=bodyOf(group[0]);verse=liturgicalText(group[2].innerHTML);targets=[group[1],group[3],group[5]];
  }else{
   if(role(p)!=='Н')continue;
   group=[p];let next=p.nextElementSibling;
   // Some sources print the tail of N. in a separate paragraph after a final *.
   // It remains the same local response: no heading/rule/alternative may intervene.
   if(/\*\s*$/u.test(bodyOf(p)?.text||'')&&next?.rawTagName==='p'&&!role(next)
    &&!next.querySelector('[data-alternative-title]')&&!/^(?:Або|Пра |Рэспансорый|Першае|Другое|Каротк)/iu.test(liturgicalText(next.innerHTML))){group.push(next);next=next.nextElementSibling;}
   if(next?.rawTagName!=='p'||role(next)!=='К'||next.nextElementSibling?.rawTagName!=='p'||role(next.nextElementSibling)!=='Н')continue;
   group.push(next,next.nextElementSibling);if(!contiguous(group))continue;
   group.forEach(node=>covered.add(paragraphs.indexOf(node)));
   const first=bodyOf(p);opening={text:first.text,html:first.html};
   if(group.length===4){opening.text+=' '+visible(group[1]);opening.html+=' '+group[1].innerHTML;}
   verse=liturgicalText(group.at(-2).innerHTML);targets=[group.at(-1)];
  }
  repeatedReplies+=targets.length;
  const stars=[...opening.text.matchAll(/\*/gu)];
  if(stars.length!==1){reject(group,'source-must-have-one-repeat-star',{stars:stars.length});continue;}
  const plainRoot=parse('<p>'+opening.html+'</p>').querySelector('p'),plain=visible(plainRoot),star=plain.indexOf('*');
  const tailHtml=sliceHtml(plainRoot,star+1,plain.length).trim();
  if(!tokens(liturgicalText(tailHtml)).length){reject(group,'empty-marked-repeat');continue;}
  signature=editorialHash(JSON.stringify([kind,liturgicalText(opening.html),verse]));
  if(allow&&!allow.has(signature)){reject(group,'outside-reviewed-source-signatures',{signature});continue;}
  expected=kind==='short'?[opening.html,tailHtml,opening.html]:[tailHtml];
  const result=targets.map((node,i)=>operation(node,expected[i],source,kind==='short'?['full-initial','marked-tail','full-initial'][i]:'marked-tail'));
  const block={kind,signature,sourceReply:liturgicalText(opening.html),sourceHtml:opening.html,verse,lines:group.map(node=>liturgicalText(node.innerHTML)),
   sourceParagraphs:group.slice(0,kind==='long'?group.length-2:1).map(node=>paragraphs.indexOf(node)),targetParagraphs:targets.map(node=>paragraphs.indexOf(node)),doxologyPolicy:'preserve source K. unchanged; never copy it into N.'};
  blocks.push(block);
  result.forEach((r,i)=>replyChecks.push({signature,targetParagraph:paragraphs.indexOf(targets[i]),sourceParagraphs:block.sourceParagraphs,sourceHtml:expected[i],originalReply:liturgicalText(targets[i].innerHTML),status:r.error?'needs-editor':r.alreadyFull?'already-full':'copy-candidate',...(r.error?{reason:r.error}:{})}));
  alreadyFullReplies+=result.filter(r=>r.alreadyFull).length;
  if(result.some(r=>r.error)){reject(group,'prefix-or-role-mismatch',{signature,checks:result.flatMap((r,i)=>r.error?[{...r,targetParagraph:paragraphs.indexOf(targets[i])}]:[])});continue;}
  edits.push(...result.filter(r=>r.edit).map(r=>({...r.edit,signature,sourceParagraphs:block.sourceParagraphs,kind})));
 }
 const uncovered=paragraphs.map((p,index)=>({p,index})).filter(({p,index})=>role(p)&&!covered.has(index));
 if(uncovered.length)exceptions.push({kind,reason:'unrecognised-local-response-structure',paragraphIndices:uncovered.map(r=>r.index),lines:uncovered.map(r=>liturgicalText(r.p.innerHTML))});
 if(!blocks.length&&!exceptions.length)exceptions.push({kind,reason:'no-local-responsory-structure',lines:[]});
 if(exceptions.length)return {kind,status:'needs-editor',value:source,edits:[],proposedEdits:edits,replyChecks:replyChecks.map(r=>({...r,status:r.status==='copy-candidate'?'held-safe-candidate':r.status})),blocks,exceptions,repeatedReplies,alreadyFullReplies};
 const value=[...edits].sort((a,b)=>b.start-a.start).reduce((text,e)=>text.slice(0,e.start)+e.afterHtml+text.slice(e.end),source);
 // Nothing except the declared reply paragraphs may change.
 let expectedSource='',last=0;for(const e of [...edits].sort((a,b)=>a.start-b.start)){expectedSource+=source.slice(last,e.start)+e.afterHtml;last=e.end;}expectedSource+=source.slice(last);
 if(expectedSource!==value||!sameArray((source.match(/<hr\b|data-alternative-title=/gu)||[]),(value.match(/<hr\b|data-alternative-title=/gu)||[])))throw Error('Changes outside approved reply spans');
 return {kind,status:edits.length?'safe-auto':'already-full',value,edits,replyChecks:replyChecks.map(r=>({...r,status:r.status==='copy-candidate'?'auto-expanded':r.status})),blocks,exceptions:[],repeatedReplies,alreadyFullReplies};
}
