import fs from 'node:fs';
import path from 'node:path';
import { reviewHash } from './manual-common-review.mjs';
const words=text=>(String(text).replace(/\u00ad/gu,'').toLocaleLowerCase('be').match(/[\p{L}\p{N}]+/gu)||[]).join(' ');
const antWords=text=>words(String(text).replace(/^(?:[123]\s*)?ант\.\s*(?:у\s+(?:Вялікі пост|Велікодны перыяд)\s*:\s*)?/iu,'')
 .replace(/\(\s*Велікодны\s+перыяд\s+Аллелюя\s*\)/giu,'').replace(/[,\s/]*аллелюя[.!]?\s*$/iu,''));
export function printedEvidence(root){
 const directory=path.join(root,'patchs/sources/common-seasons');
 const books=fs.readdirSync(directory).filter(f=>f.endsWith('.txt')).sort().flatMap(file=>{
  const bytes=fs.readFileSync(path.join(directory,file)),hash=reviewHash(bytes);
  return bytes.toString().split(/\r?\n/u).map((text,index)=>({file:'patchs/sources/common-seasons/'+file,line:index+1,text,sha256:hash,key:words(text),antKey:antWords(text)}));
 });
 return {
  antiphon(text){const key=antWords(text);return books.filter(line=>line.antKey===key).map(({key:_key,antKey:_antKey,...line})=>({...line,match:'ordered words equal; cadence/case/punctuation/Easter annotation separated from content'}));},
  reply(text){const key=words(text.replace(/^[КН]\.\s*/u,''));return books.filter(line=>(' '+line.key+' ').includes(' '+key+' ')).map(({key:_key,antKey:_antKey,...line})=>({...line,match:'exact ordered words contained in the transcribed line; not an independent image/full-reply attestation'}));},
 };
}
