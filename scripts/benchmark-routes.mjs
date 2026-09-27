import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright-core';

const baseUrl = (process.env.BENCHMARK_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const runs = Math.max(5, Number(process.env.BENCHMARK_RUNS) || 5);
const executablePath = process.env.BENCHMARK_BROWSER_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const massPath = '/prayer/eMmCtxwyJ75ogmL5rwye';

const browser = await chromium.launch({ executablePath, headless: true });

async function waitForReady(page, route) {
  await page.locator(route.ready).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction((selector) => {
    const root = document.querySelector(selector);
    return root && !root.querySelector('.v-progress-circular');
  }, route.ready, { timeout: 30_000 });
}

async function discoverHourPath() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  try {
    await page.locator('.day-options-list .day-option').first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const body = (await page.locator('body').innerText()).slice(0, 1200);
    throw new Error(`Home screen did not become ready. Page errors: ${pageErrors.join(' | ') || 'none'}. Body: ${body}`, { cause: error });
  }
  const dayHref = await page.locator('.day-options-list .day-option').first().getAttribute('href');
  await page.goto(new URL(dayHref, baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.locator('.ora-options-list .ora-card').first().waitFor({ state: 'visible', timeout: 30_000 });
  const href = await page.locator('a[href*="/ora/"][href$="/vesper"]').first().getAttribute('href');
  await context.close();
  if (!href) throw new Error('Could not discover a Vespers route from the home screen.');
  return new URL(href, baseUrl).pathname + new URL(href, baseUrl).search;
}

const hourPath = process.env.BENCHMARK_HOUR_PATH || await discoverHourPath();
const routes = [
  { name: 'home', path: '/', ready: '.day-options-list .day-option' },
  { name: 'readings', path: '/readings', ready: '.readings-content' },
  { name: 'hour', path: hourPath, ready: '.liturgical-hour-column .ora .ora-text' },
  { name: 'mass', path: massPath, ready: '.prayer-reading-surface--mass .prayer-text' },
];

async function coldRun(route) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const startedAt = performance.now();
  await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page, route);
  const durationMs = performance.now() - startedAt;
  await context.close();
  return durationMs;
}

async function navigateInSpa(page, route) {
  await page.evaluate((targetPath) => {
    window.history.pushState({}, '', targetPath);
    window.dispatchEvent(new window.PopStateEvent('popstate'));
  }, route.path);
  await waitForReady(page, route);
}

async function warmRuns(route) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForReady(page, routes[0]);
  const values = [];
  for (let index = 0; index < runs; index += 1) {
    if (page.url() !== `${baseUrl}/`) {
      await navigateInSpa(page, routes[0]);
    }
    const startedAt = performance.now();
    await navigateInSpa(page, route);
    values.push(performance.now() - startedAt);
  }
  await context.close();
  return values;
}

function percentile(sorted, quantile) {
  return sorted[Math.ceil(sorted.length * quantile) - 1];
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: Number(percentile(sorted, 0.5).toFixed(1)),
    p75Ms: Number(percentile(sorted, 0.75).toFixed(1)),
    minMs: Number(sorted[0].toFixed(1)),
    maxMs: Number(sorted.at(-1).toFixed(1)),
  };
}

const results = [];
try {
  for (const route of routes) {
    const cold = [];
    for (let index = 0; index < runs; index += 1) cold.push(await coldRun(route));
    const warm = route.name === 'home' ? [] : await warmRuns(route);
    results.push({
      route: route.name,
      path: route.path,
      readySelector: route.ready,
      cold: { rawMs: cold.map((value) => Number(value.toFixed(1))), ...summarize(cold) },
      warm: warm.length
        ? { rawMs: warm.map((value) => Number(value.toFixed(1))), ...summarize(warm) }
        : null,
    });
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  runs,
  methodology: {
    cold: 'A new browser context with an empty HTTP cache for every full page navigation.',
    warm: 'Vue Router history navigation in one already-loaded browser context.',
    duration: 'Navigation start until the route-specific content container is visible and contains no loader.',
  },
  results,
};
const outputDirectory = path.resolve('reports', 'performance');
await mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, `routes-${Date.now()}.json`);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`Raw report: ${outputPath}`);
