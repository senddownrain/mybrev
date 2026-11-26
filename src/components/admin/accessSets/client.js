import { getAuth } from 'firebase/auth';
import { doc, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore/lite';
import { firebaseApp } from '@/plugins/firebase';
import { getClientAppCheckToken } from '@/plugins/firebaseAppCheck';
import { createAccessSetsV2Admin } from '@/services/accessSetsV2Admin.mjs';
import { ACCESS_V2, accessV2Error } from '@/services/accessSetsV2Gateway.mjs';
import { firestoreErrorCode } from '@/utils/firestoreErrors.mjs';
import { createRegistry } from './registry.mjs';
import { isAccessSetId } from './model.mjs';

export function createAccessAdminClient(uid) {
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  const admin = createAccessSetsV2Admin(db);

  function session() {
    if (!uid || auth.currentUser?.uid !== uid) throw accessV2Error('unauthenticated');
    return auth.currentUser;
  }

  const registry = createRegistry({
    database: 'projects/' + firebaseApp.options.projectId + '/databases/(default)',
    endpoint: 'https://firestore.googleapis.com',
    async headers() {
      const user = session();
      const [token, appCheck] = await Promise.all([user.getIdToken(), getClientAppCheckToken(firebaseApp)]);
      session();
      return {
        Authorization: 'Bearer ' + token,
        ...(appCheck ? { 'X-Firebase-AppCheck': appCheck } : {}),
      };
    },
  });

  async function createSet(id, name) {
    session();
    if (!isAccessSetId(id)) throw accessV2Error('invalid-set');
    if (!name.trim() || [...name].length > 120) throw accessV2Error('invalid-name');
    // S1 saveSet is an upsert. Creating an ID, especially a reserved one,
    // must reject even if a different manager created it after this form opened.
    await runTransaction(db, async tx => {
      session();
      const target = doc(db, ACCESS_V2.sets, id);
      if ((await tx.get(target)).exists()) throw accessV2Error('set-exists');
      session();
      tx.set(target, { name, status: 'active', updatedAt: serverTimestamp() });
    });
  }

  return {
    ...registry,
    createSet,
    renameSet(id, name) {
      session();
      return admin.saveSet(id, { name });
    },
    saveProfile(id, profile, revision) {
      session();
      return admin.saveProfile(id, profile, revision);
    },
    async issueCode(input) {
      if ((await registry.read('profiles', input.profileId))?.status !== 'active') {
        throw accessV2Error('inactive-profile');
      }
      session();
      const result = await admin.issueCode(input);
      session();
      return result;
    },
    disableCode(id) {
      session();
      return admin.disableCode(id);
    },
    async revoke(kind, id) {
      session();
      let writeError;
      try {
        if (kind === 'legacy') {
          const { updatePriestDevice } = await import('@/services/priestAccessService');
          session();
          await updatePriestDevice(id, { revoke: true });
        } else {
          await admin.revokeDevice(id);
        }
      } catch (error) {
        writeError = error;
      }

      try {
        const device = await registry.read(kind, id);
        if (device?.status === 'revoked') return device;
      } catch (error) {
        if (!writeError) {
          const unconfirmed = accessV2Error('revoke-unconfirmed');
          unconfirmed.blockedBy = firestoreErrorCode(error);
          throw unconfirmed;
        }
      }
      throw writeError || accessV2Error('revoke-unconfirmed');
    },
  };
}
