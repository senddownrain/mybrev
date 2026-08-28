import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITOR_SOURCE_KIND,
  getDayEditorFieldSource,
  getDayEditorFieldValue,
} from '../src/utils/liturgicalEditorSources.js';
import {
  ALL_DIRECT_DAY_EDITOR_FIELDS,
  COMPLETORIUM_EDITOR_FIELDS,
  INVITATORIUM_EDITOR_FIELDS,
} from '../src/constants/liturgicalEditor.js';

test('marks explicit and implicit date inheritance as assembled content', () => {
  assert.equal(
    getDayEditorFieldSource({ laudesHymn: 'from-day' }, 'laudesHymn').kind,
    EDITOR_SOURCE_KIND.INHERITED,
  );
  assert.equal(
    getDayEditorFieldSource({ _date: '28.08', laudesHymn: '' }, 'laudesHymn').kind,
    EDITOR_SOURCE_KIND.INHERITED,
  );
  assert.equal(
    getDayEditorFieldValue(
      { _date: '28.08', laudesHymn: '' },
      { laudesHymn: '<p>Агульны гімн</p>' },
      'laudesHymn',
    ),
    '<p>Агульны гімн</p>',
  );
});

test('explains daytime fallback without duplicating the shared text', () => {
  const day = { sext1Ps1: '<p>Агульны псальм</p>', sext2Ps1: '' };
  assert.equal(
    getDayEditorFieldSource(day, 'sext2Ps1').kind,
    EDITOR_SOURCE_KIND.SHARED_DAYTIME,
  );
  assert.equal(getDayEditorFieldValue(day, day, 'sext2Ps1'), day.sext1Ps1);
});

test('editor layout keeps separate shared sources out of days fields', () => {
  assert.ok(ALL_DIRECT_DAY_EDITOR_FIELDS.includes('vesper1AntMag'));
  assert.ok(!ALL_DIRECT_DAY_EDITOR_FIELDS.includes('compHymn'));
  assert.ok(!ALL_DIRECT_DAY_EDITOR_FIELDS.includes('invitatoriumPs1'));
  assert.equal(COMPLETORIUM_EDITOR_FIELDS.at(-1).key, 'compAntM');
  assert.equal(INVITATORIUM_EDITOR_FIELDS.length, 6);
});
