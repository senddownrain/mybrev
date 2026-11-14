# Закрытыя чарнавікі малітваў

Калекцыя `prayerDrafts` — **толькі для адміністратараў** (`isAdmin()` у `firestore.rules`: `admin`, `superadmin`, legacy-UID). Святар з `priestDeviceGrants` без ролі admin доступу не мае. Чарнавікі не захоўваюцца ў `prayers`, бо старыя Flutter-кліенты чытаюць яе цалкам без фільтраў.

## Мадэль

`src/utils/prayerDraftModel.mjs` — статусы (`draft → needs_review → ready_for_publication → published | archived`), валідацыя, пошук падобных назваў (`і/i`, `ё/е`, апострафы), пабудова публічнага дакумента з чарнавіка (толькі палі для чытача, без SHA/нататак/прычын). `published` — канчатковы статус-запіс, а не другая копія тэксту.

Палі дакумента ўзгодненыя з `draftKeys()` у правілах; дадатковыя палі правілы адхіляюць. `verified` і `priestOnly` — не статус публікацыі.

## Публікацыя

`src/utils/prayerDraftActions.mjs#publishDraft` выкарыстоўвае той жа версійны пісьменнік, што і рэдактар малітваў (`prayerContentWriter.mjs`): адна транзакцыя запісвае малітву ў `prayers` або `priestProtectedPrayers` (па `priestOnly` і спадчыне катэгорый), павялічвае `priestContentControl/state.version`, ставіць `published` у чарнавіку і дадае запіс аўдыту. Правілы дадаткова патрабуюць, каб у тым жа commit існавала малітва з `sourceDraftId == id` (`existsAfter/getAfter`).

- ID публічнай малітвы дэтэрмінаваны (`d_<draftId>`) або абраны адміністратарам для замены (`replaceId` — ID, `createdAt`, спасылкі і абранае захоўваюцца).
- Паўторны клік / другая ўкладка: другая транзакцыя бачыць `published` і вяртае той жа ID (`alreadyPublished`).
- Супадзенне назвы са існуючай малітвай спыняе публікацыю, пакуль адмін не абярэ замену або не пацвердзіць.
- Публікацыя блакуецца без тэгаў, крыніцы, запісу аб правах або пры `rightsStatus: unconfirmed`.

## Аўдыт

`prayerDrafts/{id}/audit/*` — толькі стварэнне (UID, час сервера, дзеянне, статусы, версія); без паролёў і токенаў.

## Flutter

Flutter публікацыю бачыць толькі пасля звычайнага шляху змесціва (`npm run content:manifest` → `--apply`, гл. `docs/app-content-distribution.md`); чарнавікі ў Flutter-снапшот не трапляюць.

## Праверкі

`npm run test:drafts` (эмулятар Firestore, JDK 21): ролі anonymous / user / priest / unknown role / admin / superadmin / legacy; адмін без `superadmin` публікуе; два адміны адначасова → адна малітва; priest-only у абароненую калекцыю; блакіроўка змесціва; версійны канфлікт. `scripts/smoke-prayer-drafts-ui.mjs` — UI і скрыншоты (`audit-evidence/prayer-drafts/`).

## Роля admin і падстава для правоў

- Раздзел «Чарнавікі малітваў» цалкам даступны ролям `admin` і `superadmin` (а таксама legacy-адмінам). Маршруты `/admin/prayer-drafts*` і картка на `/admin` не маюць `requiresSuperAdmin`; правілы Firestore для `prayerDrafts` і публікацыі (`prayers`, `priestProtectedPrayers`, `priestContentControl`) выкарыстоўваюць `isAdmin()`, а не `managesPriests()`. Роля `admin` НЕ атрымлівае кіраванне адміністратарамі, доступам святароў і іншыя магчымасці superadmin; `user`, anonymous і святар толькі з device grant чарнавікоў не бачаць.
- Права на лічбавую публікацыю «пацверджаныя» толькі з **пісьмовай падставай** (хто, калі, які дакумент ці ліцэнзія; 10–500 сімвалаў). Галачка без падставы не дзейнічае: рэдактар не захоўвае такі статус, публікацыя заблакаваная, правілы Firestore адхіляюць `rightsStatus: confirmed` без `rightsBasis`. Сістэма сама запісвае `rightsConfirmedBy` (uid таго, хто пацвердзіў; падрабіць чужы uid нельга) і `rightsConfirmedAt`.
- Для імпарту: `rights.json` патрабуе `confirmedBy` і `basis` па кожнай крыніцы; без `basis` крыніца лічыцца непацверджанай.
- Публікацыя патрабуе яўнага `rightsStatus: confirmed` (чарнавік без статусу больш не публікуецца).
