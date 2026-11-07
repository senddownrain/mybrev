import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { TARGET, SOURCE, FEAST, VESPER_FIELDS, planFridayVespers, applyFridayVespers, fridayCommit } from '../scripts/liturgy/lib/ordinary-friday-vespers.mjs';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { buildOrdoDayOptions } from '../src/utils/ordoDayOptions.js';
import { eveningVespersModel } from '../src/utils/liturgicalVespers.js';
import { daysFixture } from './helpers/ordo-days-fixture.mjs';

function documents() {
  return [
    { id: TARGET, updateTime: '2026-08-28T13:23:55.582574Z', data: {
      _periodType: 'ordinary', _periodWeekNumber: 30, _dayOfWeek: 6,
      laudesPr: 'keep morning', officeOfReadingsR1: 'keep reading', vesper1Hymn: '',
      ...Object.fromEntries(VESPER_FIELDS.map((field) => [field, `All Saints I:${field}`])),
    } },
    { id: SOURCE, updateTime: '2026-08-28T13:23:39.413489Z', data: {
      _periodType: 'ordinary', _periodWeekNumber: 2, _dayOfWeek: 6,
      ...Object.fromEntries(VESPER_FIELDS.map((field) => [field, `Friday II:${field}`])),
    } },
    { id: FEAST, updateTime: '2026-08-28T13:20:58.188776Z', data: {
      ...Object.fromEntries(VESPER_FIELDS.map((field) => [field.replace('vesper', 'vesper1'), `All Saints I:${field}`])),
    } },
  ];
}

test('plan replaces only the 11 proved fields and commit guards all three documents', () => {
  const docs = documents(), before = structuredClone(docs), plan = planFridayVespers(docs);
  assert.deepEqual(docs, before);
  assert.deepEqual(Object.keys(plan.fields), VESPER_FIELDS);
  assert.ok(plan.comparison.every((item) => item.equalsAllSaintsFirst && !item.equalsPsalter && !item.after.empty));
  const writes = fridayCommit(plan, 'demo-198').writes;
  assert.equal(writes.length, 3);
  assert.ok(writes.slice(0, 2).every((write) => write.verify && !write.update));
  assert.deepEqual(writes[2].updateMask.fieldPaths, VESPER_FIELDS);
  assert.deepEqual(Object.keys(writes[2].update.fields), VESPER_FIELDS);
  for (const [index, id] of [SOURCE, FEAST, TARGET].entries()) {
    assert.equal(writes[index].currentDocument.updateTime, plan.preconditions[id]);
  }
});

test('unknown contamination, missing text, missing version and wrong selectors abort', () => {
  for (const mutate of [
    (docs) => { docs[0].data.vesperAntMag = 'unreviewed edit'; },
    (docs) => { docs[1].data.vesperPr = ''; },
    (docs) => { docs[2].data.vesper1Ps3 = ''; },
    (docs) => { delete docs[0].updateTime; },
    (docs) => { docs[1].data._dayOfWeek = 5; },
  ]) { const docs = documents(); mutate(docs); assert.throws(() => planFridayVespers(docs)); }
});

test('snapshot timestamp preconditions retain nanosecond precision', () => {
  const docs = documents();
  docs[0].updateTime = { __firestoreType: 'timestamp', seconds: 0, nanoseconds: 123456789 };
  assert.equal(planFridayVespers(docs).preconditions[TARGET], '1970-01-01T00:00:00.123456789Z');
});

test('successful apply backs up before commit, verifies all fields and becomes a no-op', async () => {
  const docs = documents(), events = [], plan = planFridayVespers(docs);
  const result = await applyFridayVespers(plan, {
    read: async () => structuredClone(docs),
    backup: async (entries) => { events.push('backup'); assert.deepEqual(entries, docs); },
    commit: async (reviewed) => { events.push('commit'); Object.assign(docs[0].data, reviewed.fields); },
  });
  assert.deepEqual(events, ['backup', 'commit']);
  assert.equal(result.updated, true);
  assert.equal(docs[0].data.laudesPr, 'keep morning');
  assert.equal(docs[0].data.vesper1Hymn, '');
  const noop = await applyFridayVespers(planFridayVespers(docs), {
    read: async () => docs, backup: async () => assert.fail('no backup needed'), commit: async () => assert.fail('no write'),
  });
  assert.equal(noop.updated, false);
});

