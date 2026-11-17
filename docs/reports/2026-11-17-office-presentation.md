# Office presentation verification — 2026-11-17

Shared display-only renderer in Reading, Lectio and Resp separates structural
labels from Scripture references and annotates response turns. Source fields,
verse numbering, asterisks and editorial plans are unchanged. CSS keeps references
in the reader font, normal case/weight and right aligned, wrapping below labels.
Response spacing is scoped to these reading components; hymn/psalm strophes retain
their spacing. The common heading rule follows legacy rules to prevent overrides.

Local verification: targeted heading/HTML/presentation tests, ESLint and production
build passed. `node scripts/smoke-office-presentation.mjs` passed 120 real-route
cases: laudes, lectionis, vesper, sext × light/dark/marian × 320/360/390/768/1440 px
× 100/200% text. Checks include computed heading typography, normal reference case
and weight, right alignment, reference wrapping below the heading, zero response
margins/padding and no horizontal overflow. Fixture HTML covers p/div/br, short and
long responsories and both example references. External requests were blocked;
Firebase reads/writes: 0. Evidence is retained privately in outputs/office-presentation.

CI, merge, Hosting release and published-site readback are recorded in the final
execution report after those actions actually complete.
