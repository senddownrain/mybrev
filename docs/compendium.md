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
- `src/utils/compendiumNavigation.js` derives source headings and the inline Part
  outline from that index (see "UI" below). The canonical schema is unchanged.

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

The normal path is `/compendium` → `/compendium/part/:partId` →
`/compendium/question/:number`. The root keeps four part cards. Opening a
part immediately renders every question of that part in canonical order. The
question reader keeps adjacent question prev/next and its central **Да часткі**
button links to the same part at the current question.

`buildCompendiumNavigation(index)` derives the source heading tree and question
placements from the canonical dataset. `buildPartReadingOutline(index, partId)`
then creates one display stream per part, cached by index and part id:

```text
sectionHeading → question → subsectionHeading → leadCitations → question
→ topicHeading → subtopicHeading → question …
```

Only real source headings are displayed. `sectionHeading` uses
`РАЗДЗЕЛ`; `subsectionHeading` uses `ПАДРАЗДЗЕЛ` generated from the
chapter number through `compendiumLevelLabel`. The canonical
`chapterLabel: "ГЛАВА ПЕРШАЯ"` remains untouched. Named topics have only
their source title; `subtopicTitle` is emitted when its value changes.
Technical `intro`, `unit`, and `group` IDs, and question ranges, are
never visible headings. Unit and topic `leadCitations` remain immediately
after their owning heading and before its first question. All questions
use the same row component style and open the individual reader.

The four streams have 217, 139, 177, and 65 questions. Together they contain
all 598 canonical numbers exactly once. Only the selected part is rendered;
other part streams are built on demand. No external search or virtualization
library is used.

### Anchors and old links

Headings use their deterministic source IDs, for example `#p1-s1`,
`#p1-s1-ch1`, and `#p1-s1-ch2-t1`. Questions use the canonical
`#q079` form. The Part view scrolls to the anchor once its lazy data has
rendered. Its CSS `scroll-margin-top` keeps the target clear of the app bar.
Part links with old heading hashes now open those inline headings directly.

`/compendium/node/:nodeId` and `/compendium/topic/:topicId` remain
registered solely for compatibility. `CompendiumLegacy.vue` replaces them
with the relevant Part route and anchor, preserving the search query. Real
section, subsection, and topic IDs target their heading. Technical groups
target their first question; old topic hashes such as
`#compendium-q-81` target that question when it belongs to the group.
Unknown IDs show a not-found message. Reader context crumbs also point to
these inline anchors; they never open another hierarchy screen.

### Persistent search and Back

`CompendiumShell` mounts one fixed search dock across root, Part, question,
and compatibility redirects. Search remains global over all 598 questions,
with numeric lookup and hidden RU→BE aliases. Query text lives in the store.
Opening results adds `?q=` to the current route; subsequent typing replaces
that entry. The underlying page stays mounted. A result opens the question;
Back returns to results. Clearing the query closes results and restores the
same Part page and scroll offset. The router does not reset scroll for a
query-only change. Part and reader containers reserve bottom space for the dock.

The app bar uses browser history when available. For a direct legacy link
without history, its fallback goes to the matching Part anchor. The reader's
**Да часткі** button always links to the current question's Part anchor.

### Styling

The Part stream uses existing Vuetify list items, `prayers-list.css`,
`compendium.css`, theme tokens, and the app's spacing and radii.
`РАЗДЗЕЛ` is the strongest inline divider, `ПАДРАЗДЗЕЛ` the second,
named topics the third, and subtopics are smaller italic headings.
Structural headings have no chevrons and are not links. Dark and light
themes use the same existing tokens.

### Regression coverage

`tests/compendium-hierarchy.test.mjs` checks canonical flattening,
all 598 numbers, heading order, labels, citations, subtopic transitions,
legacy targets, reader links, and search restoration. It pins unusual
placements including q1–5, q79–80, q218–220, q250–251, q295, q321,
q357, q434–441, q534–535, q557, q567–568, and Part IV Section II
without chapters. `tests/compendium-navigation.test.mjs` checks route
wiring, shell, source attribution, Back fallback, and theme based styles.
