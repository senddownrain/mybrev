import assert from 'node:assert/strict';

// Runs in the existing offline mobile harness with real routes and components.
export async function checkCalendarLayout(page, navigate, output) {
  const routes = ['/', '/day/2026-10-04', '/picker', '/picker?mode=readings', '/readings', '/readings/2026-10-04', '/ordo', '/ordo/2026-10-04'];
  for (const [width, height] of [[320, 568], [360, 740], [390, 844], [430, 932]]) {
    await page.setViewportSize({ width, height });
    for (const path of routes) {
      console.log(`Calendar checking ${width}x${height} ${path}`);
      await navigate(path);
      await page.locator('.pill-nav-outer [aria-label="Каляндар"]').click();
      const dialog = page.locator('.liturgical-date-dialog.v-overlay--active');
      await dialog.waitFor();
      await page.waitForTimeout(350);
      const chooseMonth = async (month) => {
        await dialog.locator('.month-select').click();
        await page.locator('.date-picker-select-menu').getByRole('option', { name: month, exact: true }).click();
      };
      await chooseMonth('кастрычнік');
      await dialog.locator('.year-select').click();
      await page.locator('.date-picker-select-menu').getByRole('option', { name: '2026', exact: true }).click();
      const check = async () => {
        const result = await dialog.evaluate((el) => {
          const rect = (selector) => el.querySelector(selector).getBoundingClientRect();
          const title = rect('.date-dialog-title'), actions = rect('.date-dialog-actions');
          const header = [...el.querySelectorAll('.month-nav-btn, .month-select, .year-select')].map((node) => node.getBoundingClientRect());
          const text = el.querySelector('.month-select .v-select__selection-text');
          const content = el.querySelector('.date-dialog-content');
          return {
            visible: title.top >= 0 && actions.bottom <= window.innerHeight && actions.height >= 48,
            overflow: el.querySelector('.date-dialog-card').scrollWidth > el.querySelector('.date-dialog-card').clientWidth + 1 || content.scrollWidth > content.clientWidth + 1,
            collision: header.some((a, i) => header.slice(i + 1).some((b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)),
            fullMonth: text.scrollWidth <= text.clientWidth + 1,
            onTop: el.contains(document.elementFromPoint(title.left + 20, title.top + 20)),
            locked: document.documentElement.classList.contains('v-overlay-scroll-blocked') || !!document.querySelector('.v-overlay-scroll-blocked'),
          };
        });
        assert.deepEqual(result, { visible: true, overflow: false, collision: false, fullMonth: true, onTop: true, locked: true }, `${width}x${height} ${path}`);
      };
      await check();
      await dialog.getByLabel('Наступны месяц', { exact: true }).click();
      await dialog.getByLabel('Папярэдні месяц', { exact: true }).click();
      await chooseMonth('снежань');
      await dialog.locator('.day-btn').filter({ hasText: /^4$/ }).click();
      await check();
      if (path === '/day/2026-10-04') await page.screenshot({ path: `${output}/calendar-${width}.png` });
      if (!path.startsWith('/ordo')) {
        assert.ok(await dialog.locator('.day-option').count() > 1, 'December 4 has multiple legal options');
        // Stress only the DOM in this offline test; production data stays untouched.
        await dialog.locator('.day-options').evaluate((el) => {
          const option = el.querySelector('.day-option');
          for (let i = 0; i < 20; i++) el.append(option.cloneNode(true));
        });
        const before = await dialog.locator('.date-dialog-actions').boundingBox();
        await dialog.locator('.date-dialog-content').evaluate((el) => { el.scrollTop = el.scrollHeight; });
        assert.deepEqual(await dialog.locator('.date-dialog-actions').boundingBox(), before, 'footer stays fixed when options scroll');
        const last = await dialog.locator('.day-option').last().boundingBox();
        assert.ok(last.y + last.height <= before.y + 1, 'last option can be scrolled above footer');
        await check();
      }
      await dialog.getByRole('button', { name: 'Выбраць', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.ok(page.url().includes('2026-12-04'), 'date selection navigates');
      await page.locator('.pill-nav-outer [aria-label="Каляндар"]').click();
      await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Сёння', exact: true }).click();
      assert.equal(await dialog.locator('.day-btn.is-selected.is-today').count(), 1);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    }
    console.log(`Calendar passed ${width}x${height}: all ${routes.length} entry routes, month/year/date, options and scroll lock.`);
  }
}

