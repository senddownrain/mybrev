# Імпарт афіцыйных тэкстаў і «Бог Добры»

Інструменты ў `scripts/prayer-import/`. **Dry-run па змаўчанні.** Ніякіх запісаў у production, deploy або publish без асобнага ўзгаднення плана.

Карпусы кніг (поўны тэкст) і справаздачы dry-run жывуць толькі ў ігнараваным `backups/prayer-import/`; у git трапляюць код, тэсты, `sources.json` (назвы кніг і © без тэксту) і дакументацыя.

## Крыніцы і правы

`sources.json` — кніга, выданне і правы па кожным `sourceId` (з `schemas/source_priority_and_rights.json` пакета). Кожны тэкст атрымлівае `source` («Кніга (месца, год), с. N. © …»), `copyrightNotices`, `sourceId`, `sourceEntryId`. **Права на публічную лічбавую публікацыю не пацверджана**: усе запісы `rightsStatus: unconfirmed`; `apply` прапускае публічныя аперацыі крыніцы, пакуль у файле правоў няма `confirmedBy` і падставы.

## Першы заход (афіцыйны канон)

```bash
node scripts/prayer-import/canon-import.mjs plan --official <Official_8_PDF_Claude_structured.zip|каталог> \
  --snapshot backups/firestore-snapshot-static [--snapshot <другі>] [--out backups/prayer-import/canon-…]
```

Для кожнага з 238 запісаў адзін маршрут: `CREATE`, `REPLACE_KEEP_ID` (замена канонічнай рэдакцыяй са старым ID, `createdAt`, `verified`, `priestOnly`, іншымі мовамі), `REVIEW_AMBIGUOUS` (закрыты чарнавік у `prayerDrafts`) або `PRESERVE_STRUCTURE` (9 груп-загалоўкаў дзён/святых — не малітвы).

- **Супастаўленне** (`lib/matching.mjs`): назва (`і/i`, `ё/е`, апострафы) знаходзіць кандыдатаў, а тэкст (біграмы слоў) пацвярджае, што гэта тая ж малітва. Літанія ніколі не супадае з навэннай. Аднолькавая назва з вельмі розным тэкстам, некалькі аднолькавых назваў без выразнага лідара, падобная назва без пацверджання тэкстам → `REVIEW_AMBIGUOUS`. Рэдакцыі не параўноўваюцца па якасці.
- **Не поўныя** (`needs_review`, `partial`) і абрады → чарнавікі: абрады — выпіскі з кніг, іх замена патрабуе жывой структуры абраду і рашэння рэдактара (заўвагі Крэміса да Хросту пп. 16–17 не вырашаюцца аўтаматычна).
- **Тэгі** (`lib/tags.mjs`): толькі існуючыя (NFC/casefold/апострафы), тып (Літанія / Навэнна), тэмы па назве, тэгі старой малітвы (без дублікатаў). Адзіны прапанаваны новы агульны тэг — `Вяночак`; ён **не ствараецца**, а толькі запісваецца ў `proposed_new_tags.csv`.
- **Канвертар** (`lib/blocks-to-markdown.mjs`): `blocks/runs` → `mybrev-markdown` без HTML. Радкі літаній захоўваюцца як радкі; курсіў/тлусты; `:::rubric` для рубрык; меткі К./Н./Ц.; нумараваныя спісы; загалоўкі дзён (`##`); `* * *` → гарызантальная рыса; спасылкі на іншыя малітвы → `/prayer/<id>` толькі для запланаваных мэт. **Чырвоны колер** у Markdown не перадаецца: у змешаных блоках чырвоная частка становіцца тлустай (лічыльнік у `migration_qa.md`). Адзінкавая літара ў слове (памылка набору) без выдзялення.

Вынікі (`planned_operations.json` без поўных тэкстаў, `payloads/` з тэкстамі, `old_to_new_ids.csv`, `duplicates_review.csv`, `source_coverage.csv`, `tag_mapping.csv`, `proposed_new_tags.csv`, `proposed_new_categories.csv`, `migration_qa.md`) і `planSha256`.

## Backup → план па жывой базе → apply → rollback

1. **Backup (read-only)** і аналіз па ім:
   `npm run db:backup -- --collection prayers --collection priestProtectedPrayers --collection prayerCategories --collection priestProtectedCategories --collection priestContentControl --output backups/prayer-import/live-<дата> --require-new-output` (патрэбны ключ сэрвіснага акаўнта, у рэпазіторый не кладзецца).
