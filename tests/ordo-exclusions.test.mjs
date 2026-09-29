import test from 'node:test';
import assert from 'node:assert/strict';
import { DIOCESES, loadOrdoData } from '../scripts/ordo/check.mjs';
import { exclusionCategory, findExcludedStrings } from '../scripts/ordo/lib/exclusions.mjs';

const data = loadOrdoData();

test('recognises every excluded category', () => {
  assert.equal(exclusionCategory('Сённяшнія зборы ахвяраванняў прызначаюцца на патрэбы семінарыі'), 'collection');
  assert.equal(exclusionCategory('Збор ахвяраванняў на патрэбы місій.'), 'collection');
  assert.equal(exclusionCategory('Дзень нараджэння святароў: кс. Іван Іваноў (1970)'), 'clergy-birthday');
  assert.equal(exclusionCategory('Імяніны святароў: кс. Андрэй'), 'name-day');
  assert.equal(exclusionCategory('Дзень імянінаў Біскупа'), 'name-day');
  assert.equal(exclusionCategory('Гадавіна прэзбітэрскага пасвячэння: кс. Пётр (2001)'), 'ordination-anniversary');
  assert.equal(exclusionCategory('Гадавіна біскупскай сакры'), 'ordination-anniversary');
  assert.equal(exclusionCategory('Гадавіна смерці святароў: кс. Ян (2014)'), 'death-anniversary');
  assert.equal(exclusionCategory('† Кс. Ян Рэсь SVD (Рыбнік, 2012).'), 'necrology');
  assert.equal(exclusionCategory('1969 + Кс. Баляслаў, проб. Жупраны.'), 'necrology');
});

test('keeps liturgical content that only looks similar', () => {
  assert.equal(exclusionCategory('Свята Ахвяравання Пана'), null);
  assert.equal(exclusionCategory('Гадавіна пасвячэння катэдральнага касцёла'), null);
  assert.equal(exclusionCategory('Імша агульная, калекта ўласная, прэфацыя пра святых'), null);
  assert.equal(exclusionCategory('Урачыстасць Нараджэння Пана'), null);
  assert.equal(exclusionCategory('Молімся за духавенства.'), null);
});

test('no collection or clergy-personal data leaks into committed Ordo files', () => {
  assert.deepEqual(findExcludedStrings(data), []);
});

test('the adapters actually met and excluded such content', () => {
  const excluded = Object.fromEntries(DIOCESES.map((d) => [d, data.evidence[d].stats.excluded]));
  DIOCESES.forEach((d) => assert.ok(excluded[d].collection > 0, `${d}: collections`));
  assert.ok(excluded['minsk-mohilev']['clergy-birthday'] > 50);
  assert.ok(excluded['minsk-mohilev']['name-day'] > 20);
  assert.ok(excluded['minsk-mohilev']['ordination-anniversary'] > 20);
  assert.ok(excluded['minsk-mohilev']['death-anniversary'] > 10);
  assert.ok(excluded.vitebsk.necrology > 50);
  assert.ok(excluded.pinsk.necrology > 100);
  assert.ok(excluded.grodno.necrology > 100);
});

test('excluded records keep only a location, never the personal text', () => {
  DIOCESES.forEach((d) => data.evidence[d].excluded.forEach((item) => {
    assert.equal(item.rawText, undefined);
    assert.ok(item.page || item.paragraph !== undefined, `${d}: excluded item without location`);
  }));
});
