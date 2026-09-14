# Пілігрымкавы спеўнік

`/songs` contains 447 songs: 436 from `sound_list (3).json` and 11 additional
songs from `sound_list_10.json`, retaining category ID 10 (`Часткі Імшы`).
They have stable IDs and the source `Супольнасць "Мы разам" holysong.ru`.
Different songs with the same title remain separate. Export `tag` values such as
`2,3,4` are stored as numeric ID arrays and displayed using `TAGS_LIST` in
`src/constants/songTags.js`. Administrators can select those ten categories and
add custom song tags independently of prayer tags.

Public Firestore collection: `songs`. Fields: `title`, `text`, `chord`, `tag`
(numeric category ID array), `tags`
(string array), `source`, `createdAt`, `updatedAt`. The bundled initial songs
are available before import and without network; saved Firestore documents
override bundled songs by ID. New songs are merged into the list. Complete
results use the existing public offline content cache and its refresh action.
Firestore rules must permit public reading of `songs` and restrict writes to
administrators, matching the existing `prayers` permissions. Rules are managed
outside this repository, so no permissions are deployed here.

Favorites and display preferences are local to the device. Chords can be hidden,
displayed above each line or on its left. These are the only chord preferences;
the settings button is at the top right of the list. The song view has back,
favorite and admin-only edit buttons in the app bar. The admin-only create button
floats at the bottom right of the list and becomes a circular plus on mobile.
The list and reading page reuse the prayer components' shared styles in
`src/styles/prayers-list.css` and `src/styles/prayer-reading.css`.
The favorites-only filter lives in the filter sheet.
The list settings also offer a compact mode with shorter rows and hidden tags;
category filtering remains available. This preference is saved on the device.
The song view uses the same divided navigation capsule as prayers, labeled
`Усе спевы` and returning to the song list.
Transposing
changes only the displayed chord column and slash bass notes, never saved text.
Legacy lowercase minor chords, Unicode accidentals, `H`, and compact progressions
are supported. `B` means B natural, `B♭` means B flat. Chord lines also contain
chorus lyrics in this export; those are preserved and displayed unchanged.

Administrators create songs at `/admin/songs/new` and edit them at
`/admin/songs/:id/edit`. The editor has text and text-with-chords tabs; switching
tabs preserves both fields. Chord line N corresponds to text line N, including
blank lines. Unsaved edits have a leave-page warning and a preview.

## Optional Firestore seed import

```powershell
node scripts/import-songs.mjs
node scripts/import-songs.mjs --input 'C:/Users/User/Downloads/Telegram Desktop/sound_list (3).json'
# Final database write phase; run separately after reviewing the local plan:
node scripts/import-songs.mjs --apply
# Create missing songs and synchronize numeric category assignments:
node scripts/import-songs.mjs --sync-categories
node scripts/import-songs.mjs --sync-categories --apply
```

The default dry run uses `backups/firestore-snapshot` and writes
`reports/songs-import-plan.json`. If the snapshot does not cover `songs`, it
explicitly reports the unknown target state. It performs no live reads or writes.
`--snapshot`, `--output`, and `--service-account` accept alternate local paths.
Only `--apply` initializes Admin Firestore and creates missing documents; existing
documents are skipped without being overwritten. Reruns are safe after partial
completion. The service-account project must match the snapshot project.

With `--sync-categories`, category definitions used by the input (`id`, `title`, `icon`)
are saved in `songCategories`, using the numeric ID as the document ID string.
Missing songs are created. Existing imported songs receive only `tag`, `source`
and `updatedAt` updates, preserving edited titles, lyrics, chords and custom tags.
No live Firestore reads are needed. Songs without a category number retain an
empty category array. The final write result is recorded next to the plan.
