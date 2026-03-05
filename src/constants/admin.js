/**
 * Fallback admin UIDs used when Firestore `admins` collection is unavailable.
 * Primary admin management is done via Firestore: add a document to the `admins`
 * collection with doc ID = user UID and fields { email, name } to grant access.
 *
 * These UIDs act as emergency/bootstrap access and should not be removed.
 */
export const ADMIN_UIDS = ['64MeSP56IWVotVFG7bu8YKeLis12'];

