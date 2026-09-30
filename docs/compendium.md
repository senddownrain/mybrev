# Кампендый Катэхізіса Каталіцкага Касцёла

The Compendium is a read-only content domain of its own: it is not a prayer and does
not use prayer collections, categories or filters. `mybrev` shows it at `/compendium`;
`ibreviarybyapp` is meant to use the same canonical export.

## Source

- Index page: <https://catholic.by/3/lib/documents/kasciol/3963-kampendyj-katekhizisa-katalitskaga-kastsjola>
- The text is split across four part pages that the index links to (`5925`–`5928`).
  Every part page starts with its own table of contents, whose links point to anchors
  in the body.
- © Copyright 2005 — Libreria Editrice Vaticana; © Канферэнцыя Каталіцкіх Біскупаў у
  Беларусі, 2010. These notices are stored in `meta.copyright`, and the source link is
  shown on every Compendium screen.

The raw HTML of all five pages (including site chrome) is committed in
`scripts/compendium-source/`. Parsing never needs the network.

### What is included

The four parts, their sections (`РАЗДЗЕЛ`), chapters (`ГЛАВА`), thematic headings
and the 598 numbered questions. Each question keeps its answer, its references to
paragraphs of the full Catechism, and any quotation box (citation) printed after it.
Text is stored verbatim: the tests check that every question, answer paragraph and
citation is a substring of the source text.

### What is excluded, on purpose

- Motu proprio and УВОДЗІНЫ: these are separate pages and are never fetched.
- The appendix (prayers, formulas).
- Unnumbered blocks between a heading and the next question: the Apostles' and
  Nicene Creeds (with Latin), the list of the seven sacraments, the Decalogue tables and
  the Lord's Prayer. `reports/compendium-build-report.json` lists them, and a test pins
  exactly these four blocks. The TOC entry "Веру: Апостальскі сімвал…" only labels the
  creeds, so it is the one expected unmatched heading.

## Canonical schema (`schemaVersion: 1`)

The canonical dataset is `src/data/compendium/compendium.json`:

```text
{
  meta: {
    id: "compendium", title, language: "be",
    schemaVersion: 1,
    contentVersion: int,        // +1 whenever the checksum changes
    questionCount: 598, unitCount, unitIds: [ordered unit ids],
    sourceTitle, sourceUrl, sourceHost: "Catholic.by", sourcePages: [4 urls],
    copyright: [strings],
    checksum: sha256(JSON of {parts, units}),
    updatedAt: "YYYY-MM-DD"     // date the content last changed
  },
  parts: [{ id: "p1", number, label: "ЧАСТКА ПЕРШАЯ", title, sourceUrl,
            sections: [{ id, number, label, title, chapters: [{ id, number, label, title }] }] }],
  units: [                      // chapter-like documents, 27 in total
    { id: "p1-s1-ch2" | "p1-s1-intro", order,
      partId, partNumber, partLabel, partTitle,
      sectionNumber, sectionLabel, sectionTitle,
      chapterNumber|null, chapterLabel|null, chapterTitle|null,
      title, firstQuestion, lastQuestion,
      leadCitations?: [citation],   // quotation printed before the first question
      topics: [{ id: "p1-s1-ch2-t1", order, title, parentTitle?, firstQuestion, lastQuestion, leadCitations? }],
      questions: [
        { id: "q006", number: 6, order: 6,
          question, answer,                 // answer: "\n" = line break, "\n\n" = paragraph
          cccRefs: ["50-53", "68-69"],      // strings, "a-b" = range
          topicId|null, topicTitle|null, subtopicTitle|null,
          answerEmphasis?: [{ start, end, style: "italic"|"bold" }],   // offsets into answer
          citations?: [{ text, cccRefs }] }   // quotation boxes printed after the answer
      ] }
  ]
}
```

- IDs are deterministic. Questions are `q001`…`q598`. A unit is part/section/chapter;
  `…-intro` holds the questions that come after a section heading and before its first
  chapter. Topics are numbered in source order within their unit.
- Heading titles are the body headings exactly as printed, which are mostly uppercase
  in the source. Latin lookalike letters such as `I` also stay as they are.
- Italic sub-headings under an article become `subtopicTitle`. Examples: "Неба і
  зямля" under «Веру ў Бога…», and "Касцёл у Божым намеры". An empty heading
  immediately followed by other headings (e.g. "ЦЭЛЕБРАЦЫЯ ЛІТУРГІІ КАСЦЁЛА") becomes
  the next topic's `parentTitle`.
- Every field name is plain JSON, so it maps directly to Dart. Optional fields are
  simply absent.

The search alias file is `src/data/compendium/compendium_search_aliases.json`. It is
maintained by hand and is not generated.

