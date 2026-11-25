import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = resolve(process.env.WARDLINE_EVIDENCE || resolve(root, 'evidence/final_local_acceptance'));
const screenshots = resolve(evidence, 'screenshots/handbook');
const suffix = process.argv[2] || 'current';
const { chromium } = await import('playwright');
const checks = {};
const errors = [];
const externalRequests = [];
const browser = await chromium.launch();
const browserVersion = browser.version();
const context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const handbook = pathToFileURL(resolve(root, 'frontend/public/handbook.html')).href;
await mkdir(screenshots, { recursive: true });
await mkdir(resolve(evidence, 'test-results'), { recursive: true });
page.setDefaultTimeout(5000);
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (/^https?:/.test(request.url())) externalRequests.push(request.url());
});

async function check(name, fn) {
  try {
    await page.goto(handbook);
    const detail = await fn();
    checks[name] = { status: 'PASS', detail };
  } catch (error) {
    checks[name] = { status: 'FAIL', detail: error.message };
  }
}

async function text(selector, expected) {
  assert.match(await page.locator(selector).textContent(), expected);
}

try {
  await check('offline chapters and assets', async () => {
    assert.equal(await page.locator('main section.chapter[id^="h"]').count(), 18);
    assert.equal(await page.locator('#toc-list a').count(), 19);
    const diagrams = await page.locator('#h11 svg').count();
    assert.match(await page.locator('#h11 h2').innerText(), new RegExp(`\\b${diagrams} System Diagrams\\b`, 'i'));
    const images = await page.locator('main img').evaluateAll(nodes => nodes.map(node => ({ width: node.naturalWidth, loaded: node.complete })));
    assert(images.length > 0 && images.every(image => image.width > 0 && image.loaded));
    return { images, externalRequests };
  });

  await check('chapter navigation and searches', async () => {
    await page.locator('#toc-filter').fill('Formulas');
    assert.equal(await page.locator('#toc-list a:visible').count(), 1);
    await page.locator('#toc-list a:visible').click();
    assert.equal(new URL(page.url()).hash, '#h12');
    await page.locator('#toc-filter').clear();
    await page.locator('#chapter-search').fill('independent_audit_missing_token');
    assert.equal(await page.locator('main section.chapter:visible').count(), 0);
    await page.locator('#chapter-search').fill('ridge');
    assert(await page.locator('#h09').isVisible());
    await text('#chapter-search-status', /matching chapters for "ridge"/i);
    await page.locator('#chapter-search').clear();
    assert.equal(await page.locator('main section.chapter:visible').count(), 19);
    assert.equal(await page.locator('#dict-tbody tr').count(), 17);
    await page.locator('#dict-search').fill('row_locator');
    assert.equal(await page.locator('#dict-tbody tr').count(), 1);
    await page.locator('#dict-search').clear();
  });

  await check('observation filters pagination and leap year', async () => {
    await text('#obs-count', /22,848 matching rows/);
    assert.equal(await page.locator('#obs-tbody tr').count(), 50);
    const first = await page.locator('#obs-tbody tr').first().innerText();
    await page.locator('#obs-next').click();
    await text('#obs-page-info', /Page 2 of 457/);
    assert.notEqual(await page.locator('#obs-tbody tr').first().innerText(), first);
    await page.locator('#obs-prev').click();
    assert.equal(await page.locator('#obs-tbody tr').first().innerText(), first);
    await page.locator('#obs-geo').selectOption('PB');
    await page.locator('#obs-ind').selectOption('inst_del');
    await page.locator('#obs-status').selectOption('observed');
    await text('#obs-count', /96 matching rows/);
    await page.locator('#obs-q').fill('2020-02');
    await text('#obs-count', /1 matching rows/);
    const [period, geo, indicator, rawCount, rawRate, unit, status, locator] = await page.locator('#obs-tbody tr td').allTextContents();
    const count = Number(rawCount.replaceAll(',', ''));
    assert.equal(rawRate, `${(count / 29).toFixed(2)}/day`);
    assert.deepEqual([period, geo, indicator, unit, status], ['2020-02', 'PB', 'inst_del', 'deliveries', 'observed']);
    assert.match(locator, /^hmis_state_month\.csv:row_\d+$/);
    await page.screenshot({ path: resolve(screenshots, `observation-${suffix}.png`) });
    for (const field of ['geo', 'ind', 'status']) await page.locator(`#obs-${field}`).selectOption('');
    await page.locator('#obs-q').clear();
    return { count, rawRate, unit, locator };
  });

  await check('viva filters and answer controls', async () => {
    assert.equal(await page.locator('#viva-list details').count(), 105);
    await page.locator('#viva-list summary').first().click();
    assert.equal(await page.locator('#viva-list details[open]').count(), 1);
    const category = await page.locator('#viva-cat option').nth(1).getAttribute('value');
    await page.locator('#viva-cat').selectOption(category);
    await page.locator('#viva-diff').selectOption('Basic');
    const count = await page.locator('#viva-list details').count();
    assert(count > 0 && count < 105);
    await page.getByRole('button', { name: 'Reveal All' }).click();
    assert.equal(await page.locator('#viva-list details[open]').count(), count);
    await page.getByRole('button', { name: 'Hide All' }).click();
    assert.equal(await page.locator('#viva-list details[open]').count(), 0);
    await page.locator('#viva-cat').selectOption('');
    await page.locator('#viva-diff').selectOption('');
    return { category, difficulty: 'Basic', count };
  });

  await check('interactive demonstrations', async () => {
    const actions = [
      ['Daily Rate', '#demo1-out', /identical \(0\.0% change\)/],
      ['Month 2 = 0', '#demo2-out', /66\.7/],
      ['Fixed Cohort (29 Constant Units)', '#demo3-out', /\+1\.25%/],
      ['Mean Daily Count', '#demo10-out', /Bihar .* \/ day.*Punjab .* \/ day.*366 calendar days/],
    ];
    for (const [name, out, expected] of actions) {
      await page.getByRole('button', { name, exact: true }).click();
      await text(out, expected);
    }
    await page.locator('#demo5-mo').selectOption('2');
    await text('#demo5-out', /Winter/);
    await page.locator('#demo6-err').press('Home');
    await text('#demo6-out', /MAE = 0\.00.*WAPE = 0\.00%/);
    await page.locator('#demo7-step').selectOption('1');
    await text('#demo7-out', /60m.*2017-04\.\.2018-03/);
    await page.locator('#demo7-step').selectOption('4');
    await text('#demo7-out', /2\.69%/);
    await page.locator('#demo8-v').fill('0');
    await text('#demo8-out', /0\.000/);
    return { interactivePanels: await page.locator('#demos .demo-grid > .panel').count() };
  });

  await check('clipboard writes command', async () => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async command => { window.auditCopiedCommand = command; },
      } });
    });
    const copy = page.locator('.copy-btn').first();
    await copy.click();
    await text('.copy-btn >> nth=0', /Copied!/);
    const command = await page.evaluate(() => window.auditCopiedCommand);
    assert.match(command, /python -m http\.server 4173/);
    return { mode: 'clipboard adapter observed, system clipboard untouched', characters: command.length };
  });

  await check('clipboard rejection reported truthfully', async () => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async () => { throw new Error('Controlled clipboard rejection'); },
      } });
    });
    await page.locator('.copy-btn').first().click();
    await page.waitForFunction(() => /Copied!|Copy unavailable/.test(document.querySelector('.copy-btn').textContent));
    await text('.copy-btn >> nth=0', /Copy unavailable/);
    await page.reload();
  });

  for (const width of [320, 390, 768, 1440]) {
    await check(`mobile and desktop reflow ${width}`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#h05 h2').evaluate(heading => heading.scrollIntoView({ block: 'start' }));
      const geometry = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('main section,main .controls')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.id || el.className) }));
      await page.screenshot({ path: resolve(screenshots, `layout-${width}-${suffix}.png`) });
      assert(geometry.documentWidth <= width + 1, JSON.stringify(geometry));
      if (width <= 390 && suffix !== 'baseline') {
        const table = page.locator('#h05 .table-wrap');
        assert.equal(await table.getAttribute('role'), 'region');
        assert.equal(await table.getAttribute('aria-label'), 'Observation results table');
        const tableSize = await table.evaluate(region => ({ available: region.clientWidth, content: region.scrollWidth }));
        assert(tableSize.content > tableSize.available, 'Mobile observation table must scroll within its own container');
        await table.focus();
        assert(await table.evaluate(region => region === document.activeElement));
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('#h05 .table-wrap').scrollLeft > 0);
        geometry.table = tableSize;
      }
      return geometry;
    });
  }

  await check('print controls and PDF', async () => {
    await page.evaluate(() => { window.print = () => { window.auditPrint = true; }; });
    await page.getByRole('button', { name: 'Print / Save PDF' }).click();
    assert(await page.evaluate(() => window.auditPrint));
    await page.emulateMedia({ media: 'print' });
    assert(!await page.locator('.sidebar').isVisible());
    assert(!await page.locator('.copy-btn').first().isVisible());
    assert(await page.locator('#h18').isVisible());
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    await writeFile(resolve(screenshots, `handbook-print-${suffix}.pdf`), pdf);
    return { bytes: pdf.length };
  });
} finally {
  await browser.close();
  const result = { executedAt: new Date().toISOString(), browserVersion, checks, pageErrors: errors, externalRequests };
  await writeFile(resolve(evidence, `test-results/handbook-browser-${suffix}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  if (Object.values(checks).some(check => check.status === 'FAIL') || errors.length || externalRequests.length) process.exitCode = 1;
}
