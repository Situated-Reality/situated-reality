const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const pages = ['index.html', 'about.html', 'join-us/', 'team.html', 'research.html', 'publications.html', 'teaching.html'];
const expectedNavigation = ['About', 'Team', 'Research', 'Publications', 'Teaching', 'Join us'];

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      for (const path of pages) {
        await page.goto(new URL(path, baseURL + '/').href);
        const text = await page.locator('main').textContent();
        assert.doesNotMatch(text, /Recruitment continues · 2027 entry|Other PhD applications remain welcome|before 1 November 2026|Applications are open\./);
        assert.deepEqual(await page.locator('.site-nav a').allTextContents(), expectedNavigation);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, path + ': no overflow');
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 750) {
            scrollTo(0, y);
            await new Promise(resolve => setTimeout(resolve, 25));
          }
          await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
        });
        assert.deepEqual(await page.locator('img').evaluateAll(images => images.filter(image => !image.naturalWidth).map(image => image.src)), [], path + ': images load');
        if (['index.html', 'about.html', 'join-us/'].includes(path)) {
          assert.match(text, /The main round for 2027 PhD entry is now closed/);
          assert.match(text, /not received a shortlisting email, please consider your main-round application unsuccessful/);
          assert.match(text, /around February 2027/);
          for (const phrase of ['HKU-PS', 'global top-50 university or a leading undergraduate university in China', 'GPA in the top 5% of your cohort', 'published first-author paper at a top-tier conference or journal', 'solid research experience']) assert.ok(text.includes(phrase), phrase);
          assert.doesNotMatch(text, /Recruitment for 2027 PhD entry is now closed|2027 recruitment is closed for all funding routes|We are not accepting new applications for 2027 entry/);
          assert.match(text, /1 September–1 November each year/);
          assert.match(text, /at least eight months before your intended start date/);
          assert.match(text, /funded by their home university/);
          assert.match(text, /current HKU undergraduate\/postgraduate students or Hong Kong locals/i);
          assert.equal(await page.locator('a[href="https://forms.gle/eEtXrfE4wuQjMP8F6"]').count(), 0, 'Clearing candidates contact by email, not the main-round form');
        }
        if (path === 'join-us/') {
          const clearing = await page.locator('#clearing-rounds').textContent();
          assert.match(clearing, /Applicants must meet all/);
          assert.match(clearing, /email me directly/);
          assert.equal(await page.locator('#clearing-rounds a[href="mailto:xianghci@hku.hk"]').count(), 1);
          const criteria = await page.locator('#phd-criteria').textContent();
          assert.match(criteria, /future recruitment cycles/);
          for (const phrase of ['First Class Honours', 'Project 985', 'global top 100', 'global top 50 in the relevant subject', 'already-published, first-author paper in IEEE TVCG', 'preferred qualification, not a mandatory publication requirement']) assert.ok(criteria.includes(phrase), phrase);
          assert.doesNotMatch(text, /Upper Second Class|3\.3\/4\.0|every two weeks|more than 1 month/);
          const ra = await page.locator('#ra-visiting').textContent();
          assert.match(ra, /Unpaid roles \(no salary or stipend\)/);
          assert.match(ra, /Paid, part-time RA roles with modest remuneration/);
          assert.match(ra, /subject to HKU approval/);
          await page.goto(new URL('join-us/#faq-12', baseURL + '/').href);
          await page.waitForFunction(() => document.querySelector('#faq-12').open);
          assert.match(await page.locator('#faq-12').textContent(), /Self-funded applications are not accepted through our 2027 clearing-round route/);
          assert.match(await page.locator('#faq-12').textContent(), /lab’s PhD selection requirements/);
        }
      }
      for (const path of ['index.html', 'join-us/']) {
        await page.goto(new URL(path, baseURL + '/').href);
        if (await page.getByRole('button', { name: 'Switch to dark mode' }).count()) await page.getByRole('button', { name: 'Switch to dark mode' }).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, path + ': dark mode overflow');
      }
      await context.close();
      console.log(`PASS ${width}px: seven pages, recruitment content, navigation, images, FAQ and dark mode`);
    }
    assert.deepEqual(errors, [], 'No JavaScript errors');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
