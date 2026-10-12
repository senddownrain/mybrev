/**
 * Catholic.by Lectionary pages with a special structure (several Mass reading
 * sets, cycles, procession / Passion, ordered vigils, sequences) and the
 * corrected single-set pages. Each page has an offline fixture
 * (tests/fixtures/catholicby/<key>.html, the article body only) used by the
 * parser tests and the readings migration.
 *
 *   node scripts/liturgy/fetch-lectionary-fixtures.mjs        # refresh fixtures (network)
 */
const CB = 'https://catholic.by/3/liturgy/lectionary';

export const LECTIONARY_PAGES = Object.freeze([
  { key: 'assumption', url: `${CB}/urachystasci/5043-15-zhniunya-urachystasts-unebauzyatstsya-najsvyatsejshaj-panny-maryi` },
  { key: 'peter-paul', url: `${CB}/urachystasci/5041-29-chervenya-urachystasts-svyatykh-pyatra-i-paula-apostalau` },
  { key: 'nativity-john-baptist', url: `${CB}/urachystasci/5040-24-chervenya-urachystasts-naradzhennya-sv-yana-khrystsitselya` },
  { key: 'bonaventure', url: `${CB}/uspaminy/4948-15-lipenya-uspamin-sv-bonaventury-biskupa-i-doktara-kastsjola` },
  { key: 'clare', url: `${CB}/uspaminy/4957-11-zhniunya-uspamin-sv-klary-panny` },
  { key: 'andrew-bobola', url: `${CB}/uspaminy/4942-16-maya-uspamin-sv-andreya-baboli-svyatara-i-muchanika` },
  { key: 'all-souls', url: `${CB}/uspaminy/4972-2-listapada-uspamin-usikh-pamerlykh-vernikau` },
  { key: 'minsk-cathedral-dedication', url: `${CB}/sviaty/17068-16-sakavika-gadavina-pasvyachennya-katedralnaga-kastsjola-u-minsku` },
  { key: 'palm-sunday', url: `${CB}/post/5097-palmovaya-nyadzelya-abo-nyadzelya-muki-pana` },
  { key: 'holy-thursday-chrism', url: `${CB}/post/5100-vyaliki-chatsver-imsha-khryzma` },
  { key: 'holy-thursday-evening', url: `${CB}/tryduum/5103-vyaliki-chatsver-imsha-vyachery-pana` },
  { key: 'good-friday', url: `${CB}/tryduum/5104-vyalikaya-pyatnitsa-muki-pana` },
  { key: 'easter-vigil', url: `${CB}/tryduum/5105-paskhalnaya-vigiliya-u-svyatuyu-noch` },
  { key: 'easter-sunday', url: `${CB}/tryduum/5106-velikodnaya-nyadzelya-imsha-udzen` },
  { key: 'easter-saturday-w7', url: `${CB}/velikodny/5167-subota-vii-velikodny-tydzen` },
  { key: 'pentecost-vigil', url: `${CB}/velikodny/5172-spaslanne-dukha-svyatoga` },
  { key: 'pentecost-vigil-old', url: 'https://old.catholic.by/2/liturgy/lectionary/liturgia-velikodny/103542.html' },
  { key: 'pentecost', url: `${CB}/velikodny/5171-nyadzelya-spaslannya-dukha-svyatoga` },
  { key: 'ascension', url: `${CB}/urachystasci/5029-urachystasts-unebaushestsya-pana` },
  { key: 'christmas-eve-morning', url: `${CB}/advent/4604-24-snezhnya-zvychajny-dzen-adventu` },
  { key: 'christmas-vigil', url: `${CB}/urachystasci/5023-24-snezhnya-urachystasts-naradzhennya-pana` },
  { key: 'christmas', url: `${CB}/urachystasci/5024-25-snezhnya-urachystasts-naradzhennya-pana` },
]);

export const lectionaryPage = (key) => LECTIONARY_PAGES.find((page) => page.key === key) || null;
