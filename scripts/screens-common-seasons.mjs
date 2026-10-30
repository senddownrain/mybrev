/**
 * Screen evidence for the seasonal Commons (handoff phases 1 and 8), real Chromium against the real app.
 * Local only: it expects `scripts/serve-screens-emulator.mjs` (Firestore EMULATOR + Vite) to be running.
 *
 *   node scripts/screens-common-seasons.mjs <phase1|phase8> [--base http://127.0.0.1:5190] [--browser <chrome path>]
 *
 * For every scenario it navigates like a user (diocese in localStorage as Settings writes it, date route,
 * click the celebration, click the Common alternative, click the hour), saves the visible text next to the
 * screenshots and records the facts in `audit-evidence/common-seasons-final/<phase>/results.json`.
 * Expectations are written by hand from the printed volumes / the plan, never read from the generator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const phase = args[0];
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = option('base', 'http://127.0.0.1:5190');
const executablePath = option('browser', process.env.BENCHMARK_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const phaseDir = { phase1: 'phase-01', phase8: 'phase-08' }[phase];
if (!phaseDir) throw new Error('usage: screens-common-seasons.mjs <phase1|phase8>');
const out = path.resolve('audit-evidence/common-seasons-final', phaseDir);
fs.mkdirSync(out, { recursive: true });

const PROFILES = {
  'desktop-light': { width: 1280, height: 900, theme: 'light', scale: 1 },
  '411-light': { width: 411, height: 860, theme: 'light', scale: 1 },
  '390-light': { width: 390, height: 844, theme: 'light', scale: 1 },
  '390-dark': { width: 390, height: 844, theme: 'dark', scale: 1 },
  '320-dark-180': { width: 320, height: 740, theme: 'dark', scale: 1.8 },
  '320-light': { width: 320, height: 740, theme: 'light', scale: 1 },
};
const HOURS = { lectionis: 'Гадзіна чытанняў', laudes: 'Ютрань', vesper: 'Нешпары' };

const browser = await chromium.launch({ executablePath });
const results = [];

async function newPage(profileName, diocese, extra = {}) {
  const p = PROFILES[profileName];
  const context = await browser.newContext({ viewport: { width: p.width, height: p.height }, colorScheme: p.theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(({ scale, theme, diocese }) => {
    localStorage.setItem('fontSizeMultiplier', String(scale));
    localStorage.setItem('themePreference', theme);
    localStorage.setItem('ordoDiocese', diocese);
    localStorage.setItem('ordoDioceses', JSON.stringify([diocese]));
  }, { scale: p.scale, theme: p.theme, diocese });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors, p, ...extra };
}

/** date route -> celebration card -> (optional) Common alternative -> hour. Returns the visible text. */
async function openHour(page, { date, celebration, common, hour }) {
  await page.goto(`${base}/day/${date}`);
  await page.waitForFunction(() => /\S/.test(document.querySelector('main')?.innerText || '') && !/Нічога не знойдзена/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 30000 });
  if (celebration) {
    await page.getByText(celebration).first().click();
    await page.waitForURL(/\/ora\//);
  }
  if (common) await page.getByRole('button', { name: common, exact: true }).first().click();
  if (hour) {
    await page.getByText(HOURS[hour], { exact: true }).first().click();
    await page.waitForURL(new RegExp(`/${hour}$`));
    await page.waitForFunction(() => document.querySelector('main')?.innerText.length > 800, null, { timeout: 30000 });
  }
  await page.waitForTimeout(600);
  return page.evaluate(() => document.querySelector('main').innerText);
}

const safe = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
async function shots(page, id, profileName, anchorRe) {
  const files = [];
  const base0 = `${id}__${profileName}`;
  const anchor = anchorRe && typeof anchorRe !== 'function' ? page.getByText(anchorRe).first() : null;
  if (typeof anchorRe === 'function') await anchorRe(page);
  else if (anchor && await anchor.count()) await anchor.scrollIntoViewIfNeeded(); else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, `${base0}__start.png`) }); files.push(`${base0}__start.png`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, `${base0}__end.png`) }); files.push(`${base0}__end.png`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return { files, overflow };
}

/** One recorded check. `facts` is what was seen, `expected` what the volume/plan prints. */
function record(entry) {
  results.push(entry);
  console.log(`${entry.status.padEnd(4)} ${entry.id}  ${entry.profile || ''}  ${entry.note || ''}`);
}
const section = (text, from, to) => {
  const a = text.search(from);
  if (a < 0) return '';
  const rest = text.slice(a);
  const b = to ? rest.slice(1).search(to) : -1;
  return b < 0 ? rest : rest.slice(0, b + 1);
};
const has = (text, re) => (re instanceof RegExp ? re.test(text) : text.includes(re));