test('stale versions (including source and feast), modified plans and failed backups never write', async () => {
  for (const index of [0, 1, 2]) {
    const docs = documents(), plan = planFridayVespers(docs);
    docs[index].updateTime = '2026-11-07T00:00:00Z';
    await assert.rejects(applyFridayVespers(plan, { read: async () => docs,
      backup: async () => assert.fail('stale plan'), commit: async () => assert.fail('stale plan'),
    }), /stale/);
  }
  const docs = documents(), plan = planFridayVespers(docs);
  await assert.rejects(applyFridayVespers({ ...plan, fields: { laudesPr: 'bad' } }, {
    read: async () => docs, commit: async () => assert.fail('tampered plan'),
  }), /stale/);
  await assert.rejects(applyFridayVespers(plan, { read: async () => docs,
    backup: async () => { throw new Error('disk full'); }, commit: async () => assert.fail('backup failed'),
  }), /disk full/);
});

test('concurrent commit rejection propagates; unexpected post-write changes are detected', async () => {
  const docs = documents(), plan = planFridayVespers(docs);
  await assert.rejects(applyFridayVespers(plan, { read: async () => docs, backup: async () => {},
    commit: async () => { throw new Error('FAILED_PRECONDITION'); },
  }), /FAILED_PRECONDITION/);
  await assert.rejects(applyFridayVespers(plan, { read: async () => structuredClone(docs), backup: async () => {},
    commit: async () => { Object.assign(docs[0].data, plan.fields, { laudesPr: 'unexpected edit' }); },
  }), /Post-write/);
});

test('CLI refuses an unreviewed apply before credentials or network are accessed', () => {
  const result = spawnSync(process.execPath, ['scripts/liturgy/fix-ordinary-friday-vespers.mjs', '--apply'], {
    encoding: 'utf8', env: { ...process.env, FIREBASE_SERVICE_ACCOUNT_B64: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires --live and a reviewed --plan/);
});

// Real service-shaped dayOptions, including the corrupted field being present
// (not a fallback for a missing field). Actual production content is audited
// separately from an ignored, bounded snapshot; no private backup in Git.
function content(date, diocese, target) {
  const resolved = resolveRuntimeDay(date, { diocese });
  const { context, daysResult } = daysFixture(resolved);
  if (daysResult.periodDays[0]?.id === TARGET) {
    daysResult.periodDays[0] = { ...daysResult.periodDays[0], ...target, id: TARGET };
    daysResult.periodFallback = daysResult.periodDays[0];
  }
  return { resolved, ...buildOrdoDayOptions({ resolved, context, daysResult, date, diocese }) };
}

test('all dioceses: bad Fridays reproduce via content; planned repair preserves lawful I/II Vespers', () => {
  const docs = documents(), corrected = { ...docs[0].data, ...planFridayVespers(docs).fields };
  const cases = [
    ['2025-10-30', 'of-the-day', null], ['2025-10-31', 'first', 'all-saints'],
    ['2026-10-29', 'of-the-day', null], ['2026-10-30', 'of-the-day', null], ['2026-10-31', 'first', 'all-saints'],
    ['2027-10-29', 'of-the-day', null], ['2027-10-30', 'first', 'temporal:ordinary-w31-d1'],
    ['2027-10-31', 'first', 'all-saints'], ['2027-11-01', 'second', 'all-saints'],
    ['2028-10-27', 'of-the-day', null], ['2028-10-30', 'of-the-day', null], ['2028-10-31', 'first', 'all-saints'],
    ['2028-11-03', 'of-the-day', null], ['2026-01-23', 'of-the-day', null],
  ];
  for (const diocese of ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk']) {
    for (const [date, type, id] of cases) {
      const tomorrow = new Date(`${date}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const nextDate = tomorrow.toISOString().slice(0, 10);
      const models = [docs[0].data, corrected].map((target) => {
        const built = content(date, diocese, target), next = content(nextDate, diocese, target);
        const option = built.dayOptions[0], day = { ...option.day, _ordo: option.ordo };
        const vespers = built.resolved.officeResolution.evening.vespers;
        assert.equal(vespers.type, type, `${date} ${diocese}`);
        assert.equal(vespers.celebrationId, id, `${date} ${diocese}`);
        const model = eveningVespersModel(day, next, { isoWeekday: new Date(`${date}T12:00:00Z`).getUTCDay() || 7 });
        assert.equal(Boolean(model.firstVespers), type === 'first', `${date} ${diocese}`);
        assert.equal(model.second, type === 'second', `${date} ${diocese}`);
        return model.firstVespers?.day || day;
      });
      if (['2026-10-30', '2027-10-29', '2028-11-03'].includes(date)) {
        for (const field of VESPER_FIELDS) {
          assert.equal(models[0][field], docs[2].data[field.replace('vesper', 'vesper1')]);
          assert.equal(models[1][field], docs[1].data[field]);
        }
      } else assert.deepEqual(models[0], models[1], `${date} ${diocese}: unaffected evening`);
    }
  }
});
