import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createPriestService, ApiError } from './lib/priest-service.mjs';
import { createPriestHandler } from './lib/priest-http.mjs';

initializeApp();
const db = getFirestore();
const bootstrapAdmins = ['64MeSP56IWVotVFG7bu8YKeLis12', '7mszX2IiXHgjWxj0ZE5vEqdkmoD2'];
const project = process.env.GCLOUD_PROJECT;
const origins = (process.env.PRIEST_ALLOWED_ORIGINS || `https://${project}.web.app,https://${project}.firebaseapp.com`).split(',').map((s) => s.trim());
if (process.env.FUNCTIONS_EMULATOR === 'true') origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
async function verifyAdmin(token) {
  if (!token) throw new ApiError(401, 'ADMIN_REQUIRED');
  let user;
  try { user = await getAuth().verifyIdToken(token, true); } catch { throw new ApiError(401, 'ADMIN_REQUIRED'); }
  if (bootstrapAdmins.includes(user.uid)) return user.uid;
  const admin = (await db.doc(`admins/${user.uid}`).get()).data();
  if (!admin || admin.priestAccess !== true) throw new ApiError(403, 'ADMIN_REQUIRED');
  return user.uid;
}
// Bound simultaneous Argon2 work (64 MiB per activation) within instance memory.
export const priestApi = onRequest({ region: 'europe-west1', memory: '512MiB', maxInstances: 10, concurrency: 4, cors: false },
  createPriestHandler(createPriestService(db), { verifyAdmin, origins, insecureCookie: process.env.FUNCTIONS_EMULATOR === 'true' }));
