# Firestore security rules

`firestore.rules` is the ruleset for Firebase project `ibreviaryby`, referenced by `firebase.json`.

## Access policy (2026-11-22 security hardening)

**Default deny for anonymous reads of unknown collections.** The previous catch-all
`allow read: if !explicitlyRuled(collection)` exposed any *new* root collection,
including future user records, as soon as it was created. Never restore it.

| Resource | Unauthenticated | Authenticated reader | Admin | Priest with active grant |
|---|---|---|---|---|
| Public liturgical content, scripture, songs and compendium (explicit allowlist) | Read root documents | Read | Read/write | Read |
| `prayers`, `prayerCategories` | Read | Read | Versioned admin write | Read |
| `priestAccessPublic/help` | Read | Read | Restricted write | Read |
| `priestProtectedPrayers`, `priestProtectedCategories` | Denied | Denied | Read/write under content controls | Read |
| `prayerDrafts` (including audit), admin records, priest access codes, device grants, claims, control and migration namespaces | Denied | Only explicitly permitted own-document actions | Defined by per-namespace rules | Defined by per-namespace rules |
| Any *new* collection not explicitly listed | **Denied** | **Denied** | Generic admin maintenance access outside reserved namespaces | Denied |
| Nested subcollections under public content | **Denied** unless explicitly ruled | **Denied** unless explicitly ruled | Generic admin maintenance access | Denied |

The allowlist includes: `days`, `liturgicalProperTexts`, `readings`,
`liturgicalTemplates`, `invitatoriums`, `completoriums`, `songs`,
`bible_bel`, `bible_ru`, `compendium`, `compendiumMeta`,
`liturgicalCalendarMeta`, `liturgicalCelebrations`,
`liturgicalDioceseOverrides`, `liturgicalYearOverrides`,
`liturgicalOrdoNotes`. The public prayers/categories and public priest-help
documents have dedicated rules. These names are cross-checked with the Flutter
`assets/content/manifest.json` and Web services. Adding a new public dataset
requires a reviewed rules change and corresponding emulator tests; it will NOT
automatically become readable.

Some legacy administrative and priest rules have additional field, token, owner,
and transaction constraints; the table is descriptive, not an exhaustive proof
of those invariants. Admin SDK/server service accounts bypass Rules.

## Verification before production

```bash
npm ci
npm run test:rules
npm run test:priest:rules
npm run test:feedback
```

`test:rules` and `test:priest:rules` use local emulators (Java 21 required).
GitHub CI runs the default-deny rules emulator checks and feedback tests
on the PR. Review CI before merging. Validate against both current Web
and released Flutter collection names, including older clients if supported.

**Check live rules separately:** this GitHub file does not prove which revision
is active in Firebase Console. Do not perform massive production reads or
bulk security probes to verify it.

## Deploy and rollback

Only after emulator and reader smoke checks, an authorized operator may run:

```bash
firebase deploy --only firestore:rules --project ibreviaryby
```

Verify that a new arbitrary collection is denied without credentials, while
approved public scripture/Hours/Readings queries work and protected priest/
admin paths remain forbidden. If any legitimate client read breaks, restore the
last *known-secure* ruleset in Firebase Rules history or ship a targeted allowlist
correction. **Never roll back to the old open catch-all.**

Rules are **not** a request-rate limiter. Public collection reads can still
consume Firestore quota/billing. Separately configure Firebase App Check
(enforce only after Web + Android/iOS rollout and verified metrics), budget
alerts and quotas, and move expensive anonymous publication reads to CDN/static
bundles when possible. App Check is an abuse-reduction measure, not a hard cost cap.
