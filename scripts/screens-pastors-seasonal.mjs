/**
 * Screen evidence for the Common of Pastors hymn in every season (Advent, Christmas, Lent, Easter, Ordinary
 * time), real Chromium against the real app. Local only: expects `scripts/serve-screens-emulator.mjs`
 * (Firestore EMULATOR + Vite, SCREENS_PROPER=repo) to be running.
 *
 *   node scripts/screens-pastors-seasonal.mjs [--base http://127.0.0.1:5190] [--browser <chrome path>]
 *
 * Writes screenshots, the visible text and results.json to
 * `audit-evidence/common-seasons-final/pastors-seasonal/`. The expected stanzas are typed by hand from the
 * printed volumes (Lauds hymn of the Common of Pastors), never read from the generator or the templates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const base = option('base', 'http://127.0.0.1:5190');
const executablePath = option('browser', process.env.BENCHMARK_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const out = path.resolve('audit-evidence/common-seasons-final/pastors-seasonal');
fs.mkdirSync(out, { recursive: true });

// Lauds hymn, volume text.
const LINES = {
  opening: 'Гімнам пастыра праславім,',
  pope: 'Ён з Пятровага пасаду',
  bishop: 'Святаром быў для народу',
  priest: 'Ён настаўнікам быў слаўным,',
  endingFirst: 'Просім, каб яго малітва',
  endingLast: 'Ён кіруе цэлым светам. Амэн.',
  many: 'Святары Найвышэйшага Бога',
  manyLast: 'За любоў і за радасць збаўлення. Амэн.',
};
const ROLE_LABEL = { pope: 'Пра Папу', bishop: 'Пра біскупа', priest: 'Пра прэзбітэра', many: 'Пра некалькіх пастыраў' };
const SCENARIOS = [
  { id: 'advent-xavier-priest', season: 'Advent', date: '2026-12-03', celebration: /Францішка Ксавэрыя/, role: 'priest' },
  { id: 'advent-xavier-pope-chosen', season: 'Advent', date: '2026-12-03', celebration: /Францішка Ксавэрыя/, role: 'pope', choose: true },
  { id: 'advent-xavier-many-chosen', season: 'Advent', date: '2026-12-03', celebration: /Францішка Ксавэрыя/, role: 'many', choose: true },
  { id: 'christmas-raymond-priest', season: 'Christmas', date: '2027-01-07', celebration: /Раймунда/, role: 'priest' },
  // Lent: in 2026/27 the only Pastors celebrations are commemorations (Patrick 17.03, Cyril 18.03), which keep the
  // weekday hours and offer no Common choice, so the Lenten variant has no screen path; it is covered by tests/pastors-hymns.test.mjs.
  { id: 'easter-anselm-bishop', season: 'Easter', date: '2027-04-21', celebration: /Анзэльма/, role: 'bishop' },
  { id: 'ordinary-paul-priest', season: 'Ordinary time', date: '2026-10-19', celebration: /Св\. Паўла ад Крыжа/, role: 'priest' },
];
const PROFILES = { '390-light': { width: 390, height: 844, theme: 'light' }, 'desktop-light': { width: 1280, height: 900, theme: 'light' } };

const browser = await chromium.launch({ executablePath });
const results = [];
for (const s of SCENARIOS) {
  for (const [profileName, p] of Object.entries(PROFILES)) {
    const context = await browser.newContext({ viewport: { width: p.width, height: p.height }, colorScheme: p.theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(() => { localStorage.setItem('ordoDiocese', 'minsk-mohilev'); localStorage.setItem('ordoDioceses', '["minsk-mohilev"]'); });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const failed = [];

    try {
      await page.goto(`${base}/day/${s.date}`);
      await page.waitForFunction(() => /\S/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 30000 });
      await page.getByText(s.celebration).first().click();
      await page.waitForURL(/\/ora\//);
      await page.getByRole('button', { name: 'Пра пастыраў', exact: true }).first().click();
      await page.getByText('Ютрань', { exact: true }).first().click();
      await page.waitForURL(/\/laudes$/);
      await page.waitForFunction(() => document.querySelector('main')?.innerText.length > 800, null, { timeout: 30000 });
      if (s.choose) await page.getByRole('tab', { name: new RegExp(ROLE_LABEL[s.role] + '(?: ✓)?$') }).first().click();
      await page.waitForTimeout(500);
      await page.getByText('ГІМН', { exact: true }).first().scrollIntoViewIfNeeded();
      const text = await page.evaluate(() => document.querySelector('main').innerText);
      const hymn = text.slice(text.indexOf('ГІМН'), text.indexOf('ГІМН') + 1800);
      const have = (line) => hymn.includes(line);
      const expectOnly = {
        pope: s.role === 'pope', bishop: s.role === 'bishop', priest: s.role === 'priest', many: s.role === 'many',
      };
      const single = s.role !== 'many';
      if (have(LINES.opening) !== single) failed.push('opening stanza ' + (single ? 'missing' : 'must not be in the plural hymn'));
      for (const kind of ['pope', 'bishop', 'priest']) if (have(LINES[kind]) !== expectOnly[kind]) failed.push(`${kind} stanza ${expectOnly[kind] ? 'missing' : 'must not be shown'}`);
      if (have(LINES.endingFirst) !== single) failed.push('shared conclusion ' + (single ? 'missing' : 'must not be in the plural hymn'));
      if (single && !have(LINES.endingLast)) failed.push('closing Амэн line missing');
      if (have(LINES.many) !== !single) failed.push('plural hymn ' + (single ? 'must not be shown' : 'missing'));
      if (!single && !have(LINES.manyLast)) failed.push('plural hymn conclusion missing');
      if (/Пра (?:аднаго пастыра|Папу|біскупа|прэзбітэра|некалькіх пастыраў)\s*:/.test(hymn)) failed.push('source stanza heading shown as text');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) failed.push(`horizontal overflow ${overflow}px`);
      if (errors.length) failed.push('page errors: ' + errors.join('; '));
      const tag = `${s.id}__${profileName}`;
      fs.writeFileSync(path.join(out, `${tag}.txt`), `${page.url()}\n\n${hymn}\n`);
      await page.screenshot({ path: path.join(out, `${tag}.png`) });
      results.push({ id: s.id, season: s.season, date: s.date, profile: profileName, status: failed.length ? 'FAIL' : 'PASS', failed, files: [`${tag}.png`, `${tag}.txt`] });
    } catch (error) {
      results.push({ id: s.id, season: s.season, date: s.date, profile: profileName, status: 'FAIL', failed: [String(error.message).split('\n')[0]], files: [] });
    } finally { await context.close(); }
    const last = results.at(-1);
    console.log(`${last.status.padEnd(4)} ${last.id} ${profileName} ${last.failed.join(' | ')}`);
  }
}
await browser.close();
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.status !== 'PASS') ? 1 : 0);
