import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = new URL(process.env.WARDLINE_URL);
const evidence = process.env.WARDLINE_EVIDENCE;
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const network = [];
const errors = [];
const responses = [];
const forbidden = [];
const marker = 'PagesImportPrivacyFixture';
const page = await context.newPage();
const report = { status: 'FAIL', browser: browser.version(), mount: base.pathname, network, errors, checks: {} };
context.on('request', request => {
  const url = new URL(request.url());
  network.push({ method: request.method(), path: url.pathname });
  if (url.origin !== base.origin || (!url.pathname.startsWith(base.pathname) && url.pathname !== base.pathname.slice(0, -1))
      || request.method() !== 'GET' || request.postData() !== null || url.href.includes(marker)) {
    forbidden.push({ method: request.method(), sameOrigin: url.origin === base.origin });
  }
});
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return url.origin === base.origin ? route.continue() : route.abort();
});
page.on('response', response => responses.push(response));
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  const goto = await page.goto(base.href.slice(0, -1));
  assert.equal(goto.status(), 200);
  assert.equal(page.url(), base.href);
  assert.match(goto.headers()['content-type'], /^text\/html/);
  await page.getByRole('heading', { name: /Hospital Intelligence/i }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => [...document.fonts].filter(font => font.status === 'loaded')
    .some(font => font.family === 'Anton')));
  assert(await page.evaluate(() => [...document.fonts].filter(font => font.status === 'loaded')
    .some(font => font.family === 'Archivo')));
  const tagged = (ext, type) => responses.some(response => new URL(response.url()).pathname.endsWith(ext)
    && response.status() === 200 && response.headers()['content-type'].startsWith(type));
  assert(tagged('.css', 'text/css') && tagged('.js', 'text/javascript') && tagged('.woff2', 'font/woff2'));
  report.checks.entryAndFonts = 'PASS';

  const nav = page.getByRole('navigation', { name: 'Views' });
  for (const label of ['Seasonal atlas', 'Regional explorer', 'Services & scope', 'Forecast lab', 'Data & methods', 'Methodology (D01–08)']) {
    const button = nav.getByRole('button', { name: label, exact: true });
    await button.click();
    assert.equal(await button.getAttribute('aria-current'), 'page');
  }
  await nav.getByRole('button', { name: '3D spatial lab' }).click();
  const regions = page.getByRole('list', { name: 'Small-multiple time series wall for 34 regions' });
  await regions.waitFor();
  assert.equal(await regions.getByRole('listitem').count(), 34);
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  assert(responses.some(response => /\/SeasonalTerrain3D-[\w-]+\.js$/.test(new URL(response.url()).pathname)
    && response.status() === 200 && /^text\/javascript/.test(response.headers()['content-type'])));
  report.checks.viewsAndRegionalMatrix = 'PASS';

  await nav.getByRole('button', { name: 'Data & methods' }).click();
  const privacyStart = network.length;
  await page.getByLabel('Import monthly CSV').setInputFiles({
    name: marker + '.csv', mimeType: 'text/csv',
    buffer: Buffer.from('period,geo_id,geo_name,indicator_id,value,status,unit\n2021-01,QX,' + marker + ',inst_del,123,observed,deliveries\n'),
  });
  await page.getByText(/Loaded 1 validated rows?/).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Active Slice CSV' }).click();
  const exported = await readFile(await (await download).path(), 'utf8');
  assert.match(exported, new RegExp(marker));
  assert.deepEqual(network.slice(privacyStart), []);
  report.checks.csvStaysInBrowser = 'PASS';

  await page.reload();
  await page.getByRole('heading', { name: /Hospital Intelligence/i }).waitFor();
  const [handbook] = await Promise.all([
    page.waitForResponse(response => response.url() === new URL('handbook.html', base).href),
    page.getByRole('link', { name: 'Complete handbook' }).first().click(),
  ]);
  assert.equal(handbook.status(), 200);
  await page.locator('#chapter-search').fill('ridge');
  assert(await page.locator('#h09').isVisible());
  const broken = responses.filter(response => response.status() >= 400).map(response => response.url());
  assert.deepEqual(broken, []);
  assert.deepEqual(forbidden, []);
  assert.deepEqual(errors, []);
  report.checks.refreshAndOnlineHandbook = 'PASS';
  report.status = 'PASS';
} finally {
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await writeFile(join(evidence, 'PAGES_SMOKE.json'), JSON.stringify(report, null, 2) + '\n');
  }
  await browser.close();
}