async function scenario({ id, label, diocese = 'minsk-mohilev', profiles = ['390-light'], expectations, ...step }) {
  for (const profileName of profiles) {
    const { context, page, errors } = await newPage(profileName, diocese);
    try {
      const text = await openHour(page, step);
      const tag = `${id}__${profileName}`;
      fs.writeFileSync(path.join(out, `${tag}.txt`), `${page.url()}\n\n${text}\n`);
      const { files, overflow } = await shots(page, id, profileName, step.anchor);
      const failed = [];
      if (profileName === (profiles[0])) for (const [name, ok] of expectations ? expectations(text) : []) if (!ok) failed.push(name);
      if (overflow > 1) failed.push(`horizontal overflow ${overflow}px`);
      if (errors.length) failed.push(`page errors: ${errors.join('; ')}`);
      record({ id, label, profile: profileName, diocese, date: step.date, url: page.url(), status: failed.length ? 'FAIL' : 'PASS', failed, files: [...files, `${tag}.txt`] });
    } catch (error) {
      record({ id, label, profile: profileName, diocese, date: step.date, status: 'FAIL', failed: [String(error.message).split('\n')[0]], files: [] });
    } finally { await context.close(); }
  }
}


// W5 expectations, written from the Proper of Paul of the Cross (own second reading and collect), the psalter of Monday
// of week I (Lauds Ps 5 / 1 Chr 29 / Ps 29, Vespers Ps 11 / Ps 15 / Eph 1) and the Sunday of week I (Lauds Ps 63 / Dan 3 / Ps 149).
const PAUL_PRAYER = /Міласэрны Божа, Ты даў святому Паўлу вялікую любоў да крыжа Твайго Сына/;
function w5Expectations(common, hour, t) {
  const fromDay = common === 'З дня';
  const checks = [
    ['own collect of Paul is shown', PAUL_PRAYER.test(t)],
    ['no generic Common prayer with the placeholder N.', !/святога N\.|святы \(святая\) N\./.test(t)],
    ['no empty-field markers', !/undefined|\[object|NaN/.test(t)],
  ];
  if (hour === 'lectionis') {
    const r1 = section(t, /ПЕРШАЕ ЧЫТАННЕ/i, /ДРУГОЕ ЧЫТАННЕ/i);
    const r2 = section(t, /ДРУГОЕ ЧЫТАННЕ/i, /ГІМН|МАЛІТВА/);
    checks.push(['own second reading (letter of Paul of the Cross) is kept', /Ліст св\. Паўла ад Крыжа, прэзбітэра/.test(r2)]);
    checks.push(['only one second reading block', (t.match(/ДРУГОЕ ЧЫТАННЕ/gi) || []).length === 1]);
    if (fromDay) checks.push(['weekday first reading (Esther 3, 1-15)', /Эстэры 3, 1-15/.test(r1)], ['no Te Deum on the weekday text', !/Цябе, Бога, праслаўляем/.test(t)]);
    if (common === 'Пра пастыраў') checks.push(['first reading of pastors (Tit 1, 7-11; 2, 1-8)', /Ціта\s*1, 7-11; 2, 1-8/.test(r1)]);
    if (common === 'Пра законнікаў') checks.push(['first reading of religious (Phil 3, 7-4, 1. 4-9)', /Філіпянаў 3, 7 – 4, 1\. 4-9/.test(r1)]);
  }
  if (hour === 'laudes') {
    if (fromDay) checks.push(['Monday week I psalmody (Ps 5, 1 Chr 29, Ps 29)', /Псальм 5, 2-10/.test(t) && /1 Кр 29, 10-13/.test(t) && /Псальм 29 \(28\)/.test(t)]);
    else checks.push(['Sunday week I psalmody in the festive Lauds (Ps 63, Dan 3, Ps 149)', /Псальм 63 \(62\)/.test(t) && /Дан 3, 57-88/.test(t) && /Псальм 149/.test(t)]);
  }
  if (hour === 'vesper') {
    if (fromDay) checks.push(['Monday week I Vespers psalmody (Ps 11, 15, Eph 1)', /Псальм 11 \(10\)/.test(t) && /Псальм 15 \(14\)/.test(t) && /Эф 1, 3-10/.test(t)]);
    else checks.push(['Common Vespers psalmody (Ps 15, 112, Rev 15)', /Псальм 15 \(14\)/.test(t) && /Псальм 112 \(111\)/.test(t) && /Ап 15, 3-4/.test(t)]);
  }
  return checks;
}

if (phase === 'phase1') {
  const FULL = ['390-light', '411-light', '390-dark', '320-dark-180', 'desktop-light'];
  // W1: Grodno 04.12.2026, anniversary of the cathedral -> church-dedication of Advent (Volume I): Ap 21, 9-27 and not 1 Pt 2, 1-17.
  await scenario({
    id: 'W1-grodno-04-12-lectionis', label: 'W1 Grodno 04.12.2026 Office of Readings', diocese: 'grodno', date: '2026-12-04',
    celebration: /Гадавіна пасвячэння катэдральнага касцёла/, hour: 'lectionis', anchor: /першае чытанне/i, profiles: FULL,
    expectations: (t) => { const r1 = section(t, /ПЕРШАЕ ЧЫТАННЕ/i, /ДРУГОЕ ЧЫТАННЕ/i); return [
      ['first reading is Ap 21, 9-27', has(r1, /Апакаліпсіса св\. апостала Яна 21, 9-27/)],
      ['not the ordinary-time 1 Pt 2, 1-17', !has(r1, /Пятра 2, 1-17/)],
      ['Advent Vol. I second reading is present', has(t, /ДРУГОЕ ЧЫТАННЕ/i)],
    ]; },
  });
  // W1 negative: other dioceses do not get the Grodno local feast.
  for (const diocese of ['minsk-mohilev', 'pinsk', 'vitebsk']) {
    const { context, page } = await newPage('390-light', diocese);
    const text = await openHour(page, { date: '2026-12-04' });
    await page.screenshot({ path: path.join(out, `W1-other-diocese-${diocese}-04-12__390-light__start.png`) });
    fs.writeFileSync(path.join(out, `W1-other-diocese-${diocese}-04-12__390-light.txt`), `${page.url()}\n\n${text}\n`);
    const ok = !/Гадавіна пасвячэння катэдральнага касцёла/.test(text);
    record({ id: `W1-neg-${diocese}`, label: `W1 ${diocese} 04.12.2026 has no Grodno local feast`, profile: '390-light', diocese, date: '2026-12-04', status: ok ? 'PASS' : 'FAIL', failed: ok ? [] : ['Grodno feast offered'], files: [`W1-other-diocese-${diocese}-04-12__390-light__start.png`, `W1-other-diocese-${diocese}-04-12__390-light.txt`] });
    await context.close();
  }
  // W2: 09.11.2026 Lateran (ordinary time, Volume III): 1 Pt 2, 1-17.
  await scenario({
    id: 'W2-09-11-lectionis', label: 'W2 09.11.2026 Lateran Office of Readings', date: '2026-11-09', celebration: /Латэранскай/, hour: 'lectionis', anchor: /першае чытанне/i,
    profiles: ['390-light', '320-dark-180'],
    expectations: (t) => { const r1 = section(t, /ПЕРШАЕ ЧЫТАННЕ/i, /ДРУГОЕ ЧЫТАННЕ/i); return [
      ['first reading is 1 Pt 2, 1-17', has(r1, /Пятра 2, 1-17/)], ['not Ap 21', !has(r1, /Апакаліпсіса/)]]; },
  });
  // W3: 16.03.2027 Minsk-Mohilev (Lent, Volume II): 1 Kgs 8, 1-4.10-13.22-30.
  await scenario({
    id: 'W3-16-03-2027-lectionis', label: 'W3 16.03.2027 Minsk-Mohilev Office of Readings', date: '2027-03-16', celebration: /Гадавіна пасвячэння катэдральнага касцёла/, hour: 'lectionis', anchor: /першае чытанне/i,
    profiles: ['390-light', '320-dark-180'],
    expectations: (t) => { const r1 = section(t, /ПЕРШАЕ ЧЫТАННЕ/i, /ДРУГОЕ ЧЫТАННЕ/i); return [
      ['first reading is 1 Kgs 8, 1-4. 10-13. 22-30', has(r1, /Валадарстваў 8, 1-4\. 10-13\. 22-30/)], ['not Ap 21', !has(r1, /Апакаліпсіса/)], ['not 1 Pt 2', !has(r1, /Пятра 2, 1-17/)]]; },
  });
  // W4: Saturday memorial of Our Lady (D-2): only on free Saturdays of Ordinary Time.
  const offered = async (diocese, date) => {
    const { context, page } = await newPage('390-light', diocese);
    const text = await openHour(page, { date });
    await page.screenshot({ path: path.join(out, `W4-${date}-${diocese}__390-light__start.png`) });
    fs.writeFileSync(path.join(out, `W4-${date}-${diocese}__390-light.txt`), `${page.url()}\n\n${text}\n`);
    await context.close();
    return { text, shot: `W4-${date}-${diocese}__390-light__start.png`, txt: `W4-${date}-${diocese}__390-light.txt` };
  };
  for (const [date, diocese, expectOffered, why] of [
    ['2026-10-24', 'minsk-mohilev', true, 'free Saturday of Ordinary Time (week 29)'],
    ['2026-10-24', 'grodno', true, 'same, Grodno'],
    ['2026-12-05', 'minsk-mohilev', false, 'Saturday of Advent week 1'],
    ['2026-12-05', 'grodno', false, 'Saturday of Advent week 1, Grodno'],
    ['2027-03-06', 'minsk-mohilev', false, 'Saturday of Lent'],
    ['2027-01-02', 'minsk-mohilev', false, 'Saturday in Christmastide'],
    ['2027-04-17', 'minsk-mohilev', false, 'Saturday of Easter'],
  ]) {
    const { text, shot, txt } = await offered(diocese, date);
    const got = /Успамін Найсв\. Панны Марыі ў суботу/.test(text);
    record({ id: `W4-${date}-${diocese}`, label: `W4 ${date} ${diocese}: Saturday memorial of Our Lady ${expectOffered ? 'offered' : 'NOT offered'} (${why})`, profile: '390-light', diocese, date, status: got === expectOffered ? 'PASS' : 'FAIL', failed: got === expectOffered ? [] : [`offered=${got}`], files: [shot, txt] });
  }
  // W4: opened Saturday memorial: Common blessed-virgin-mary text appears once (no duplicated `_mainSection` block).
  const duplicates = (t) => {
    const seen = new Map();
    for (const para of t.split(/\n{2,}/).map((x) => x.trim()).filter((x) => x.length >= 160)) seen.set(para, (seen.get(para) || 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([x]) => x.slice(0, 60));
  };
  for (const hour of ['lectionis', 'laudes', 'vesper']) {
    await scenario({
      id: `W4-24-10-saturday-mary-${hour}`, label: `W4 24.10.2026 Saturday memorial of Our Lady, ${hour}`, date: '2026-10-24', celebration: /Успамін Найсв\. Панны Марыі ў суботу/, hour,
      profiles: ['390-light', '320-dark-180'],
      expectations: (t) => [['no duplicated long paragraph', duplicates(t).length === 0, duplicates(t)], ['has hymn', /ГІМН/.test(t)]].map(([n, ok]) => [n, ok]),
    });
  }
  // W5: Paul of the Cross 19.10.2026: «З дня», «Пра пастыраў», «Пра законнікаў» x Office of Readings, Lauds, Vespers.
  for (const common of ['З дня', 'Пра пастыраў', 'Пра законнікаў']) {
    for (const hour of ['lectionis', 'laudes', 'vesper']) {
      await scenario({
        id: `W5-paul-${safe(common)}-${hour}`, label: `W5 19.10.2026 Paul of the Cross «${common}», ${hour}`, date: '2026-10-19', celebration: /Св\. Паўла ад Крыжа/, common, hour,
        profiles: common === 'Пра пастыраў' || common === 'З дня' ? ['390-light', '320-dark-180'] : ['390-light'],
        anchor: hour === 'lectionis' ? /першае чытанне/i : undefined,
        expectations: (t) => w5Expectations(common, hour, t),
      });
    }
  }

  // W5 video: switch «З дня» -> «Пра пастыраў» -> «Пра законнікаў» on the Office of Readings of Paul of the Cross.
  {
    const p = PROFILES["390-light"];
    const context = await browser.newContext({ viewport: { width: p.width, height: p.height }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block', recordVideo: { dir: path.join(out, 'video-tmp'), size: { width: p.width, height: p.height } } });
    await context.addInitScript(() => { localStorage.setItem('ordoDiocese', 'minsk-mohilev'); localStorage.setItem('ordoDioceses', '["minsk-mohilev"]'); });
    const page = await context.newPage();
    await page.goto(`${base}/day/2026-10-19`);
    await page.getByText(/Св\. Паўла ад Крыжа/).first().click();
    await page.waitForURL(/\/ora\//);
    const seen = [];
    for (const common of ['З дня', 'Пра пастыраў', 'Пра законнікаў']) {
      await page.getByRole('button', { name: common, exact: true }).first().click();
      await page.getByText('Гадзіна чытанняў', { exact: true }).first().click();
      await page.waitForURL(/\/lectionis$/);
      await page.getByText(/першае чытанне/i).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1500);
      seen.push([common, await page.evaluate(() => (document.querySelector('main').innerText.match(/ПЕРШАЕ ЧЫТАННЕ[\s\S]{0,260}/i) || [''])[0].replace(/\s+/g, ' '))]);
      await page.goBack(); await page.waitForURL(/\/ora\/[^/]+$/);
      await page.waitForTimeout(500);
    }
    const video = page.video();
    await context.close();
    fs.renameSync(await video.path(), path.join(out, 'W5-paul-switch-commons.webm'));
    fs.rmSync(path.join(out, 'video-tmp'), { recursive: true, force: true });
    const distinct = new Set(seen.map(([, text]) => text)).size === 3;
    record({ id: 'W5-video', label: `W5 video: first readings while switching: ${JSON.stringify(seen)}`, profile: '390-light', status: distinct ? 'PASS' : 'FAIL', failed: distinct ? [] : ['first readings did not change per Common'], files: ['W5-paul-switch-commons.webm'] });
  }
  fs.writeFileSync(path.join(out, 'phase1-partial.json'), JSON.stringify(results, null, 2));
}

// ---------------------------------------------------------------------------------------------------------
// Phase 8 (D-1): one picked reading of holy-women. Expectations from the printed Volume III (pp. 1580-1587):
// R1 = holy-men readings (Col 3, Rom 12, Eph 5) + Prov 31 + 1 Pt 3; R2 = Chrysostom, Augustine + the printed «Або іншае» of Pius XII.
const readingTablists = (page) => page.evaluate(() => {
  const second = [...document.querySelectorAll('main *')].find((el) => el.children.length === 0 && /^другое чытанне$/i.test(el.textContent.trim()));
  return [...document.querySelectorAll('[role=tablist]')].filter((t) => /чытання/i.test(t.getAttribute('aria-label') || '')).map((t) => ({
    field: second && (second.compareDocumentPosition(t) & 4) ? 'R2' : 'R1',
    tabs: [...t.querySelectorAll('[role=tab]')].map((b) => ({ title: b.querySelector('.alternative-tab__title')?.innerText.trim(), selected: b.getAttribute('aria-selected') === 'true' })),
    panel: document.getElementById(t.querySelector('[role=tab]').getAttribute('aria-controls'))?.innerText || '',
  }));
});
const pick = async (page, field, index) => {
  const lists = await page.$$('[role=tablist][aria-label*="чытання"]');
  const info = await readingTablists(page);
  const at = info.findIndex((i) => i.field === field);
  await (await lists[at].$$('[role=tab]'))[index].click();
  await page.waitForTimeout(300);
};
const scrollToR2 = (page) => page.evaluate(() => { const l = [...document.querySelectorAll('[role=tablist][aria-label*="чытання"]')]; (l[l.length - 1]).scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
const J = { diocese: 'grodno', date: '2027-06-08', celebration: /Ядвігі, каралевы/, common: 'Пра святых жанчынаў', hour: 'lectionis' };

if (phase === 'phase8') {
  // D1-W1: choose B -> exactly the full text of B, with its title and author; the others are not concatenated.
  for (const profileName of ['390-light', '320-dark-180', 'desktop-light']) {
    const { context, page, errors } = await newPage(profileName, J.diocese);
    const failed = []; const files = [];
    try {
      await openHour(page, J);
      const before = await readingTablists(page);
      const r2 = before.find((i) => i.field === 'R2');
      const wantR2 = [/Гамілія да кнігі Дзеяў Апосталаў.*Хрызастома/s, /Казанне св\. Аўгустына/, /Прамова папы Пія ХІІ/];
      if (!r2 || r2.tabs.length !== 3 || !wantR2.every((re, i) => re.test(r2.tabs[i].title))) failed.push(`R2 tabs: ${JSON.stringify(r2?.tabs)}`);
      const texts = [];
      for (let i = 0; i < 3; i += 1) {
        await pick(page, 'R2', i);
        const now = (await readingTablists(page)).find((x) => x.field === 'R2');
        texts.push(now.panel);
        if (now.tabs.findIndex((t) => t.selected) !== i) failed.push(`tab ${i} not selected`);
      }
      const head = (x) => x.replace(/\s+/g, ' ').trim().slice(0, 90);
      texts.forEach((x, i) => texts.forEach((y, j) => { if (i !== j && x.replace(/\s+/g, ' ').includes(head(y))) failed.push(`text ${i} contains the start of text ${j} (glued alternatives)`); }));
      if (!/Аўгустына/.test(texts[1]) || /Хрызастом/.test(texts[1])) failed.push('B (Augustine) panel has wrong author');
      if (!/Пія ХІІ|Пія XII/.test(texts[2])) failed.push('C (Pius XII) panel has no title');
      await pick(page, 'R2', 1);
      fs.writeFileSync(path.join(out, `D1-W1-grodno-08-06-2027-R2-B__${profileName}.txt`), `${page.url()}\n\nTABS ${JSON.stringify((await readingTablists(page)).map((x) => [x.field, x.tabs]), null, 1)}\n\nPANEL R2 (B)\n${texts[1]}\n`);
      const { files: f, overflow } = await shots(page, `D1-W1-grodno-08-06-2027-R2-B`, profileName, scrollToR2);
      files.push(...f, `D1-W1-grodno-08-06-2027-R2-B__${profileName}.txt`);
      if (overflow > 1) failed.push(`horizontal overflow ${overflow}px`);
      const r1 = before.find((i) => i.field === 'R1');
      const wantR1 = [/Каласянаў 3, 1-17/, /Рымлянаў 12, 1-21/, /Эфесцаў 5, 21-32/, /Прыпавесцяў 31, 10-31/, /Пятра 3, 1-6\. 8-17/];
      if (!r1 || r1.tabs.length !== 5 || !wantR1.every((re, i) => re.test(r1.tabs[i].title))) failed.push(`R1 tabs: ${JSON.stringify(r1?.tabs)}`);
      if (errors.length) failed.push(errors.join('; '));
    } catch (e) { failed.push(String(e.message).split('\n')[0]); }
    record({ id: 'D1-W1', label: 'D1-W1 Grodno 08.06.2027 Jadwiga, Common holy-women: R2 choose B -> only B; R1 five legal readings', profile: profileName, diocese: J.diocese, date: J.date, status: failed.length ? 'FAIL' : 'PASS', failed, files });
    await context.close();
  }
  fs.writeFileSync(path.join(out, 'phase8-partial.json'), JSON.stringify(results, null, 2));
}

if (phase === 'phase8') {
  const selectedOf = async (page, field) => (await readingTablists(page)).find((x) => x.field === field)?.tabs.findIndex((t) => t.selected) ?? null;
  const run = async (id, label, profileName, diocese, body) => {
    const { context, page, errors } = await newPage(profileName, diocese);
    const failed = []; const files = [];
    try { await body({ page, context, failed, files }); } catch (e) { failed.push(String(e.message).split('\n')[0]); }
    if (errors.length) failed.push(errors.join('; '));
    record({ id, label, profile: profileName, diocese, status: failed.length ? 'FAIL' : 'PASS', failed, files });
    await context.close();
  };
  const dump = (page, name, text) => { fs.writeFileSync(path.join(out, `${name}.txt`), `${page.url()}\n\n${text}\n`); return `${name}.txt`; };

  // D1-W2: Ordinary Time (Volume III) on real celebrations. Advent/Christmas/Lent/Easter have no celebration with holy-women in the Ordo
  // (scan of every day, every celebration and every Common button) -> NOT APPLICABLE on screen, see the data tests in the report.
  await run('D1-W2-monica-R1', 'D1-W2 Minsk 27.08.2026 Monica, Common holy-women (Vol. III): R1 five readings, no R2 selector (own R2)', '390-light', 'minsk-mohilev', async ({ page, failed, files }) => {
    const text = await openHour(page, { date: '2026-08-27', celebration: /Св\. Монікі/, common: 'Пра святых жанчынаў', hour: 'lectionis' });
    const lists = await readingTablists(page);
    const r1 = lists.find((x) => x.field === 'R1');
    if (!r1 || r1.tabs.length !== 5) failed.push(`R1 tabs ${JSON.stringify(r1?.tabs)}`);
    if (lists.some((x) => x.field === 'R2')) failed.push('R2 selector shown although Monica has her own second reading');
    files.push(dump(page, 'D1-W2-monica-R1__390-light', text));
    files.push(...(await shots(page, 'D1-W2-monica-R1', '390-light', /першае чытанне/i)).files);
  });
  await run('D1-W2-jane-frances', 'D1-W2 Minsk 12.08.2026 Jane Frances de Chantal, Common holy-women (Vol. III): R1 five readings, own R2 (no selector)', '390-light', 'minsk-mohilev', async ({ page, failed, files }) => {
    const text = await openHour(page, { date: '2026-08-12', celebration: /Жаны Франсуазы/, common: 'Пра святых жанчынаў', hour: 'lectionis' });
    const lists = await readingTablists(page);
    if (lists.find((x) => x.field === 'R1')?.tabs.length !== 5) failed.push(`R1 tabs ${JSON.stringify(lists)}`);
    if (lists.some((x) => x.field === 'R2')) failed.push('R2 selector over own second reading');
    files.push(dump(page, 'D1-W2-jane-frances__390-light', text));
    files.push(...(await shots(page, 'D1-W2-jane-frances', '390-light', /першае чытанне/i)).files);
  });

  // Found on screen and fixed: the religious R1 responsory variant must not be offered as a second reading.
  await run('D1-W2-religious-R1-responsory', 'D1-W2/W5 Minsk 19.10.2026 Paul of the Cross «Пра законнікаў»: R1 is ONE reading with both responsories, no pseudo-choice', '390-light', 'minsk-mohilev', async ({ page, failed, files }) => {
    const text = await openHour(page, { date: '2026-10-19', celebration: /Св\. Паўла ад Крыжа/, common: 'Пра законнікаў', hour: 'lectionis' });
    const r1 = section(text, /ПЕРШАЕ ЧЫТАННЕ/i, /ДРУГОЕ ЧЫТАННЕ/i);
    if ((await readingTablists(page)).some((x) => x.field === 'R1')) failed.push('R1 selector shown for a single reading');
    if (!/Філіпянаў 3, 7 – 4, 1\. 4-9/.test(r1) || !/Пра законніцу: Пс 45 \(44\), 2/.test(r1)) failed.push('reading or the printed responsory variant missing');
    files.push(dump(page, 'D1-W2-religious-R1-responsory__390-light', text));
    files.push(...(await shots(page, 'D1-W2-religious-R1-responsory', '390-light', /першае чытанне/i)).files);
  });

  // D1-W3: own Proper reading keeps priority; «З дня» and the other celebrations of the day stay a separate selector.
  await run('D1-W3', 'D1-W3 Minsk 27.08.2026 Monica: own R2 beats the Common, «З дня» and day variants are separate', '390-light', 'minsk-mohilev', async ({ page, failed, files }) => {
    await page.goto(`${base}/day/2026-08-27`);
    await page.waitForFunction(() => /Св\. Монікі/.test(document.querySelector('main')?.innerText || ''));
    const dayCards = await page.evaluate(() => document.querySelector('main').innerText);
    files.push(dump(page, 'D1-W3-day-cards__390-light', dayCards));
    await page.screenshot({ path: path.join(out, 'D1-W3-day-cards__390-light.png') }); files.push('D1-W3-day-cards__390-light.png');
    const text = await openHour(page, { date: '2026-08-27', celebration: /Св\. Монікі/, common: 'Пра святых жанчынаў', hour: 'lectionis' });
    const r2 = section(text, /ДРУГОЕ ЧЫТАННЕ/i, /ГІМН|МАЛІТВА/);
    if (!/Аўгустына|Монік/.test(r2)) failed.push('own second reading of Monica missing');
    if (/Хрызастом|Пія ХІІ/.test(r2)) failed.push('a Common alternative displaced or joined the own second reading');
    if ((await readingTablists(page)).some((x) => x.field === 'R2')) failed.push('R2 selector over an own reading');
    files.push(dump(page, 'D1-W3-monica-lectionis__390-light', text));
    files.push(...(await shots(page, 'D1-W3-monica-R2', '390-light', (pg) => pg.getByText(/другое чытанне/i).first().scrollIntoViewIfNeeded())).files);
    await page.goto(`${base}/day/2026-08-27`);
    await page.getByText(/Св\. Монікі/).first().click(); await page.waitForURL(/\/ora\//);
    const buttons = await page.$$eval('main button', (l) => l.map((e) => e.innerText.trim()));
    if (!buttons.includes('З дня') || !buttons.includes('Пра святых жанчынаў')) failed.push(`Common buttons ${JSON.stringify(buttons)}`);
  });

  // D1-W4: pick B, then change context; the pick must not leak.
  await run('D1-W4', 'D1-W4 Grodno 08.06.2027 Jadwiga: B survives reload/back/forward in its own context, is not applied to other days/celebrations/Commons/dioceses', '390-light', 'grodno', async ({ page, failed, files }) => {
    await openHour(page, J);
    await pick(page, 'R2', 1);
    await pick(page, 'R1', 3);
    const url = page.url();
    if (await selectedOf(page, 'R2') !== 1) failed.push('B not selected after click');
    await page.reload(); await page.waitForFunction(() => document.querySelectorAll('[role=tab]').length > 0);
    if (await selectedOf(page, 'R2') !== 1) failed.push('reload (same tab/session): B not kept');
    await page.goto(`${base}/day/2027-06-08`); await page.waitForTimeout(800);
    await page.goBack(); await page.waitForFunction(() => document.querySelectorAll('[role=tab]').length > 0);
    if (page.url() !== url || await selectedOf(page, 'R2') !== 1) failed.push('browser Back: B not kept in its context');
    await page.goForward(); await page.waitForTimeout(500); await page.goBack(); await page.waitForFunction(() => document.querySelectorAll('[role=tab]').length > 0);
    if (await selectedOf(page, 'R2') !== 1) failed.push('browser Forward/Back: B lost');
    if (await selectedOf(page, 'R1') !== 3) failed.push('R1 pick (Prov 31) lost');
    // another Grodno holy-women day / another celebration: default.
    const other = await openHour(page, { date: '2026-08-12', celebration: /Жаны Франсуазы/, common: 'Пра святых жанчынаў', hour: 'lectionis' });
    if (await selectedOf(page, 'R1') !== 0) failed.push('R1 pick leaked into Jane Frances 12.08.2026');
    files.push(dump(page, 'D1-W4-other-celebration-default__390-light', other));
    // a different Office option of the same celebration («З дня» instead of the Common): default.
    await openHour(page, { ...J, common: 'З дня' });
    const lists = await readingTablists(page);
    if (lists.some((x) => x.tabs.findIndex((t) => t.selected) > 0)) failed.push('pick leaked into «З дня» of the same celebration');
    // the same date in another diocese: the Jadwiga memorial is Grodno-only.
    const mm = await newPage('390-light', 'minsk-mohilev');
    await mm.page.goto(`${base}/day/2027-06-08`); await mm.page.waitForTimeout(2500);
    const mmText = await mm.page.evaluate(() => document.querySelector('main').innerText);
    if (/Ядвігі, каралевы/.test(mmText)) failed.push('Jadwiga offered in Minsk-Mohilev');
    files.push(dump(mm.page, 'D1-W4-minsk-08-06-2027__390-light', mmText));
    await mm.context.close();
    // a new tab/session starts with the default (session-scope contract).
    const fresh = await newPage('390-light', 'grodno');
    await openHour(fresh.page, J);
    if (await selectedOf(fresh.page, 'R2') !== 0) failed.push('new session did not start with the default reading');
    await fresh.context.close();
    // the pick follows the same context back: returning gives B again.
    await openHour(page, J);
    if (await selectedOf(page, 'R2') !== 1) failed.push('returning to the same celebration: B not restored');
    await page.screenshot({ path: path.join(out, 'D1-W4-b-restored__390-light.png') }); files.push('D1-W4-b-restored__390-light.png');
  });

  // D1-W5: keyboard, focus, no overlap, 320/390/desktop, light/dark, 180%.
  for (const profileName of ['320-light', '320-dark-180', '390-light', '390-dark', 'desktop-light']) {
    await run('D1-W5-selector', 'D1-W5 Grodno 08.06.2027 five-tab selector: keyboard, focus, no clipping, no horizontal scroll', profileName, 'grodno', async ({ page, failed, files }) => {
      await openHour(page, J);
      const geo = await page.evaluate((vw) => [...document.querySelectorAll('[role=tab]')].map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, ov: b.scrollWidth - b.clientWidth }; }).filter((g) => g.l < -0.5 || g.r > vw + 0.5 || g.ov > 1), page.viewportSize().width);
      if (geo.length) failed.push(`tabs clipped: ${JSON.stringify(geo)}`);
      const lists = await page.$$('[role=tablist][aria-label*="чытання"]');
      const firstTab = (await lists[0].$$('[role=tab]'))[0];
      await firstTab.focus();
      await page.keyboard.press('ArrowDown');
      if (await selectedOf(page, 'R1') !== 1) failed.push('ArrowDown did not move the selection');
      await page.keyboard.press('End');
      if (await selectedOf(page, 'R1') !== 4) failed.push('End did not select the last reading');
      await page.keyboard.press('Home');
      if (await selectedOf(page, 'R1') !== 0) failed.push('Home did not select the first reading');
      const focusVisible = await page.evaluate(() => { const a = document.activeElement; return a?.getAttribute('role') === 'tab' && getComputedStyle(a).outlineStyle !== 'none'; });
      if (!focusVisible) failed.push('keyboard focus ring not visible on the active tab');
      const roving = await page.$$eval('[role=tablist][aria-label*="чытання"]', (l) => l.map((t) => [...t.querySelectorAll('[role=tab]')].filter((b) => b.tabIndex === 0).length));
      if (!roving.every((n) => n === 1)) failed.push(`roving tabindex ${JSON.stringify(roving)}`);
      await pick(page, 'R1', 3);
      files.push(...(await shots(page, 'D1-W5-selector-R1-Prov31', profileName, (pg) => pg.evaluate(() => document.querySelector('[role=tablist][aria-label*="чытання"]').scrollIntoView({ block: 'start' })))).files);
      const sel = await readingTablists(page);
      if (!/Прыпавесцяў 31/.test(sel[0].tabs[3].title) || !sel[0].tabs[3].selected) failed.push('Prov 31 not selected');
      if (!/Прыпавесцяў[^\n]*31, 10-31/.test(sel[0].panel.slice(0, 300))) failed.push('Prov 31 panel text not shown');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) failed.push(`horizontal overflow ${overflow}`);
    });
  }
  await run('D1-W5-single', 'D1-W5 single legal reading (Monica own R2): no selector', '320-dark-180', 'minsk-mohilev', async ({ page, failed, files }) => {
    await openHour(page, { date: '2026-08-27', celebration: /Св\. Монікі/, common: 'Пра святых жанчынаў', hour: 'lectionis' });
    if ((await readingTablists(page)).some((x) => x.field === 'R2')) failed.push('selector over a single reading');
    files.push(...(await shots(page, 'D1-W5-single-monica-R2', '320-dark-180', (pg) => pg.getByText(/другое чытанне/i).first().scrollIntoViewIfNeeded())).files);
  });
  fs.writeFileSync(path.join(out, 'phase8-partial.json'), JSON.stringify(results, null, 2));
}

await browser.close();
const failed = results.filter((r) => r.status === 'FAIL');
fs.writeFileSync(path.join(out, `results-${phase}.json`), JSON.stringify(results, null, 2));
console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
