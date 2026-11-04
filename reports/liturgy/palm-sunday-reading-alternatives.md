# Palm Sunday: false first-reading alternatives

Branch: `fix/palm-sunday-reading-alternatives`, started from main `922ec01`, rebased onto updated main `c55c69e` before completion.

## Evidence and cause

No `backups/firestore-snapshot/manifest.json` exists in this Cloud workspace. Local fixtures contained no Palm Sunday Office HTML. On 2026-11-04, read exactly two public content documents individually: `days/feast-palmsunday` and `days/holyweek-w1-d1`. Their `officeOfReadingsR1` values are identical. No collection scan, snapshot refresh, write, migration, manifest publication, merge or deploy was performed. The regression fixture contains only that reading, not a document dump.

The HTML contains **no `<hr>`**. It is Hebrews 10:1–18, with its theme and responsory. `CATEGORY_MARKER` matched the beginning of the Scripture paragraph:

> Пра гэта сведчыць нам і Дух Святы, бо сказана: «Вось запавет…

`splitAtRules` interpreted it as a category heading when no rule was present. The first option ended before this paragraph; the second contained the end of the reading and its responsory. The actual titles reproduced on current main were `Пасланне да Габрэяў 10, 1-18` and a truncated narrative beginning `Пра гэта сведчыць…`; they differ from the labels in the bug report, but the false split is reproduced.

The date/diocese resolver for 2026-03-29/Pinsk selects Palm Sunday. `assembleDaysResult` and `buildOrdoDayOptions` retain the field unchanged. The regression runs these assembly functions with the captured R1 values and minimal document identities; it does not claim to replay every live document. Both raw HTML and `Lectio`'s `removeLectionSectionHeading` → `markLeadingLiturgicalSubheadings` pipeline produced two options before the fix. The new regression fails against the original main parser (`2 !== 1`).

`Lectionis` passes R1/R2 to `Lectio`; `Lectio` requests `office-reading`; `AlternativeText` displays the parsed options; `useReadingChoice` remembers the selected index. These components and storage are functioning as designed. The incorrect boundary is in the parser.

## Change and coverage

For `office-reading`, a category must occupy a complete heading line ending with its colon. A paragraph continuing after the colon stays prose. A category followed by `<br>` and the reading is still recognized. Category titles use the same standalone-heading constraint. Explicit `<hr>`, `Або:`, qualified reading markers, structured choices, reference notes, and other content kinds retain their behavior.

No text is merged by similarity, removed, or rewritten. Tests compare the complete visible text and order before/after parsing, including the citation, theme, final Scripture paragraph and responsory. Office for the Dead tests compare each structured reading with its complete body and shared content. D-1 coverage checks holy-women/holy-men R1/R2 across seasons, reference notes, true alternatives and choice storage.

Compared old/new option and note counts for 386 local R1/R2 fields in `patchs/db-templates`, their seasonal variants and `patchs/db-feasts`. Only six counts changed: martyr-one R2 (base and four seasons) and St Sebastian R2. They contain the same prose collision (`Пра гэты келіх казалі мучанікі: …`, `Пра такія ганенні кажа Апостал: …`). Each is one complete reading after the fix, with word-for-word regression coverage. All other counts stayed unchanged.

## Validation

- `node --test tests/reading-choices.test.mjs tests/liturgical-alternatives.test.mjs`: 29 passed.
- `npm test`: 1076 tests, 1066 passed, 10 skipped, 0 failures.
- `npx eslint .`: passed.
- `npm run build`: passed (existing Vite chunk-size warning).
- Chromium, 390 px, temporary offline harness mounting real `Lectio`/`AlternativeText` with the captured R1 and local Common documents: Palm reading has no tabs and includes its ending/responsory; holy-women R1 has five choices, R2 has three; click and arrow-key selection work; Office for the Dead has three choices; return to Palm has no tabs. No page errors. Harness removed afterwards.
- Full production URL was not opened in a browser; date assembly and component rendering were checked separately. No deployment was requested or performed.

## Browser check (1–2 minutes)

Run `npm run dev` on this branch with the existing Firebase web configuration. Open `http://localhost:3000/day/2026-03-29/ora/feast-palmsunday/lectionis?view=period&diocese=pinsk` (use the port printed by Vite). Under `Першае чытанне`, verify there is no choice picker, the reference is Hebrews 10:1–18, and scrolling reaches `Пра гэта сведчыць нам і Дух Святы…`, then the responsory ending `Вось іду, каб выканаць волю Тваю, Божа.` before the second reading. For a quick true-choice check, open Office for the Dead on an ordinary weekday and switch its three first readings. The hosted production URL stays unchanged until a separately authorized deployment.

## Flutter

An analogous fix **is required**. Read-only inspection of `senddownrain/ibreviarybyapp` main `2420c45` confirms the same unanchored category rule in `lib/utils/liturgical_alternatives.dart` (`_isAlternativeBoundary`, `_categoryTitle`); `lib/widgets/alternative_text.dart` uses `getReadingChoices` for `office-reading`. Port the complete-heading constraint and the captured HTML regression there. Flutter files were not changed or tested. No Firestore data change, content manifest or bundle refresh is needed for this client parser fix.
