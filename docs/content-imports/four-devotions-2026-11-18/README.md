# Four Belarusian devotions

The four prayers use `mybrev-markdown` version 1 and the existing public category «Набажэнствы» (`devotions`, tag `Набажэнства`). The title is stored separately from the Markdown body.

## Source review

All 17 printed pages were compared with the four supplied PDFs. Pages 296–298 and 302–303 were read from the page images because of their damaged text layers. Page 296 needed a comma after «маўчання». Page 298 needed the direction «і ўкленчвае» restored in section 8. The draft's corrections of three apparent print errors were retained: «Сакармэнт» on 295, «урачыстаці» on 299 and «Захаваў» in the petition on 388. The four procession stations, four Gospel references and blessing alternatives were checked in sequence. The reference to the hymn «Цябе, Бога, праслаўляем» follows the source, which only names the hymn.

Use the owner-confirmed attribution «Літургічная агенда» (Мінск, 2010) in `source`, following the registered bibliography and the existing Agenda entries for Святой Сям’і and святога Юзафа. Those records leave `sourceBook` unset. The PDF fragments have PageMaker filenames containing `Agenda` but omit the imprint page. The import manifest records the SHA-256 of each PDF and final Markdown body.

## Import and delivery

The [published Web catalog](https://ibreviaryby.web.app/public-prayers-v1.json) identified three new entries and one overlap. The [existing procession](https://ibreviaryby.web.app/prayer/Fd9rN0S9NU1mAmqb2isZ) already included the four stations and Gospel readings. Its Firestore ID and other language fields were preserved. The base and Belarusian title and text were updated with the complete version.

On 2026-11-18, the scoped Firestore dry run was followed by an atomic commit at 14:48:32 UTC. Readback verified all four text hashes. A second checked commit at 14:51:04 UTC added the Agenda attribution to the four records and verified the source and text hashes. No category was created or modified. The Firebase service account was scoped to project `ibreviaryby`.

`node scripts/validate-four-devotions.mjs` runs the offline validation. A full local snapshot can be checked with `--snapshot backups/firestore-snapshot`. An optional `--out` file contains private proposed bodies. `scripts/apply-four-devotions.mjs` checks the public catalog and the relevant live Firestore records and detects exact and partial duplicate candidates. Without `--apply` it rolls back the read transaction. With `--apply` it saves the private dry run and before images, commits using document preconditions, then verifies Firestore readback. Keep the plan files out of Git.

The public Web page reads the Hosting catalog. Flutter updates are governed by the prayer manifest and its `SAFE CONTENT PATCH` gate. The Flutter bundle is a separate release operation.
