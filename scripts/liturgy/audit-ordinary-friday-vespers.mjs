#!/usr/bin/env node
/** Offline issue #198 replay using actual dayOptions; never opens Firestore. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { contentFor, openLiturgySource, snapshotDirectory } from './lib/snapshot-content.mjs';
import { TARGET, SOURCE, FEAST, VESPER_FIELDS, fingerprint, planFridayVespers } from './lib/ordinary-friday-vespers.mjs';
import { eveningVespersModel } from '../../src/utils/liturgicalVespers.js';

const directory = snapshotDirectory();
const snapshot = await openFirestoreSnapshot(directory);
const entries = await snapshot.collectionEntries('days');
const plan = planFridayVespers(entries.filter((entry) => [TARGET, SOURCE, FEAST].includes(entry.id)));
const before = await openLiturgySource({ snapshotDir: directory, propers: 'snapshot', templates: 'snapshot' });
const days = before.days.map((day) => day.id === TARGET ? { ...day, ...plan.fields } : day);
const after = { ...before, days, daysById: new Map(days.map((day) => [day.id, day])) };
const rows = [];
for (const diocese of ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk']) {
  for (const [date, type, celebrationId] of [
    ['2025-10-30', 'of-the-day', null], ['2025-10-31', 'first', 'all-saints'],
    ['2026-10-29', 'of-the-day', null], ['2026-10-30', 'of-the-day', null], ['2026-10-31', 'first', 'all-saints'],
    ['2027-10-29', 'of-the-day', null], ['2027-10-30', 'first', 'temporal:ordinary-w31-d1'],
    ['2027-10-31', 'first', 'all-saints'], ['2027-11-01', 'second', 'all-saints'],
  ]) {
    const tomorrow = new Date(`${date}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const results = [before, after].map((source) => {
      const built = contentFor(source, date, { diocese });
      const next = contentFor(source, tomorrow.toISOString().slice(0, 10), { diocese });
      const option = built.dayOptions[0];
      assert.ok(option?.day, `${date} ${diocese}: missing primary day`);
      const day = { ...option.day, _ordo: option.ordo };
      const descriptor = built.resolved.officeResolution.evening.vespers;
      assert.equal(descriptor.type, type);
      assert.equal(descriptor.celebrationId, celebrationId);
      const model = eveningVespersModel(day, next, { isoWeekday: new Date(`${date}T12:00:00Z`).getUTCDay() || 7 });
      assert.equal(Boolean(model.firstVespers), type === 'first');
      assert.equal(model.second, type === 'second');
      if (type === 'first' && celebrationId === 'all-saints') {
        const proper = source.properDocs.find((doc) => doc._celebrationId === 'all-saints');
        assert.ok(proper, 'Include the deployed All Saints Proper in the snapshot.');
        for (const field of VESPER_FIELDS) {
          assert.equal(model.firstVespers.day[field], proper[field.replace('vesper', 'vesper1')]);
        }
      }
      return { day: model.firstVespers?.day || day, descriptor, properSource: option.ordo.properSource || null };
    });
    const hashes = results.map(({ day }) => Object.fromEntries(VESPER_FIELDS.map((field) => {
      assert.ok(day[field]?.trim(), `${date}: missing ${field}`);
      return [field, fingerprint(day[field]).sha256];
    })));
    const changedFields = VESPER_FIELDS.filter((field) => hashes[0][field] !== hashes[1][field]);
    if (['2026-10-30', '2027-10-29'].includes(date)) {
      assert.deepEqual(changedFields, VESPER_FIELDS);
      for (const field of VESPER_FIELDS) {
        assert.equal(results[0].day[field], before.daysById.get(FEAST)[field.replace('vesper', 'vesper1')]);
        assert.equal(results[1].day[field], before.daysById.get(SOURCE)[field]);
      }
    } else assert.deepEqual(changedFields, []);
    rows.push({ date, diocese, descriptor: results[0].descriptor, dayId: results[1].day.id,
      properSource: results[1].properSource, changedFields });
  }
}
const outIndex = process.argv.indexOf('--out');
const out = outIndex > 0 ? process.argv[outIndex + 1] : 'reports/liturgy/issue-198-runtime.json';
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify({ mode: 'offline-replay', cases: rows.length, rows }, null, 2) + '\n');
console.log(JSON.stringify({ cases: rows.length, failures: 0, writes: 0, report: out }));
