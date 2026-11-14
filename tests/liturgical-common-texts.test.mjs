import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { materializeCommonForSeason } from '../src/utils/ordo/commonSeasons.js';
import { normalizeForCompare } from '../scripts/liturgy/common-seasons/lib/volume.mjs';
import { parse } from 'node-html-parser';
import { removeMatchingPsalmAntiphons, normalizeReadingHtml, liturgicalText } from '../src/utils/liturgicalSourceHtml.js';
import { formatIntercessions, getLiturgicalAlternatives } from '../src/utils/liturgicalAlternatives.js';
import { formatPsalmHtml } from '../src/utils/liturgicalHtml.js';
import { getTomorrowFirstVespersOptions, eveningVespersModel } from '../src/utils/liturgicalVespers.js';
import { repairCommonDocument, sourceResponseEvidence, inspectField } from '../scripts/liturgy/lib/common-text-audit.mjs';
import { expandAttestedResponsories, RESPONSORY_ATTESTATIONS } from '../scripts/liturgy/lib/attested-responsories.mjs';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { auditDocument } from '../scripts/liturgy/lib/psalmody-doxology.mjs';
const common = name => JSON.parse(fs.readFileSync(`patchs/feasts/common-texts/${name}.json`));
const evidence = sourceResponseEvidence(process.cwd());

for (const label of ['Ант.', '1 ант.', '2 ант.', '3 ант.']) test(`antiphon equality across HTML spans and whitespace: ${label}`, () => {
  const ant = '<p><span>2 ант.</span> Калі хто будзе служыць Мне.</p>';
  const ending = `<p><span>${label}</span>&nbsp;Калі хто <span>будзе</span> служыць Мне.</p>`;
  const ps = '<p>Сапраўдны псальм * і поўнае заканчэнне.</p>';
  assert.equal(removeMatchingPsalmAntiphons(ps+ending, ant), ps);
  assert.match(removeMatchingPsalmAntiphons(ps+ending, '<p>Ант. Іншыя словы.</p>'), /Калі хто/u);
  assert.match(removeMatchingPsalmAntiphons(ps+ending, ''), /Калі хто/u);
  assert.match(formatPsalmHtml(ps+ending,{stripEmbeddedAntiphon:true}), /Калі хто/u);
  assert.match(removeMatchingPsalmAntiphons(ending+ps, ant), /Калі хто/u, 'opening/internal antiphon is retained');
});

test('psalm alternatives retain internally owned antiphons; exact duplicate branches can be cleaned', () => {
  const html='<div data-alternative-title="A"><p>Псальм А.</p><p>Ант. А.</p></div><div data-alternative-title="B"><p>Псальм Б.</p><p>Ант. Б.</p></div>';
  assert.equal(removeMatchingPsalmAntiphons(html,'<p>Ант. А.</p><hr><p>Ант. Б.</p>'),html);
  assert.match(removeMatchingPsalmAntiphons(html,'<p>Ант. А.</p>'),/Ант. Б/u);
  const dead=common('office-for-dead');
  assert.equal(getLiturgicalAlternatives(dead.laudesPs3,'psalm').length,2);
  assert.equal(auditDocument(dead).filter(i=>i.field==='laudesPs3')[0].audit.alternativeCount,2);
});

test('one antiphon on three psalms: no invented antiphon fields', () => {
  const d={sext1Ant1:'<p>Ант. А.</p>',...Object.fromEntries([1,2,3].map(n=>[`sext1Ps${n}`,'<p>Псальм.</p><p>Ант. А.</p>']))};
  const {after}=repairCommonDocument(d,evidence);
  for(const n of [1,2,3])assert.equal(after[`sext1Ps${n}`],'<p>Псальм.</p>');
  assert.equal(after.sext1Ant2,undefined);
});

