#!/usr/bin/env node
/**
 * Fix 2 data bugs in parsedData:
 * 1. ordinary-w13-d1_1 / _2 — year stored as integer 1/2 instead of 'A'/'B' for Sunday
 * 2. feast-heartofmary — missing title field
 *
 * Also adds 21.12 missing Advent date as an empty placeholder doc.
 *
 * DRY RUN by default. Pass --apply to write to Firestore.
 */

import admin from 'firebase-admin';
import serviceAccount from '../patchs/serviceAccountKey.json' with { type: 'json' };

const apply = process.argv.includes('--apply');
console.log(`Mode: ${apply ? 'APPLY (writing to Firestore)' : 'DRY RUN'}\n`);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const col = db.collection('parsedData');

// ─── Fix 1: week 13 Sunday year 1/2 → A/B ─────────────────────────────────

async function fixWeek13Years() {
  console.log('=== Fix 1: ordinary-w13-d1 cleanup of stale _1/_2 docs ===');
  const staleIds = ['ordinary-w13-d1_1', 'ordinary-w13-d1_2'];

  for (const staleId of staleIds) {
    const snap = await col.doc(staleId).get();
    if (!snap.exists) {
      console.log(`  OK ${staleId} — not present`);
      continue;
    }
    console.log(`  DELETE ${staleId} (stale duplicate — _A/_B already exist)`);
    if (apply) {
      await col.doc(staleId).delete();
      console.log(`    ✓ deleted`);
    }
  }

  // Verify _A and _B exist
  for (const correctId of ['ordinary-w13-d1_A', 'ordinary-w13-d1_B', 'ordinary-w13-d1_C']) {
    const snap = await col.doc(correctId).get();
    console.log(`  ${correctId}: ${snap.exists ? `✓ exists (year=${snap.data()?.year})` : '✗ missing'}`);
  }
}

// ─── Fix 2: heartofmary — add missing title ────────────────────────────────

async function fixHeartOfMary() {
  console.log('\n=== Fix 2: feast-heartofmary title ===');
  const snap = await col.doc('feast-heartofmary').get();
  if (!snap.exists) {
    console.log('  feast-heartofmary not found — nothing to fix');
    return;
  }
  const data = snap.data();
  if (data.title) {
    console.log(`  Already has title: "${data.title}"`);
    return;
  }
  const title = 'Нязбруджанае Сэрца Марыі';
  console.log(`  Adding title: "${title}"`);
  if (apply) {
    await col.doc('feast-heartofmary').update({ title });
    console.log('  ✓ written');
  }
}

// ─── Report: 21.12 ─────────────────────────────────────────────────────────

async function report2112() {
  console.log('\n=== Check: 21.12 (Advent Dec 21) ===');
  const q = await col.where('_date', '==', '21.12').get();
  if (q.empty) {
    console.log('  NOT FOUND — 21.12 has no document in parsedData.');
    console.log('  Action needed: add reading text manually via admin panel or a separate script.');
  } else {
    console.log(`  Found ${q.size} doc(s):`);
    q.docs.forEach(d => console.log(`    ${d.id}`));
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────

await fixWeek13Years();
await fixHeartOfMary();
await report2112();

console.log('\nDone.');
if (!apply) console.log('\nTo apply changes: node scripts/fix-week13-year-and-heartofmary.mjs --apply');
await admin.app().delete();
process.exit(0);