2. `canon-import.mjs plan … --snapshot backups/prayer-import/live-<дата>` → `planSha256`.
3. Уладальнік правярае справаздачы і пацвярджае правы (`rights.json`: `{ "<sourceId>": { "confirmedBy": "…", "basis": "…" } }`).
4. `node scripts/prayer-import/apply.mjs apply --plan <каталог> --approve-sha <planSha256> --rights rights.json --backup-dir backups/prayer-import/applied --project <id> --service-account <файл> --i-understand-this-writes-production`.
   Праверкі: хэш плана і payload-аў, жывыя дакументы супадаюць з dry-run (`oldFingerprint`), lock `priestContentControl/state`, партыі ≤200, прыватны backup кожнага змененага дакумента, ідэмпатэнтнасць, аднаўленне пасля перапынку.
5. `apply.mjs rollback --backup <файл> --project <id> …` аднаўляе змененыя дакументы і выдаляе створаныя.
6. Пасля — `npm run content:manifest` (AGENTS.md); да гэтага змены не трапляюць у Flutter.

Эмулятар: `npm run test:import` (JDK 21).

## Рэдакцыйныя рашэнні (14.11.2026)

`scripts/prayer-import/editorial-decisions.json` — канчатковыя рашэнні ўладальніка, якія чытае `canon-import.mjs plan`:
- `titleOverrides`: тры розныя «Малітва за Айчыну» атрымліваюць заўвагу ў загалоўку (паводле а. Пятра Скаргі; паводле св. Яна Паўла ІІ; чытаецца на заканчэнне года);
- `duplicateOf`: малітва да арханёла Рафала, надрукаваная двойчы з аднолькавым тэкстам і адрасатам, ствараецца адзін раз (`SKIP_DUPLICATE`); малітва да св. Рафала Каліноўскага — іншы адрасат, яе нельга зліваць;
- `approvedTitleChanges`: толькі пяць адобраных змен назваў; любая іншая змена назвы пры `REPLACE_KEEP_ID` перапыняе план;
- `allowedNewTags`: `Вяночак`; `holdAsDrafts`: тры абрады застаюцца ў закрытых чарнавіках.

Гэта рэдакцыйнае пагадненне, а **не** юрыдычнае пацверджанне правоў на лічбавую публікацыю: яно жыве асобна ў `rights.json` (`confirmedBy` па кожнай крыніцы).

## Другі заход: «Бог Добры» (Пінск, 2022) — толькі чарнавікі

```bash
node scripts/prayer-import/bog-import.mjs plan --bog <Bog_Dobry_2022_Codex_structured.zip|каталог> \
  --official <Official_8_PDF_Claude_structured.zip|каталог> --snapshot <каталог> [--out <каталог>]
```

План першага заходу будуецца ў памяці, таму «ужо ёсць» правяраецца супраць **фінальнага кананічнага набору** + жывых малітваў + існуючых чарнавікоў, а не супраць старой базы.

Для кожнага з 707 запісаў адзін вынік:

- **EXCLUDE**: песні, раздзелы, катэхізіс, гадзінкі (office), тытул/выходныя даныя, артыкулы, табліцы; не-беларускія тэксты (pl/la — рашэнне рэдактара); парадкі сакрамэнтаў (канкурыруюць з афіцыйнымі абрадамі / Імшой); памылкова тыпізаваныя («Абавязковыя святы», «Песні жальбы»).
- **ALREADY_EXISTS**: тэкст ужо ёсць у каноне/базе (біграмы, укладзеная малітва) або паўтараецца ў самой кнізе.
- **UNIQUE_DRAFT**: сапраўды новы тэкст → адзін чарнавік `status: draft`, `origin: bog_dobry`.
- **REVIEW**: падобная малітва без пацверджання, QA-флаг парсера, даведка замест малітвы, абрад, вялікае набажэнства → чарнавік `status: needs_review`, `origin: disputed`.

Кожны чарнавік: кніга, старонкі, `originalEntryId`, SHA кнігі, правы, тэгі з існуючых, катэгорыі па тэгах, `possibleDuplicateIds`. План мае `draftsOnly: true`, і `apply.mjs` для такога плана **не піша ў публічныя калекцыі** нават з файлам правоў. Публікацыя — толькі ўручную адміністратарам у «Чарнавіках малітваў» пасля пацверджання правоў у рэдактары.

Справаздачы: `bog_dobry_drafts.csv`, `excluded_bog_dobry.csv`, `duplicates_review.csv`, `source_coverage.csv`, `tag_mapping.csv`, `proposed_new_tags.csv`, `proposed_new_categories.csv`, `old_to_new_ids.csv`, `migration_qa.md`, `planned_operations.json`.
