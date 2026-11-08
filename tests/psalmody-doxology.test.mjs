import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'node-html-parser';
import { DOXOLOGY_HTML, auditDocument, inspectPsalm, repairPsalm, sha256 } from '../scripts/liturgy/lib/psalmody-doxology.mjs';
import { repairDocument, verifyPlannedDocument, buildFirestoreWrite } from '../scripts/liturgy/audit-doxologies.mjs';
import { getLiturgicalAlternatives } from '../src/utils/liturgicalAlternatives.js';
import { formatPsalmHtml } from '../src/utils/liturgicalHtml.js';
const load = (dir,id) => JSON.parse(fs.readFileSync(`patchs/${dir}/${id}.json`,'utf8'));
const text = '<p>Псальм 117 (116)</p><p>Хваліце Пана, усе народы, *<br />праслаўляйце Яго, усе плямёны.</p>';
const check = (html, field='laudesPs1') => {
  const result = inspectPsalm(html,{field});
  assert.ok(result.alternatives.length,field);
  for(const alt of result.alternatives) assert.ok(['complete','exception-daniel-3-57-88-56'].includes(alt.status),JSON.stringify(alt));
  assert.equal(repairPsalm(html,{field}).changed,false,'repeat is a no-op');
  return result;
};

test('insert before repeated antiphon, preserve every existing byte and attribute',()=>{
  const ant='<p data-custom="kept"><span style="color: #ff0000;">Ант.</span> Хваліце Пана.</p>';
  const before=text+'\n'+ant;
  const result=repairPsalm(before,{field:'laudesPs1'});
  assert.equal(result.value.replace('\n'+DOXOLOGY_HTML+'\n',''),before);
  assert.ok(result.value.indexOf('Хвала Айцу')<result.value.indexOf('Ант.'));
  check(result.value);
  const display=formatPsalmHtml(result.value,{stripEmbeddedAntiphon:true});
  assert.match(display,/Хвала Айцу і Сыну/u);
  assert.doesNotMatch(display,/Ант\./u);
});

test('every structured or hr alternative owns its ending; attributes and antiphons survive',()=>{
  for(const before of [text+'<hr />'+text.replace('усе народы','усе плямёны'),`<div data-alternative-title="Першы"><div class="ora-ant">Ант. А</div><div class="ora-psalm" data-keep="yes">${text}</div><div class="ora-ant">Ант. А</div></div><div data-alternative-title="Другі">${text.replace('усе народы','усе плямёны')}${DOXOLOGY_HTML}</div>`]){
    const count=getLiturgicalAlternatives(before,'psalm').length;
    const result=repairPsalm(before,{field:'laudesPs3'});
    assert.equal(getLiturgicalAlternatives(result.value,'psalm').length,count);
    check(result.value,'laudesPs3');
    for(const option of getLiturgicalAlternatives(result.value,'psalm')) assert.match(option.html,/Хвала Айцу і Сыну/u);
    if(before.includes('data-keep')) assert.match(result.value,/class="ora-psalm" data-keep="yes"/u);
  }
});

test('short rubric and each isolated incomplete stanza expand once',()=>{
  for(const suffix of ['<p>Хвала Айцу.<br />Верш Хвала Айцу чытаецца ў канцы ўсіх псальмаў і песняў.</p>', '<p>Як была спрадвеку, цяпер і заўсёды, *<br />і на векі вечныя. Амэн.</p>', '<p>Хвала Айцу і Сыну, *<br />і Духу Святому.</p>']){
    const result=repairPsalm(text+suffix,{field:'officeOfReadingsPs1'});
    assert.equal(result.audit.alternatives[0].status,'incomplete');
    check(result.value,'officeOfReadingsPs1');
    assert.equal((result.value.match(/Хвала Айцу і Сыну/gu)||[]).length,1);
  }
  const before=text.replace('</p>','</p>')+'<p>Завяршэнне псальма.<br />Хвала Айцу.<br />Верш Хвала Айцу чытаецца ў канцы ўсіх псальмаў і песняў.</p><p>Ант. Вечны супакой.</p>';
  const result=repairPsalm(before,{field:'officeOfReadingsPs1'});
  check(result.value,'officeOfReadingsPs1');
  assert.equal(parse(result.value).querySelectorAll('p p').length,0);
  assert.match(result.value,/Завяршэнне псальма\./u);
});

test('already complete Alleluia canticle and ordinary psalm remain byte-identical',()=>{
  const sunday=load('db-templates','sunday-week-1');
  for(const field of ['laudesPs1','vesperPs3']) check(sunday[field],field);
  assert.equal(repairPsalm(text+DOXOLOGY_HTML,{field:'laudesPs1'}).value,text+DOXOLOGY_HTML);
});

test('Daniel 3:57–88.56 is untouched; Daniel 3:52–57 still needs its ending',()=>{
  const sunday=load('db-templates','sunday-week-1');
  const r=check(sunday.laudesPs2,'laudesPs2');
  assert.equal(r.alternatives[0].status,'exception-daniel-3-57-88-56');
  assert.doesNotMatch(sunday.laudesPs2,/Хвала Айцу і Сыну/u);
  const other='<p>Песня Дан 3, 52-57</p>'+text.replace('<p>Псальм 117 (116)</p>','');
  assert.equal(repairPsalm(other,{field:'laudesPs2'}).changed,true);
});

test('references, including array references and sparse rules, are never expanded',()=>{
  for(const value of ['from-first-week','from-day',['з нядзелі І тыдня']]) assert.equal(repairPsalm(value,{field:'laudesPs2'}).changed,false);
  assert.equal(auditDocument({_fieldRules:{laudesPs2:{source:'sunday-week-1'}}})[0].audit.classification,'SOURCE_RULE');
});

