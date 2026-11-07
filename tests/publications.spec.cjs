const assert = require('node:assert/strict');
const { chromium } = require('playwright');

// Run against a local static server; no network requests or publishing are needed.
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const publicationURL = new URL('/publications.html', baseURL).href;
const fullTypes = new Set(['conference', 'journal']);

async function visibleEntries(page) {
  return page.locator('.pub-list > li:visible').evaluateAll(items =>
    items.map(item => ({
      type: item.dataset.publicationType,
      text: item.textContent,
      value: item.value,
    }))
  );
}

async function assertList(page, count, fullOnly) {
  const entries = await visibleEntries(page);
  assert.equal(entries.length, count, 'Visible publication count');
  if (fullOnly) assert.ok(entries.every(entry => fullTypes.has(entry.type)), 'Only conference/journal full papers should appear');
  assert.deepEqual(entries.map(entry => entry.value), entries.map((_, index) => count - index), 'Visible bibliography numbering should be contiguous and descending');
  const status = page.locator('[data-publication-status]');
  assert.ok((await status.textContent()).includes(count ? String(count) : 'No matching'), 'Status should report the visible count or empty state');
  const years = await page.locator('.pub-year').evaluateAll(sections => sections.map(section => ({
    visible: !!section.getClientRects().length,
    count: [...section.querySelectorAll('.pub-list > li')].filter(item => !!item.getClientRects().length).length,
  })));
  assert.ok(years.every(year => year.visible === (year.count > 0)), 'Empty year sections should be hidden');
}

async function assertNoOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${label}: no horizontal overflow`);
}

async function exerciseView(browser, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(publicationURL);
    const all = await page.locator('.pub-list > li').evaluateAll(items => items.map(item => item.dataset.publicationType));
    assert.equal(all.length, 39);
    assert.ok(all.every(Boolean), 'Every bibliography entry needs an explicit type');
    assert.equal(all.filter(type => fullTypes.has(type)).length, 21);

    const toggle = page.locator('[data-publication-toggle]');
    const search = page.locator('[data-publication-search]');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await assertList(page, 21, true);
    const initial = await visibleEntries(page);
    for (const excluded of ['Can People Distinguish Human and AI Agency', 'Towards Body-Centric Gestural Interaction', 'Dagstuhl Seminar 24232', 'stories of SIGCHI’s influence']) {
      assert.ok(!initial.some(entry => entry.text.includes(excluded)), `${excluded} should be hidden by default`);
    }
    assert.ok(initial.some(entry => entry.text.includes('Auto-Paizo Games') && entry.text.includes('Interactivity Audience Award')), 'An interactivity award must not misclassify a full journal paper');
    assert.equal(await page.locator('.pub-year').evaluateAll(years => years.find(year => year.querySelector('h2').textContent.trim() === '2022').getClientRects().length > 0), false);
    await assertNoOverflow(page, `${viewport.width}px default`);

    // Keyboard operation must expose all publications without a mouse.
    await toggle.focus();
    await toggle.press('Space');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await assertList(page, 39, false);
    await assertNoOverflow(page, `${viewport.width}px expanded`);

    await search.fill('Can People Distinguish Human and AI Agency');
    await assertList(page, 1, false);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await assertList(page, 0, true);
    await search.fill('');
    await assertList(page, 21, true);

    await search.fill('Auto-Paizo Games');
    await assertList(page, 1, true);
    await toggle.click();
    await assertList(page, 1, false);
    await search.fill('');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'Clearing search must preserve expanded mode');
    await assertList(page, 39, false);

    await search.fill('zzzz-no-publication-matches-this-query');
    await assertList(page, 0, false);
    await search.fill('');
    await assertList(page, 39, false);

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await assertNoOverflow(page, `${viewport.width}px dark expanded`);
    await toggle.click();
    await assertList(page, 21, true);
    await assertNoOverflow(page, `${viewport.width}px dark default`);

    await toggle.click();
    await page.reload();
    assert.equal(await page.locator('[data-publication-toggle]').getAttribute('aria-expanded'), 'false', 'Reload must restore full-papers-only mode');
    await assertList(page, 21, true);
    assert.deepEqual(errors, [], 'No JavaScript errors');
    console.log(`PASS ${viewport.width}×${viewport.height}: filtering, search, numbering, keyboard, dark theme and reload`);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await exerciseView(browser, { width: 1440, height: 1000 });
    await exerciseView(browser, { width: 390, height: 844 });
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(publicationURL);
      const entries = await visibleEntries(page);
      assert.equal(entries.length, 21, 'Without JavaScript, default view still contains 21 full papers');
      assert.ok(entries.every(entry => fullTypes.has(entry.type)), 'No supplemental entries should flash before JavaScript runs');
      assert.deepEqual(entries.map(entry => entry.value), entries.map((_, index) => 21 - index), 'Static fallback numbering should match the default view');
      console.log('PASS JavaScript-disabled default view');
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