test('short reading headings and replies: preserve words, references, alternatives and abbreviations', () => {
  const html='<p><span>Кароткае чытанне</span><span>2 Кар 1, 3-5</span></p><p>Тэкст.</p><p>Кароткі <span>рэспансорый</span></p><p><span>К.</span> Моц мая * і мая хвала – Пан. <span>Н.</span> Моц мая. <span>К.</span> Хвала Айцу. <span>Н</span> Моц мая.</p>';
  const normalized=normalizeReadingHtml(html),root=parse(normalized);
  assert.equal(root.querySelector('p').text,'КАРОТКАЕ ЧЫТАННЕ 2 Кар 1, 3-5');
  assert.equal(root.querySelectorAll('p').length,7);
  assert.match(normalized,/Н\.<\/span> Моц мая\./u);
  assert.doesNotMatch(normalized,/і Сыну/u,'unverified expansion prohibited');
  assert.equal(normalizeReadingHtml(normalized),normalized);
  assert.equal(normalizeReadingHtml('<p>К. Пане.</p><p>Н. Выслухай нас.</p>'),'<p>К. Пане.</p><p>Н. Выслухай нас.</p>','daytime keeps two replies');
  const martyr=common('martyr-one');
  assert.equal(getLiturgicalAlternatives(martyr.vesper1R,'reading').length,2);
  const review=inspectField({field:'vesper1R',value:martyr.vesper1R,container:martyr},evidence);
  assert.ok(review.some(f=>f.type==='abbreviated-responsory'&&f.status==='manual-review'));
});

test('repeated acclamation never changes the role of the next petition', () => {
  const html=formatIntercessions(common('martyr-one').vesperInter),root=parse(html);
  assert.equal(root.querySelectorAll('.intercessions__petition').length,5);
  assert.equal(root.querySelectorAll('.intercessions__refrain--repeat').length,5);
  assert.equal(root.querySelectorAll('.intercessions__response').length,0);
  assert.equal(root.querySelectorAll('.intercessions__marker').length,0);
});

test('responses require structural evidence; ambiguous paragraphs remain petitions', () => {
  const html='<p>Молімся:</p><p><em>Пане, пачуй.</em></p><p>Першы зварот.</p><p>Другі зварот.</p><p>– Адказ.</p><p data-intercession-role="response">Правераны адказ.</p><p>Ойча наш.</p>';
  const root=parse(formatIntercessions(html));
  assert.equal(root.querySelectorAll('.intercessions__petition').length,2);
  assert.equal(root.querySelectorAll('.intercessions__response').length,2);
  assert.equal(root.querySelectorAll('.intercessions__marker').length,1);
  assert.equal(root.querySelectorAll('.intercessions__conclusion').length,1);
});

test('source dashes have exact printed evidence, idempotency and no content reconstruction', () => {
  for(const name of ['martyr-one','pastors']) {
    const d=common(name);
    assert.match(liturgicalText(d.laudesInter).split(' ').join(' '),/– (?:дай нам перамагчы|дапамагай нам праз)/u);
    assert.deepEqual(repairCommonDocument(d,evidence).after,d);
  }
  const d={laudesInter:'<p>Просім:</p><p>Рэфрэн.</p><p>Пане,</p><p>нявядомыя словы.</p>'};
  assert.deepEqual(repairCommonDocument(d,evidence).after,d);
});

test('all Commons, sparse inherited fields, main and seasonal sections are stable', () => {
  for(const file of fs.readdirSync('patchs/feasts/common-texts').filter(n=>n.endsWith('.json')&&n!=='manifest.json')) {
    const d=JSON.parse(fs.readFileSync(`patchs/feasts/common-texts/${file}`));
    assert.deepEqual(repairCommonDocument(d,evidence).after,d,file);
    for(const row of auditDocument(d))for(const alt of row.audit.alternatives)assert.ok(!['missing','incomplete'].includes(alt.status),`${file} ${row.field}`);
  }
});