test('Office for the Dead: all hours, both alternatives, nine daytime psalms',()=>{
  const dead=load('db-templates','office-for-dead');
  for(const item of auditDocument(dead)) if(item.audit.classification==='REAL_TEXT') check(item.value,item.field);
  assert.equal(check(dead.laudesPs3,'laudesPs3').alternativeCount,2);
  assert.equal(auditDocument(dead).filter(x=>/^sext/.test(x.field)).length,9);
});

test('canonical Commons and Propers including seasonal and I Vespers fields have no gaps',()=>{
  for(const dir of ['db-templates','db-feasts']) for(const filename of fs.readdirSync('patchs/'+dir).filter(f=>f.endsWith('.json'))){
    const doc=load(dir,filename.replace('.json',''));
    for(const item of auditDocument(doc)) if(item.audit.classification==='REAL_TEXT') check(item.value,item.field);
  }
  for(const id of ['martyr-one','pastors']) for(const n of [1,2,3]) check(load('db-templates',id)[`officeOfReadingsPs${n}`],`officeOfReadingsPs${n}`);
  for(const field of ['vesper1Ps1','vesper1Ps2','vesper1Ps3','vesperPs1','vesperPs2','vesperPs3']) check(load('db-feasts','01-11-all-saints')[field],field);
});

test('generator keeps the canonical common psalmody identical to source',()=>{
  for(const filename of fs.readdirSync('patchs/feasts/common-texts').filter(f=>f.endsWith('.json')&&f!=='manifest.json')){
    const id=filename.replace('.json',''), source=load('feasts/common-texts',id), generated=load('db-templates',id);
    for(const item of auditDocument(source))if(item.audit.classification==='REAL_TEXT')assert.equal(item.path.reduce((o,k)=>o[k],generated),item.value,`${id}.${item.path.join('.')}`);
  }
});

test('dry-run patch verifies updateTime and SHA-256, changes only psalmody and is idempotent',()=>{
  const doc={laudesPs1:text,laudesHymn:'Гімн',laudesR:'Чытанне',laudesPr:'Малітва'};
  const {after,changes}=repairDocument(doc), time={seconds:1,nanoseconds:2};
  const plan={document:'days/test',updateTime:time,fields:changes};
  const write=buildFirestoreWrite(doc,plan);
  assert.deepEqual(write.updateMask.fieldPaths,['laudesPs1']);
  assert.equal(write.currentDocument.updateTime,'1970-01-01T00:00:01.000000002Z');
  assert.deepEqual(Object.keys(write.update.fields),['laudesPs1']);
  assert.deepEqual(verifyPlannedDocument(doc,plan,time),after);
  assert.throws(()=>verifyPlannedDocument(doc,plan,{seconds:2,nanoseconds:2}),/updateTime/);
  assert.throws(()=>verifyPlannedDocument({...doc,laudesPs1:text+' '},plan,time),/Concurrent field/);
  assert.equal(changes[0].beforeSha256,sha256(text));
  assert.equal(repairDocument(after).changes.length,0);
  for(const field of ['laudesHymn','laudesR','laudesPr'])assert.equal(after[field],doc[field]);
});

test('canonical plan accepts paragraph whitespace only and refuses other drift',()=>{
  const doc={laudesPs1:text};
  const canonical={laudesPs1:repairDocument(doc).after.laudesPs1.replace('\n<p>Хвала','\n\n<p>Хвала')};
  const result=repairDocument(doc,canonical);
  assert.equal(result.after.laudesPs1,canonical.laudesPs1);
  assert.throws(()=>repairDocument(doc,{laudesPs1:canonical.laudesPs1.replace('Хваліце','Змена')}),/Unexpected canonical drift/);
});

test('audit rejects a doxology before Scripture or after a repeated antiphon', () => {
  for (const html of [DOXOLOGY_HTML + text, text + '<p>Ант. Паўтор.</p>' + DOXOLOGY_HTML]) {
    assert.equal(inspectPsalm(html, {field:'laudesPs1'}).alternatives[0].status, 'REVIEW_DOXOLOGY_POSITION');
    assert.equal(repairPsalm(html, {field:'laudesPs1'}).changed, false);
  }
});

test('structured alternatives without ora-psalm keep the ending inside their own wrapper', () => {
  const html = `<section data-alternative-title="Першы">${text}</section><div data-alternative-title="Другі">${text.replace('усе народы', 'усе плямёны')}</div>`;
  const repaired = repairPsalm(html, {field:'laudesPs3'}).value;
  const blocks = parse(repaired).querySelectorAll('[data-alternative-title]');
  for (const block of blocks) check(block.innerHTML, 'laudesPs3');
  assert.equal((repaired.match(/Хвала Айцу і Сыну/gu) || []).length, 2);
});

test('shared alternative suffixes are held for review without adding duplicate endings', () => {
  const html = `<div data-alternative-title="Першы">${text}</div><div data-alternative-title="Другі">${text.replace('усе народы', 'усе плямёны')}</div><div data-alternative-suffix>${DOXOLOGY_HTML}</div>`;
  const result = repairPsalm(html, {field:'laudesPs3'});
  assert.equal(result.changed, false);
  assert.ok(result.audit.alternatives.every(a => a.status === 'REVIEW_SHARED_DOXOLOGY'));
});

test('a canticle may repeat its choral response after the doxology', () => {
  const chorus = '<p>Н. Хваліце Пана, усе народы.</p>';
  check(text + chorus + DOXOLOGY_HTML + chorus);
});
