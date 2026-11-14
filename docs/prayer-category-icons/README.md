# Значкі катэгорый малітваў (`iconKey`)

Адзіны кантракт для Web (`mybrev`) і Flutter (`ibreviarybyapp`). Захоўваецца толькі `iconKey` (стабільны семантычны ключ, 48 дазволеных значэнняў; спіс і подпісы — `src/constants/prayerCategoryIcons.js`).
36 значкаў — Phosphor (Web: `@phosphor-icons/vue`, Flutter: `phosphor_flutter`), 12 — уласныя SVG (`src/assets/category-icons/*.svg`, `viewBox 0 0 24 24`, `currentColor`, stroke 1.5), адны і тыя ж файлы ў абодвух праграмах.

| Дзе | Што |
|---|---|
| Firestore `prayerCategories` / `priestProtectedCategories` | неабавязковае поле `iconKey` (глабальныя катэгорыі; публічныя і абароненыя не змешваюцца) |
| Web localStorage `personalPrayerCategories` | `iconKey` у кожным запісе; адна міграцыя «пустое → падказанае» |
| Flutter Hive `UserCategory` | `iconKey` у `toMap/fromMap` |
| Flutter bundle | поле праходзіць як ёсць (`scripts/content/lib/app-content.mjs` не фільтруе палі), `schemaVersion` не мяняецца |

## Сінхранізацыя з Flutter
```bash
npm run sync:category-icons -- ../ibreviarybyapp   # catalog.json + 12 SVG + test/fixtures/prayer_category_icon_vectors.json
CATEGORY_ICONS_FLUTTER_DIR=../ibreviarybyapp npm run test:category-icons   # праверка поўнага супадзення
```

## Існуючыя глабальныя катэгорыі (read-only snapshot `live-20261113`, 9 публічных + 1 абароненая)
| ID | Назва | iconKey | Крыніца |
|---|---|---|---|
| `mary` | Марыйныя | `virgin-mary` | абавязковае (seed) |
| `litanies` | Літаніі | `litany` | абавязковае (seed) |
| `novenas` | Навэнны | `novena` | абавязковае (seed) |
| `devotions` | Набажэнствы | `church` | агульная назва, нейтральны значок |
| `HnibKjwimvddbXnhoary` | Крыжовы шлях | `crucifix` | па назве |
| `m3CFvwPfWksxFkIIiVoP` | Да святых | `saint-halo` | па назве/тэгу |
| `m7OMF6Hqiykw36idPNU0` | За памерлых | `candle` | па назве |
| `O2L514ta7IVCf2VcEKkh` | Розныя | `prayer` | неадназначна → нейтральная «Малітва» |
| `qUmzRwzqIfSPHc2eZURa` | Кансэкраванае жыццё | `vocation` | па назве |
| `gMzVAGRUogiZa2MAxpr4` (`priestProtectedCategories`) | Для святара | `cross` | неадназначна → нейтральны «Крыж» |

## Міграцыя Firestore (НЕ ПРЫМЕНЕНА)
Дапісвае толькі `iconKey` (без іншых палёў), у той калекцыі, дзе дакумент ужо ляжыць; дакумент з валідным `iconKey` прапускаецца (ідэмпатэнтна); у адной транзакцыі правярае, што дакументы ўсё яшчэ існуюць, і павялічвае `priestContentControl/state.version`.
```bash
# dry-run: чытае толькі лакальны snapshot, піша plan.json + backup змяняемых дакументаў
node scripts/migrate-prayer-category-icons.mjs --snapshot <dir-with-prayerCategories+priestProtectedCategories> --out backups/prayer-category-icons
# прымяненне ў рабочую базу (толькі па дазволе ўладальніка, патрэбны service account)
node scripts/migrate-prayer-category-icons.mjs --snapshot <dir> --apply --service-account <key.json> --i-understand-this-writes-production
# праверка чытаннем
node scripts/migrate-prayer-category-icons.mjs --snapshot <dir> --verify --service-account <key.json>
```
Пасля запісу змена трапляе ў Flutter праз звычайную публікацыю manifest (`scripts/content/publish-manifest.mjs`).