for(const [diocese,rank,first]of [['vitebsk','solemnitas',true],['minsk-mohilev','festum',false],['pinsk','festum',false],['grodno','memoria',false]])test(`Josaphat 11–12 November 2026: ${diocese}`, () => {
  const tomorrow=resolveRuntimeDay('2026-11-12',{diocese});
  assert.equal(tomorrow.primary.rank,rank);
  assert.equal(tomorrow.officeResolution.firstVespers.byRight,first);
  const today=resolveRuntimeDay('2026-11-11',{diocese});
  assert.equal(today.officeResolution.evening.vespers.type==='first',first);
});

test('one card for two Commons, preserved diocesan scope and both old direct URLs', () => {
  const source=id=>({id,_rank:'solemnitas',_place:'vitebsk',vesper1R:'<p>Чытанне.</p>'});
  const content={dayOptions:[{ordo:{celebrationId:'sv-josaphat',firstVespersByRight:true},templates:[{day:source('josaphat--martyr-one')},{day:source('josaphat--pastors')}]}]};
  const options=getTomorrowFirstVespersOptions(content);
  assert.equal(options.length,1);assert.deepEqual(options[0].places,['vitebsk']);
  for(const requestedDayId of ['josaphat--martyr-one','josaphat--pastors'])assert.ok(eveningVespersModel({},content,{requestedDayId}).firstVespers);
  content.dayOptions.push({ordo:{celebrationId:'sv-josaphat',firstVespersByRight:false},day:{...source('minsk-old'),_rank:'festum',_place:['minsk-mohilev','pinsk']}});
  assert.equal(getTomorrowFirstVespersOptions(content).length,1);
  assert.equal(eveningVespersModel({},content,{requestedDayId:'minsk-old'}).firstVespers,null);
  assert.equal(eveningVespersModel({_ordo:{vespers:{type:'of-the-day'}}},content,{requestedDayId:'josaphat--pastors'}).firstVespers,null);
});


test('only independently attested complete short responses are restored', () => {
  const martyr=common('martyr-one'),pastors=common('pastors');
  for(const [id,html]of [['martyr-laudes',martyr.laudesR],['martyr-vespers',martyr.vesperR],['pastors-laudes',pastors.laudesR]]) {
    const lines=parse(html).querySelectorAll('p').map(p=>liturgicalText(p.innerHTML)).filter(t=>/^[КН]\. /u.test(t));
    assert.deepEqual(lines,RESPONSORY_ATTESTATIONS.find(r=>r.lines[0]===lines[0]).lines,id);
    assert.equal(expandAttestedResponsories(html).value,html,'second run is a no-op');
  }
  const proof=RESPONSORY_ATTESTATIONS[0];
  const short=['К. Моц мая * і мая хвала – Пан.','Н. Моц мая.','К. Ён маё збаўленне.','Н. І мая.','К. Хвала Айцу.','Н. Моц мая.'].map(t=>'<p>'+t+'</p>').join('');
  assert.deepEqual(parse(expandAttestedResponsories(short).value).querySelectorAll('p').map(p=>p.text),proof.lines);
  for(const unknown of [short.replace('Ён маё збаўленне.','Непацверджаны верш.'),short.replace('Моц мая *','Моц мая, аллелюя *'),short.replace('Н. І мая.','Н. Іншы адказ.')])assert.equal(expandAttestedResponsories(unknown).value,unknown);
});


test('all 5110 Common fields retain the reviewed baseline words in every period', () => {
  const proof=JSON.parse(zlib.gunzipSync(fs.readFileSync('docs/audits/liturgical-common-texts-2026-11/source-integrity.json.gz')));
  assert.equal(proof.failures,0);assert.equal(proof.rows.length,5110);
  const materialized=new Map();
  for(const row of proof.rows){
    const key=row.file+':'+row.period;
    if(!materialized.has(key))materialized.set(key,materializeCommonForSeason(common(row.file.replace(/\.json$/u,'')),{period:row.period}));
    const value=materialized.get(key)[row.field];
    const actual=createHash('sha256').update(normalizeForCompare(value||'')).digest('hex');
    assert.equal(actual,row.expectedSha256,`${row.file} ${row.period} ${row.field}`);
  }
});
