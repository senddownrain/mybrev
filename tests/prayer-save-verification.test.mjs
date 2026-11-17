import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPrayerSaveConfirmed } from '../src/utils/prayerSaveVerification.mjs';
import { sourceForEditor, normalizePrayerSource } from '../src/utils/prayerSource.mjs';
import { draftSourceNotice, buildPrayerFromDraft } from '../src/utils/prayerDraftModel.mjs';

test('Web editor retains manual source input instead of silently canonicalizing it', () => {
  const value = 'Рымскі Імшал, стар. 42–43';
  assert.equal(normalizePrayerSource(value), 'Рымскі Імшал');
  assert.equal(sourceForEditor(value), value);
  assert.equal(draftSourceNotice({source:value}),value);
  const published = buildPrayerFromDraft({
    draftId:'m', title:'Малітва', text:'Малітва.', textFormat:'mybrev-markdown',
    status:'draft', tags:['Малітвы'], source:value,
  }, {editorSource:true});
  assert.equal(published.source,value);
  assert.equal(published.sourceManual,true);
});

test('success is allowed only for the exact server-confirmed editable fields', () => {
  const expected = {title:'Малітва',text:'Новы тэкст.',textFormat:'mybrev-markdown',
    source:'Рымскі Імшал, стар. 42–43',tags:['Малітвы'],verified:true,
    priestOnly:false,sourceManual:true};
  assert.equal(assertPrayerSaveConfirmed({...expected,id:'one',updatedAt:12},expected).id,'one');
  assert.throws(()=>assertPrayerSaveConfirmed(null,expected),/не пацвердзіў/u);
  for(const field of Object.keys(expected)){
    const altered = {...expected,[field]:field==='tags'?['Other']:field==='priestOnly'||field==='verified'||field==='sourceManual'?!expected[field]:'Старое'};
    assert.throws(()=>assertPrayerSaveConfirmed(altered,expected), new RegExp(field,'u'),field);
  }
  // Legacy server-only properties do not trigger a false mismatch.
  assert.equal(assertPrayerSaveConfirmed({...expected,sourceBook:'Старая кніга'},expected).source,expected.source);
});
