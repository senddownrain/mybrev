import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { generateCode, matchesSecret, newSecret, normalizeCode, secretHash, validNewCode } from './priest-crypto.mjs';
import { permittedPrayerContent } from './priest-policy.mjs';

export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new ApiError(status, code); };
const cleanLabel = (value) => String(value || '').trim().slice(0, 120);
const asDocs = (snapshot) => snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
export const publicGrant = (g) => Object.fromEntries(['id', 'deviceName', 'label', 'client', 'platform', 'activatedAt', 'lastActiveAt', 'revokedAt', 'status'].map((k) => [k, g[k] ?? null]));

export function createPriestService(db, { now = Date.now } = {}) {
  const settingsRef = db.doc('priestAccess/settings');
  const grantRef = (id) => db.doc(`priestDeviceGrants/${id}`);
  async function rateLimit(ip, installationId) {
    const timestamp = now();
    const bucket = Math.floor(timestamp / 900000);
    const limits = [[`ip:${ip}`, 8], [`install:${installationId}`, 8], ['global', 1200]];
    const allowed = await db.runTransaction(async (tx) => {
      const refs = limits.map(([key]) => db.doc(`priestActivationAttempts/${secretHash(`${bucket}:${key}`)}`));
      const snapshots = await Promise.all(refs.map((r) => tx.get(r)));
      if (snapshots.some((s, i) => (s.data()?.count || 0) >= limits[i][1])) return false;
      refs.forEach((r, i) => tx.set(r, { count: (snapshots[i].data()?.count || 0) + 1, expiresAt: new Date(timestamp + 1800000) }));
      return true;
    });
    if (!allowed) fail(429, 'TOO_MANY_ATTEMPTS');
  }
  function checkGrant(snapshot, credential) {
    const grant = snapshot.data();
    if (!grant || grant.status !== 'active' || !matchesSecret(credential.secret, grant.secretHash)) fail(401, 'ACCESS_REQUIRED');
    return { ...grant, id: snapshot.id };
  }
  async function activate(input, ip) {
    const installationId = String(input.installationId || '');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(installationId) || !['Web', 'Flutter'].includes(input.client)) fail(400, 'INVALID_DEVICE');
    await rateLimit(ip, installationId);
    const code = normalizeCode(input.code);
    const settings = (await settingsRef.get()).data();
    // Same error for absent code, malformed code and wrong code. Never log inputs.
    if (!code || !settings?.codeHash || !await argon2.verify(settings.codeHash, code)) fail(400, 'INVALID_CODE');
    const id = randomUUID();
    const secret = newSecret();
    const timestamp = now();
    const grant = {
      installationId, secretHash: secretHash(secret), deviceName: cleanLabel(input.deviceName) || input.client,
      label: cleanLabel(input.label), client: input.client, platform: cleanLabel(input.platform),
      activatedAt: timestamp, lastActiveAt: timestamp, status: 'active', revokedAt: null,
    };
    await db.runTransaction(async (tx) => {
      const installRef = db.doc(`priestInstallations/${installationId}`);
      const [current, installation] = await Promise.all([tx.get(settingsRef), tx.get(installRef)]);
      if (current.data()?.codeHash !== settings.codeHash) fail(400, 'INVALID_CODE');
      if (installation.exists) {
        const previous = await tx.get(grantRef(installation.data().grantId));
        if (previous.data()?.status === 'active') fail(409, 'INSTALLATION_REGISTERED');
      }
      tx.create(grantRef(id), grant);
      tx.set(installRef, { grantId: id });
    });
    return { credential: `${id}.${secret}`, device: publicGrant({ ...grant, id }) };
  }
  async function status(credential) {
    if (!credential) return { active: false };
    return db.runTransaction(async (tx) => {
      const grant = checkGrant(await tx.get(grantRef(credential.id)), credential);
      if (now() - grant.lastActiveAt >= 300000) tx.update(grantRef(credential.id), { lastActiveAt: now() });
      return { active: true, device: publicGrant(grant) };
    });
  }
  async function disable(credential) {
    if (!credential) return;
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(grantRef(credential.id));
      // Idempotent after admin revoke, but still require the individual secret.
      if (!snapshot.exists || !matchesSecret(credential.secret, snapshot.data().secretHash)) return;
      tx.update(grantRef(credential.id), { status: 'revoked', revokedAt: snapshot.data().revokedAt || now() });
    });
  }
  async function content(credential, publicOnly = false) {
    return db.runTransaction(async (tx) => {
      const grant = credential && !publicOnly ? checkGrant(await tx.get(grantRef(credential.id)), credential) : null;
      const [prayers, categories] = await Promise.all([tx.get(db.collection('prayers')), tx.get(db.collection('prayerCategories'))]);
      const result = permittedPrayerContent(asDocs(prayers), asDocs(categories), Boolean(grant));
      if (grant && now() - grant.lastActiveAt >= 300000) tx.update(grantRef(credential.id), { lastActiveAt: now() });
      return result;
    });
  }
  async function settings() {
    const data = (await settingsRef.get()).data() || {};
    return { codeCreated: Boolean(data.codeHash), changedAt: data.changedAt || null, helpText: data.helpText || '' };
  }
  async function replaceCode(input, uid) {
    const code = input.generate === true ? generateCode() : String(input.code || '');
    if (!validNewCode(code)) fail(400, 'WEAK_CODE');
    const hash = await argon2.hash(normalizeCode(code), { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    // Only activation settings change. Device grants are deliberately independent.
    await settingsRef.set({ codeHash: hash, changedAt: now(), changedBy: uid }, { merge: true });
    return { code, ...(await settings()) };
  }
  async function setHelp(input) {
    if (typeof input.helpText !== 'string' || input.helpText.length > 1000) fail(400, 'INVALID_HELP');
    await settingsRef.set({ helpText: input.helpText.trim() }, { merge: true });
    return settings();
  }
  async function listDevices({ after, status: filter } = {}) {
    let query = db.collection('priestDeviceGrants').orderBy('__name__').limit(100);
    if (after && /^[a-f0-9-]{36}$/.test(after)) query = query.startAfter(after);
    const rows = asDocs(await query.get());
    return { devices: rows.filter((d) => !filter || d.status === filter).map(publicGrant), next: rows.length === 100 ? rows.at(-1).id : null };
  }
  async function updateDevice(id, input) {
    if (!/^[a-f0-9-]{36}$/.test(id)) fail(400, 'INVALID_DEVICE');
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(grantRef(id));
      if (!snapshot.exists) fail(404, 'NOT_FOUND');
      const update = {};
      if (input.revoke === true) { update.status = 'revoked'; update.revokedAt = snapshot.data().revokedAt || now(); }
      if (typeof input.label === 'string') update.label = cleanLabel(input.label);
      if (!Object.keys(update).length) fail(400, 'INVALID_DEVICE');
      tx.update(grantRef(id), update);
    });
    return { ok: true };
  }
  return { activate, status, disable, content, settings, replaceCode, setHelp, listDevices, updateDevice };
}