## Commands

```sh
npm run compendium:build          # parse scripts/compendium-source → src/data/compendium/compendium.json
node scripts/build-compendium.mjs --fetch      # re-download the 5 source pages first
npm run compendium:check          # fail if the committed dataset differs from a fresh parse
# Flutter asset: gzipped canonical JSON + the alias file copied beside it
node scripts/build-compendium.mjs --flutter-asset ../ibreviarybyapp/assets/compendium/compendium.json.gz
```

The build validates the dataset before writing it: 598 questions exactly once, no gaps,
monotonic order and hierarchy, and no introductory markers. If the source changes,
run `--fetch` and review the diff and the build report. `contentVersion` goes up
automatically when the checksum changes, and `updatedAt` is set to the build date.

## Firestore layout

```text
compendium/{unitId}          27 documents: one per chapter-like unit (≤ 75 kB each),
                             same shape as units[] above plus importedAt
compendiumMeta/current       meta fields + parts hierarchy + importedAt
```

`npm run db:import-compendium` is a dry run. It writes
`reports/compendium-import-plan.json`, reads the local snapshot if one exists, and never
touches Firestore. `--apply` writes the units in one batch and then `compendiumMeta/current`
last, so clients never see a new version before its units exist. `--prune` also deletes
unit documents that are no longer listed. Public read rules for `compendium` and
`compendiumMeta` are managed outside this repository, just like `songs`.

## mybrev data flow

- `src/services/compendiumService.js` loads the bundled dataset and the aliases as
  lazy chunks. They are precached by the PWA service worker but are not part of the
  start-up bundle.
- `src/stores/compendium.js` renders the bundled content right away. In the background
  `createCompendiumLoader` (`src/utils/compendiumLoader.js`) reads `compendiumMeta/current`
  through `publicContentCache`: one document read per content revision, and a
  "nothing newer" result is cached too. Only if `contentVersion` is strictly higher and
  the downloaded units pass `validateCompendiumDataset` does it fetch the `compendium`
  collection in a single query and swap it in. If the refresh fails or the data is
  invalid, whatever is already displayed stays.
