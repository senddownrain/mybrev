# Ordo evidence (generated)

Normalized evidence extracted from four Belarusian diocesan calendars. **Generated — do not edit
by hand.** The raw calendars live in `.ordo-sources/` (git-ignored, never committed).

```bash
npm run ordo:extract   # python3 scripts/ordo/extract.py (adapters) + node scripts/ordo/build.mjs
npm run ordo:check     # provenance, classifications, selectors, exclusions, reproducibility
npm run ordo:docs      # re-render docs/ordo-diocesan-differences.md
npm run test:ordo
```

| File | Content |
| --- | --- |
| `evidence/<diocese>.json` | One source: `source`, `stats`, `days[]` (liturgical alignment from MyBrev's calendar code, celebrations + MyBrev identity, readings, Mass/Office descriptors with oracle flags, notes), `rules[]` (front matter / period / rubric sections), `announcements[]`, `excluded[]` (location only) |
| `notes.json` | Generalized Ordo entries: `scope`, `selector`, `category`, `effect`, `classification`, `confidence`, observed evidence |
| `diocesan-differences.json` | Cross-diocese alignment by celebration identity; `missingInMyBrev` for celebrations MyBrev lacks |
| `unresolved.json` | Parser fragments (source typos), unmapped celebrations, items needing review |

Dioceses: `minsk-mohilev` (2025–26, DOCX), `vitebsk` (2025–26, DOCX), `pinsk` (2026, PDF), `grodno` (2027, PDF).

Every item carries `SourceEvidence { file, page | paragraph, bbox (PDF), rawText }` and one of
`CONFIRMED_PERMANENT_RULE`, `LIKELY_PERMANENT_RULE`, `DIOCESAN_PROPER`, `YEAR_INSTANCE_ONLY`,
`DISPLAY_NOTE`, `NEEDS_REVIEW`. Collections, clergy birthdays / name days / ordination and death
anniversaries and the necrology are excluded at the parser and re-checked by `ordo:check`.

These files are evidence for the future resolver (stages 3–6), not runtime data yet; nothing in
the app imports them. See `docs/ordo-*.md`.
