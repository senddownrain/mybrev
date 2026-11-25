import { doc, runTransaction, serverTimestamp, setDoc, setLogLevel, updateDoc } from 'firebase/firestore/lite';
import {
  ACCESS_SET_ID, accessSetsV2CodeProof, generateAccessSetsV2Code, parseAccessSetsV2Code,
} from '../utils/accessSetsV2Code.mjs';
import {
  ACCESS_V2, accessV2CodeProjection, accessV2Error, accessV2ProfileProjection, revokeAccessV2Grant,
} from './accessSetsV2Gateway.mjs';

const codeIdPattern = /^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{16}$/;
const codeDisabled = () => ({ status: 'disabled', disabledAt: serverTimestamp() });

function assertId(id, errorCode) {
  if (typeof id !== 'string' || !ACCESS_SET_ID.test(id)) throw accessV2Error(errorCode);
}

function expectName(name) {
  if (typeof name !== 'string' || !name.trim() || [...name].length > 120) {
    throw accessV2Error('invalid-name');
  }
}

// Pass the privileged Lite Firestore instance. Rules independently require
// the specialized management role for each write.
export function createAccessSetsV2Admin(db) {
  // Code proofs must also stay out of failed administrative write logs.
  setLogLevel('silent');

  async function saveSet(setId, { name }) {
    assertId(setId, 'invalid-set');
    expectName(name);
    return setDoc(doc(db, ACCESS_V2.sets, setId), { name, status: 'active', updatedAt: serverTimestamp() });
  }

  async function saveProfile(profileId, { name, allowedSets, status }, expectedRevision = 0) {
    assertId(profileId, 'invalid-profile');
    expectName(name);
    if (!['active', 'disabled', 'revoked'].includes(status)) throw accessV2Error('invalid-status');
    if (!Array.isArray(allowedSets) || new Set(allowedSets).size !== allowedSets.length) {
      throw accessV2Error('invalid-sets');
    }
    for (const id of allowedSets) assertId(id, 'invalid-set');
    const setIds = [...allowedSets].sort();

    const target = doc(db, ACCESS_V2.profiles, profileId);
    return runTransaction(db, async tx => {
      const current = (await tx.get(target)).data();
      if ((current?.revision ?? 0) !== expectedRevision) throw accessV2Error('stale-profile');
      if (current?.status === 'revoked') throw accessV2Error('profile-revoked');
      if (!current && status !== 'active') throw accessV2Error('invalid-status');
      const sets = await Promise.all(setIds.map(id => tx.get(doc(db, ACCESS_V2.sets, id))));
      if (sets.some(set => set.data()?.status !== 'active')) throw accessV2Error('unknown-set');

      const projection = { allowedSets: setIds, revision: expectedRevision + 1 };
      tx.set(target, { ...projection, name, status, updatedAt: serverTimestamp() });
      tx.set(accessV2ProfileProjection(db, profileId), projection);
      return projection.revision;
    });
  }

  async function issueCode({ profileId, prefix, label = '', replacesCodeId }) {
    assertId(profileId, 'invalid-profile');
    if (replacesCodeId !== undefined
      && (typeof replacesCodeId !== 'string' || !codeIdPattern.test(replacesCodeId))) {
      throw accessV2Error('invalid-code-id');
    }
    if (typeof label !== 'string' || [...label].length > 120) throw accessV2Error('invalid-label');

    for (let attempt = 0; attempt < 3; attempt++) {
      const { codeId, code } = generateAccessSetsV2Code(prefix);
      const codeProof = await accessSetsV2CodeProof(parseAccessSetsV2Code(code).canonical);
      const target = doc(db, ACCESS_V2.codes, codeId);
      const previous = replacesCodeId ? doc(db, ACCESS_V2.codes, replacesCodeId) : null;
      try {
        await runTransaction(db, async tx => {
          const collision = await tx.get(target);
          const replaced = previous ? (await tx.get(previous)).data() : null;
          if (collision.exists()) throw accessV2Error('code-id-collision');
          if (previous && (replaced?.status !== 'active' || replaced.profileId !== profileId)) {
            throw accessV2Error('code-not-replaceable');
          }
          tx.set(target, { profileId, codeProof, label, status: 'active', issuedAt: serverTimestamp(), disabledAt: null });
          tx.set(accessV2CodeProjection(db, codeId), { profileId });
          if (previous) tx.update(previous, codeDisabled());
        });
        return { codeId, code };
      } catch (error) {
        if (error?.code !== 'code-id-collision') throw error;
      }
    }
    throw accessV2Error('code-id-collision');
  }

  async function disableCode(codeId) {
    if (typeof codeId !== 'string' || !codeIdPattern.test(codeId)) throw accessV2Error('invalid-code-id');
    await updateDoc(doc(db, ACCESS_V2.codes, codeId), codeDisabled());
  }

  return {
    saveSet, saveProfile, issueCode, disableCode,
    revokeDevice: uid => revokeAccessV2Grant(db, uid),
  };
}