- `src/utils/compendiumData.js` holds validation, the question/number index, internal
  reading groups (a topic, or a unit's questions that come before its first topic) and
  answer paragraphs.
- `src/utils/compendiumNavigation.js` derives the visible source hierarchy from that
  index (see "Source hierarchy vs reading groups" below). The canonical schema is
  unchanged.

## Search

`src/utils/compendiumSearch.js` builds a local, deterministic index once per dataset.
No external service is involved.

Normalisation, which other clients should reproduce:

1. Lower-case the text, apply NFD and drop combining marks (ё→е, й→и, ў→у, stress marks).
2. Fold і→и and э→е, drop ъ and apostrophes (’ ' ʼ `), and map Latin lookalikes next to
   Cyrillic letters (a e i o p c x y) to Cyrillic.
3. Treat every other non-letter/digit as a separator.

Matching and ranking:

- Each query word must match somewhere (AND), as a word prefix.
- Field weights: question 12, answer 5, headings 3, CCC refs 4.
- A whole-word hit scores slightly above a prefix hit.
- Stems: for words of 4+ letters, dropping the last 1–2 letters is allowed at ×0.6.
- Bonuses: the whole phrase in the question (+20) or in the answer (+8); all words found
  in the question (+10) or in the headings (+8); short questions get a small bonus.
- A pure number `n` (optionally `№n`/`#n`) returns question `n` first. After it come the
  questions whose CCC ranges contain `n`. Digits never match Scripture citations inside
  the text.

Hidden Russian aliases (`groups: [{ ru: [stems], be: [prefixes] }]`) work like this:

- If a query word starts with a `ru` stem, it also matches that group's Belarusian
  prefixes, at ×0.85.
- Aliases are never rendered and never change the source text.
- A test checks that every `be` prefix occurs in the text.
- To extend them, add groups to the JSON file; no code change is needed.

## UI (mybrev)

| Route | Screen |
| --- | --- |
| `/compendium` | Root screen: the four parts |
| `/compendium/part/:partId` | Part screen: only its РАЗДЗЕЛ rows (label, title, question range) |
| `/compendium/node/:nodeId` | Section (`p1-s1`) or subsection (`p1-s1-ch1`) screen: what that node owns directly |
| `/compendium/topic/:topicId` | A named topic: expandable question rows inside the existing reading surface, with prev/next |
| `/compendium/question/:number` | One question with its context trail and prev/next; deep-linkable |

All five are children of `CompendiumShell` (see "Persistent search" below). The part
route and the node route render the same view, `CompendiumNode.vue`.

Other details:

- The drawer item «Кампендый» (Phosphor `PhScroll`) sits between «Біблія» and «Спеўнік».
- On sub-pages the app bar shows the divided back / «Кампендый» capsule, the same one
  the song view uses. It also shows the existing text-scale control.
- Expanded rows are kept in the store for the session. The router's saved scroll
  position restores the scroll on Back.
- Styles reuse `prayers-list.css` and `prayer-reading.css`. `compendium.css` only adds
  small row, number and citation rules built on the existing theme tokens.

### Source hierarchy vs reading groups

Units and reading groups are technical: they split content for storage, the topic
reader and search. They are not what the user navigates. `compendiumNavigation.js`
builds a derived tree in which only headings printed on Catholic.by are nodes:

```text
part (ЧАСТКА) → section (РАЗДЗЕЛ) → chapter (ГЛАВА) → topic (named heading)
node: { id, kind, number, parentId, label, uiLabel, title, sourceHeading: true, leadCitations,
        directQuestions: [questions], topics: [topic nodes], chapters: [chapter nodes],
        children: [structural child screens] }
```

- `label` is the heading as printed in the source (`ЧАСТКА ПЕРШАЯ`, `РАЗДЗЕЛ ПЕРШЫ`,
  `ГЛАВА ПЕРШАЯ`). `uiLabel` is what the product shows (see "UI terminology").
  `section`/`chapter` are code names only and are never displayed.
- Questions printed under a heading before its first child heading are that node's
  `directQuestions` and render as plain numbered question rows (the search-result row
  style). A node without a real title is never created, so there is no «Пытанне 1» or
  «Пытанні 25–27» heading. Ranges only appear as secondary metadata under a real title.
- A chapter's lead quotation (`leadCitations`) is shown under its heading.
- Italic subheadings stay in the topic reader (`subtopics` on the topic node).
- The topic pager walks `sequence`: named topics and direct questions in source order.

### Navigation rule (hierarchy v2, shared with the Flutter app)

> Each question is browsed under its nearest real structural owner. Part screens show
> Sections; Section screens show their direct questions and Subsections; Subsection
> screens show their direct questions and named Topics; Topic screens show questions.
> Internal reading groups remain separate from visible navigation.

Exactly, per screen and in this display order (`buildNodeScreen`):

| Screen | Header | Rows, top to bottom |
| --- | --- | --- |
| Root | title | the 4 parts (label, title, range) |
| Part | `ЧАСТКА …`, title | its РАЗДЗЕЛ rows only: label, title, range, chevron. No questions, no subsections, no topics |
| Section | part label (link) · `РАЗДЗЕЛ …`, title, range | 1. its direct questions; 2. named topics owned directly by the section; 3. its ПАДРАЗДЗЕЛ rows (label, title, range) |
| Subsection | part label · section title (links) · `ПАДРАЗДЗЕЛ …`, title, range, lead quotation | 1. its direct questions; 2. its named topics (title, range) |
| Topic | unchanged reader | expandable questions under their italic subheadings |

- A question row opens the question reader, a topic row opens the topic reader, and a
  РАЗДЗЕЛ / ПАДРАЗДЗЕЛ row opens that node's own screen. Nothing below a node's own
  level is flattened into it.
- A named topic is shown by its title only, without a level word. A topic's
  `parentTitle` stays a small caption above its row.
- Question ranges (`Пытанне N` / `Пытанні N–M`) are metadata under a real title and
  never a navigation node.
- Rows on every screen are in source order.

Audit of the 598-question dataset against this rule (pinned by
`tests/compendium-hierarchy.test.mjs`):

| | Count |
| --- | --- |
| Parts / sections / chapters (subsections) / named topics | 4 / 8 / 20 / 70 |
| Structural screens (part + section + subsection) | 32 |
| Questions listed directly on a section screen | 14: q1 (`p1-s1`), q218–220 (`p2-s1`), q357 (`p3-s1`), q434–441 (`p3-s2`), q534 (`p4-s1`) |
| Questions listed directly on a subsection screen | 13: q2–5 (`p1-s1-ch1`), q79–80 (`p1-s2-ch2`), q251 (`p2-s2-ch1`), q295 (`p2-s2-ch2`), q321 (`p2-s2-ch3`), q535 (`p4-s1-ch1`), q557 (`p4-s1-ch2`), q567–568 (`p4-s1-ch3`) |
| Questions inside named topics | 571 |
| Topics owned directly by a section | 5: q250 «Сем сакрамэнтаў Касцёла» (`p2-s2`, before its four subsections) and the 4 topics of `p4-s2` МАЛІТВА ПАНСКАЯ (no chapters) |
| Subsections without named topics | 1: `p1-s1-ch1` (q2–5) |
| Questions on a part screen | 0 |

Every question is listed on exactly one screen (14 + 13 + 571 = 598).

### UI terminology: ЧАСТКА → РАЗДЗЕЛ → ПАДРАЗДЗЕЛ

The canonical data is not changed: it keeps `chapter`, `chapterLabel: "ГЛАВА ПЕРШАЯ"`.
The product derives its own labels in `src/utils/compendiumLabels.js`
(`compendiumLevelLabel(kind, number, sourceLabel)`):

| Level (code) | Visible label |
| --- | --- |
| `part` | the source label as printed: `ЧАСТКА ПЕРШАЯ` (feminine) |
| `section` | `РАЗДЗЕЛ ` + masculine ordinal of `section.number` (equal to the source label) |
| `chapter` | `ПАДРАЗДЗЕЛ ` + masculine ordinal of `chapter.number` |
| `topic` | none: the title only |

The label is generated from the **number**, never by replacing the word «ГЛАВА»
(«ГЛАВА ПЕРШАЯ» → «ПАДРАЗДЗЕЛ ПЕРШАЯ» would have the wrong gender). Masculine
ordinals:

| n | Ordinal | n | Ordinal |
| --- | --- | --- | --- |
| 1 | ПЕРШЫ | 6 | ШОСТЫ |
| 2 | ДРУГІ | 7 | СЁМЫ |
| 3 | ТРЭЦІ | 8 | ВОСЬМЫ |
| 4 | ЧАЦВЁРТЫ | 9 | ДЗЯВЯТЫ |
| 5 | ПЯТЫ | 10 | ДЗЯСЯТЫ |

Beyond 10 the plain number is used (`ПАДРАЗДЗЕЛ 11`); the dataset needs 1–4.

### Context trails

- Trails and result contexts use titles of real headings only: part label, then
  section, chapter and topic **titles**, without consecutive duplicates. Example:
  `ЧАСТКА ПЕРШАЯ · «ВЕРУ» — «ВЕРЫМ» · ЧАЛАВЕК — «СВЯТЫНЯ» БОГА`.
- They never show a technical id, `intro`, a code word, a level word for
  sections/subsections or a range used as a heading.
- Each crumb links to that node's screen. «Да зместу» under a direct question opens
  the section/subsection that lists it; «Уся тэма» opens the topic.

### Routes, Back and legacy links

- `nodeRoute(node)`: part → `/compendium/part/:partId`; section or chapter →
  `/compendium/node/:nodeId`; topic → `/compendium/topic/:topicId`. Ids are the
  deterministic dataset ids, so deep links and refresh work.
- The shell keys the level by `route.path`, so each level is its own screen and `?q`
  never remounts it. Back restores the scroll through the router's saved position.
- Back without history (a deep link) goes to the logical parent
  (`compendiumParentRoute`): topic → its subsection or section → part → root.
- Legacy links keep working:
  - `/compendium/part/:partId`, `/compendium/topic/:topicId` (named topics) and
    `/compendium/question/:number` are unchanged.
  - Technical groups (`/compendium/topic/p1-s1-intro`, `…/p1-s1-ch1`):
    `resolveLegacyTopicRoute` replaces them with the question when the group has one
    question, and otherwise with the screen of the real owner
    (`/compendium/node/p1-s1-ch1`, `/compendium/node/p3-s2`).
  - Old part anchors (`/compendium/part/p1#p1-s1-ch1`, `…/p3#p3-s2`):
    `resolveLegacyPartHash` replaces them with `/compendium/node/<id>`. Any other hash
    just shows the part.

### Persistent search

`CompendiumShell` wraps every Compendium level. It mounts the only
`CompendiumSearchDock` (the existing `prayer-search-dock`) and a global results layer,
and `createCompendiumSearchSync` (`src/utils/compendiumSearchRoute.js`) controls them:

- The query text lives in the store for the session, so it stays in the dock after a
  result is opened.
- Results are open when the current route carries `?q=`. The first keystroke pushes
  `?q=` onto the current page, and further typing only replaces it. So Back from an
  opened question returns to the results, and Back from the results returns to the page.
- The page stays mounted (hidden) under the results. Clearing the query (✕, Esc or
  deleting the text) closes the results and restores the page and its scroll.
  Focusing the dock with a kept query reopens its results.
- Search is always global (`searchCompendium` over the whole index). Numbers, Belarusian
  words and hidden Russian aliases behave as described above.
- The router does not scroll when only `?q` changes.
- The dock is on every level: root, part, section, subsection, topic and question.
- Every Compendium container reserves the dock height plus the safe-area inset at the
  bottom, so the dock never covers the last question, the pager or the source line.
