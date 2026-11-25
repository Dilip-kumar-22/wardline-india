import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { bundlePath, readBundleManifest, verifyRuntimeBundle } from './runtime_bundle.mjs';

const base = new URL(process.env.WARDLINE_URL ?? 'http://127.0.0.1:4173/');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(process.env.WARDLINE_EVIDENCE ?? path.join(root, 'evidence/final_local_acceptance'));
const screen = path.join(out, 'screenshots');
const downloads = path.join(out, 'test-results', 'downloads');
const widths = [...new Set([320, 390, 768, 1024, 1280, 1440, Number(process.env.WARDLINE_NATIVE_WIDTH)].filter(Boolean))];
const viewport = { width: 1440, height: 900 };
const report = { version: '1.4.2', origin: base.href, executed_utc: new Date().toISOString(), checks: {}, network: [], errors: [] };
const timings = {};
const accessibility = { scope: 'Rendered labels, keyboard, focus, reflow, selected opaque contrast samples, and reduced-motion preference' };
const manifest = await readBundleManifest();
await fs.mkdir(screen, { recursive: true });
await fs.mkdir(downloads, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.WARDLINE_HEADED !== '1',
  channel: process.env.WARDLINE_BROWSER_CHANNEL || undefined,
});
report.browser = browser.version();
report.headed = process.env.WARDLINE_HEADED === '1';
const context = await browser.newContext({ viewport, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(9000);
page.on('pageerror', (error) => report.errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') report.errors.push(message.text());
});
page.on('requestfailed', (request) => report.errors.push(`${request.failure()?.errorText} ${request.url()}`));
page.on('response', (response) => {
  if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${response.url()}`);
  report.network.push({ url: response.url(), status: response.status(), contentType: response.headers()['content-type'] });
});
await page.addInitScript(() => {
  window.__wardlinePaints = [];
  new PerformanceObserver((entries) => {
    window.__wardlinePaints.push(...entries.getEntries().map(({ name, startTime }) => ({ name, startTime })));
  }).observe({ entryTypes: ['paint', 'largest-contentful-paint', 'longtask'] });
});

const nav = page.getByRole('navigation', { name: 'Views' });
let official;
async function open() {
  const expected = new URL(bundlePath, base);
  const started = performance.now();
  const [response, document] = await Promise.all([
    page.waitForResponse((r) => r.url() === expected.href, { timeout: 15000 }),
    page.goto(base.href, { waitUntil: 'domcontentloaded', timeout: 15000 }),
  ]);
  assert.equal(document?.status(), 200);
  const bytes = await response.body();
  official = verifyRuntimeBundle(response.status(), response.headers()['content-type'], bytes, manifest);
  await page.getByRole('heading', { name: /Hospital Intelligence/i }).waitFor();
  assert.match(await page.locator('.hero').innerText(), /All-India \(34 harmonised units\)/i);
  timings.startup ??= { elapsed_ms: performance.now() - started, runtime_asset_bytes: bytes.length,
    entries: await page.evaluate((url) => performance.getEntriesByName(url).map((e) => e.toJSON()), expected.href),
    paints: await page.evaluate(() => window.__wardlinePaints) };
  report.bundle = { sha256: manifest.bundle_sha256, bytes: bytes.length, path: expected.pathname };
}
async function route(name) {
  const start = performance.now();
  const button = nav.getByRole('button').filter({ hasText: name });
  await button.click();
  assert.equal(await button.getAttribute('aria-current'), 'page');
  await page.locator('#main-content h1').waitFor();
  timings.navigation ??= {};
  (timings.navigation[name] ??= []).push(performance.now() - start);
}
function slug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
}
async function screenshot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(screen, `${name}.png`), animations: 'disabled', timeout: 15000 });
}
async function check(name, run) {
  const start = performance.now();
  try {
    await run();
    report.checks[name] = { status: 'PASS', elapsed_ms: Math.round(performance.now() - start) };
  } catch (error) {
    report.checks[name] = { status: 'FAIL', error: error.stack };
    console.error(`${name}: ${error.message}`);
    await screenshot(`fail-${slug(name)}`).catch(() => {});
  }
}
async function download(button) {
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const destination = path.join(downloads, file.suggestedFilename());
  await file.saveAs(destination);
  assert.equal(await file.failure(), null);
  const bytes = await fs.readFile(destination);
  assert(bytes.length > 0);
  return bytes;
}

try {
  await check('Startup and verified browser dataset bytes', open);
  await check('All analytical views and responsive widths', async () => {
    const routes = await nav.locator('button .nav-label').allTextContents();
    assert.equal(routes.length, 8);
    assert.equal(await nav.getByRole('link', { name: 'Complete handbook' }).getAttribute('href'), './handbook.html');
    const issues = [];
    report.matrix = {};
    for (const label of routes) {
      await page.setViewportSize(viewport);
      await route(label);
      await screenshot(`desktop-${slug(label)}`);
      report.matrix[label] = {};
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const measured = await page.evaluate(() => ({
          viewport: innerWidth, document: document.documentElement.scrollWidth,
          heading: document.querySelector('h1')?.getBoundingClientRect().width ?? 0,
          presentationFits: (() => {
            const button = document.querySelector('.presentation-entry button');
            return button.scrollWidth <= button.clientWidth + 1;
          })(),
        }));
        report.matrix[label][width] = measured;
        if (measured.document > width + 1 || measured.heading <= 0 || !measured.presentationFits) {
          issues.push(`${label} at ${width}: ${JSON.stringify(measured)}`);
        }
        if (width === 320 || label === 'Overview') await screenshot(`${width}px-${slug(label)}`);
      }
    }
    await page.setViewportSize(viewport);
    assert.deepEqual(issues, [], 'Responsive overflow or missing heading');
  });
  await check('Themes, rendered contrast samples and keyboard focus', async () => {
    await route('Overview');
    const themes = { Industrial: 'industrial', Sage: 'sage', Midnight: 'midnight', Clinical: 'blue' };
    accessibility.themes = {};
    const backgrounds = new Set();
    for (const [name, id] of Object.entries(themes)) {
      await page.getByRole('button', { name, exact: true }).click();
      assert.equal(await page.locator('body').getAttribute('data-theme'), id);
      await page.evaluate(async () => {
        getComputedStyle(document.body).backgroundColor;
        await Promise.all(document.getAnimations().filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished.catch(() => undefined)));
      });
      const samples = await page.evaluate(() => {
        const rgb = (value) => value.match(/[\d.]+/g)?.map(Number) ?? [];
        const luminance = (color) => rgb(color).slice(0, 3).map((value) => {
          const x = value / 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        return ['.hero h1', '.hero-sub', '.rail .nav-label', '.nav-handbook', '.topbar select'].map((selector) => {
          const el = document.querySelector(selector);
          const style = getComputedStyle(el);
          let box = el;
          let background;
          while (box) {
            background = getComputedStyle(box).backgroundColor;
            if (rgb(background).length === 3) break;
            box = box.parentElement;
          }
          const colors = [luminance(style.color), luminance(background)].sort((a, b) => b - a);
          return { selector, foreground: style.color, background, ratio: (colors[0] + 0.05) / (colors[1] + 0.05) };
        });
      });
      accessibility.themes[id] = samples;
      assert(samples.find(sample => sample.selector === '.nav-handbook').ratio >= 4.5);
      backgrounds.add(samples[0].background);
      await screenshot(`theme-${id}`);
    }
    assert(backgrounds.size >= 3);
    await page.getByRole('button', { name: 'Industrial', exact: true }).click();
    await page.keyboard.press('Control+Home');
    await page.locator('body').evaluate((body) => { body.tabIndex = -1; body.focus(); });
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return { label: el.textContent.trim(), selector: el.tagName, outline: style.outline, visible: el.getBoundingClientRect().width > 0 };
    });
    assert.equal(focus.label, 'Skip to main content');
    assert(focus.visible);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
    accessibility.keyboard = focus;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open();
    assert.match(await page.locator('body').getAttribute('class') ?? '', /reduce-motion/);
    await page.setViewportSize({ width: 640, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const zoom = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth, viewport: innerWidth,
      overflow: [...document.querySelectorAll('main *')]
        .filter((element) => !element.closest('svg,.table-wrap'))
        .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 8).map((element) => ({ element: element.tagName, class: element.className, right: element.getBoundingClientRect().right })),
    }));
    await screenshot('overview-reflow-200-percent-css');
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    accessibility.reflow_200_percent_css_zoom = zoom;
    assert(zoom.scroll <= zoom.viewport + 1, `Page spills horizontally at 200% CSS zoom: ${JSON.stringify(zoom)}`);
    await page.setViewportSize(viewport);
    assert(samplesPass(accessibility.themes), 'A sampled text contrast pair falls below 4.5:1');
  });
  await check('Filters, selected season and chart downloads', async () => {
    const globalGeo = page.getByLabel('Global geography selector');
    const indicator = page.getByLabel('Global indicator selector');
    await route('Overview');
    await globalGeo.selectOption('PB');
    assert.match(await page.locator('.hero').innerText(), /Punjab/i);
    await indicator.selectOption('opd');
    assert.match(await page.locator('.hero').innerText(), /Outpatient Attendance/i);
    await indicator.selectOption('inst_del');
    await globalGeo.selectOption('IN');
    await route('Seasonal atlas');
    const v04 = page.locator('[data-viz-id="V04"]');
    await v04.getByRole('button', { name: /SW Monsoon/i }).click();
    const csv = (await download(v04.getByRole('button', { name: 'CSV', exact: true }))).toString('utf8');
    const svg = (await download(v04.getByRole('button', { name: 'SVG', exact: true }))).toString('utf8');
    const png = await download(v04.getByRole('button', { name: 'PNG', exact: true }));
    assert.match(csv, /WARDLINE/);
    assert.match(csv, /deliveries/i);
    assert(csv.includes('Ministry of Health and Family Welfare'), 'Expected HMIS source attribution in chart CSV');
    assert(csv.includes('Daily Rate (deliveries/day)'), 'Expected active metric and unit in chart CSV');
    const row = csv.split('\n').find((line) => line.startsWith('2012-06,'));
    assert.equal(Number(row.split(',')[5]), official.analytics.national.inst_del.monthly.find((point) => point.period === '2012-06').value);
    assert(csv.includes(',51979.1,-1.36,'), 'Expected numeric negative YoY unchanged in chart CSV');
    assert.match(svg, /<svg[\s>]/);
    assert(svg.includes('Ministry of Health and Family Welfare'), 'Expected HMIS source attribution in SVG description');
    assert(svg.includes('Daily Rate (deliveries/day)'), 'Expected active metric and unit in SVG description');
    assert.match(svg, /Seasonal Clock/i);
    assert(!/<text[^>]*fill="var\(/.test(svg), 'Standalone SVG labels retain unresolved CSS variables');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const january = await v04.locator('svg text').filter({ hasText: /^Jan$/ }).evaluate((label) => ({
      x: Number(label.getAttribute('x')), y: Number(label.getAttribute('y')),
      width: label.ownerSVGElement.viewBox.baseVal.width,
    }));
    assert.equal(png.readUInt32BE(16), january.width * 2, 'PNG chart width must match the encoded SVG viewBox');
    const lightLabelPixels = await page.evaluate(async ({ encoded, x, y }) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const source = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const scratch = Object.assign(document.createElement('canvas'), { width: source.width, height: source.height });
      const ctx = scratch.getContext('2d');
      ctx.drawImage(source, 0, 0);
      source.close();
      const pixels = ctx.getImageData(Math.floor(x * 2) - 20, Math.floor(y * 2) - 21, 40, 24).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > 170 && pixels[i + 1] > 170 && pixels[i + 2] > 170) count++;
      }
      return count;
    }, { encoded: png.toString('base64'), x: january.x, y: january.y });
    assert(lightLabelPixels > 10, 'Expected light January label pixels on the dark PNG');
    report.chartDownloads = { csv: csv.length, svg: svg.length, png: [png.length, png.readUInt32BE(16), png.readUInt32BE(20)], lightLabelPixels };
  });
  await check('CSV rejection, live import, export, all presentation chapters and reset', async () => {
    await route('Data & methods');
    const input = page.getByLabel('Import monthly CSV');
    const upload = (data) => input.setInputFiles({ name: 'wardline-controlled-fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(data) });
    const rejects = [
      ['period,value\n2021-01,2\n2021-01,3', /duplicate canonical key/i],
      ['period,value\n2021-13,2', /invalid period/i],
      ['period,value\n2021-01,-2', /nonnegative whole integer/i],
      ['period,value,stratum\n2021-01,2,subgroup', /unsupported stratum/i],
      ['period,value,geo_level,geo_id\n2021-01,2,national,IND\n2021-01,2,state_ut,A', /overlapping geo_level/i],
      ['period,value,unit\n2021-01,2,percent', /non-additive unit/i],
      ['period,value,mode\n2021-01,2,official', /cannot claim mode/i],
    ];
    for (const [contents, message] of rejects) {
      await upload(contents);
      await page.getByText(message).waitFor();
    }
    await upload([
      'period,geo_id,geo_name,indicator_id,value,status,unit',
      '2021-01,A,"Clinic Alpha, <em>literal</em>",inst_del,120,observed,deliveries',
      '2021-02,A,"Clinic Alpha, <em>literal</em>",inst_del,0,observed,deliveries',
      '2021-04,A,"Clinic Alpha, <em>literal</em>",inst_del,,missing,deliveries',
      '2021-01,B,=1+1,inst_del,40,observed,deliveries',
      '2021-04,B,=1+1,inst_del,30,observed,deliveries',
    ].join('\n'));
    await page.getByText(/Loaded 5 validated rows/).waitFor();
    const csv = (await download(page.getByRole('button', { name: 'Export Active Slice CSV' }))).toString('utf8');
    assert.match(csv, /imported_unverified/i);
    assert.match(csv, /unit,daily_rate_unit,data_mode,source_attribution,limitations/);
    assert.match(csv, /deliveries,deliveries\/day,imported_unverified/);
    assert.match(csv, /2021-02[^\r\n]*,0,/);
    assert.match(csv, /2021-03[^\r\n]*missing/i);
    await route('Overview');
    assert.match(await page.locator('.hero').innerText(), /2021-01 to 2021-04/);
    assert.match(await page.locator('.kpi-strip').innerText(), /190/);
    await page.getByLabel('Global geography selector').selectOption('B');
    await route('Data & methods');
    const formula = (await download(page.getByRole('button', { name: 'Export Active Slice CSV' }))).toString('utf8');
    assert.match(formula, /'=1\+1/);
    await page.getByLabel('Global geography selector').selectOption('IN');
    await page.getByRole('button', { name: /Presentation Mode/ }).click();
    const chapters = [];
    for (let i = 1; i <= 12; i++) {
      await page.getByText(`CHAPTER ${i} / 12`, { exact: true }).waitFor();
      assert.match(await page.locator('body').innerText(), /LIVE IMPORTED · UNVERIFIED/);
      const chapter = await page.locator('h1').innerText();
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /2\.69%|22,848 observed|Verified Retrospective Benchmarks/);
      if (i === 1) {
        await page.setViewportSize({ width: 320, height: 900 });
        await screenshot('320px-imported-presentation');
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        assert(width <= 321, `Presentation overflows at 320px (document width ${width})`);
        await page.setViewportSize(viewport);
      }
      chapters.push(chapter);
      if (i === 9) assert.match(text, /withheld|unavailable|insufficient/i);
      if (i < 12) await page.getByRole('button', { name: /Next/ }).click();
    }
    await screenshot('imported-presentation-chapter-12');
    await page.keyboard.press('Escape');
    await route('Data & methods');
    await page.getByRole('button', { name: 'Restore Official HMIS Data' }).click();
    await page.getByText(/Restored verified official/).waitFor();
    report.import = { rejected_fixtures: rejects.length, imported_rows: 5, chapters };
  });
  await check('Wrong asset and missing asset display an application error', async () => {
    const isolated = await browser.newContext();
    try {
      const failure = await isolated.newPage();
      const asset = new URL(bundlePath, base).href;
      for (const fixture of [{ status: 200, body: '<!doctype html>', contentType: 'text/html' }, { status: 404, body: 'missing' }]) {
        await failure.route(asset, (route) => route.fulfill(fixture));
        await failure.goto(base.href);
        await failure.getByText('Data bundle unavailable:', { exact: true }).waitFor();
        await failure.unroute(asset);
      }
    } finally {
      await isolated.close();
    }
  });
  await check('Repeated spatial route transitions and browser metric sampling', async () => {
    const metrics = await context.newCDPSession(page);
    try {
      await metrics.send('Performance.enable');
      const sample = async () => {
        const values = (await metrics.send('Performance.getMetrics')).metrics;
        return Object.fromEntries(values.filter(({ name }) =>
          ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'LayoutDuration', 'TaskDuration'].includes(name))
          .map(({ name, value }) => [name, value]));
      };
      const before = await sample();
      for (let i = 0; i < 3; i++) {
        await route('3D spatial lab');
        await route('Overview');
      }
      timings.repeated_navigation = { before, after: await sample(), cycles: 3, metric_units: 'Chrome DevTools Protocol sampling' };
    } finally {
      await metrics.detach();
    }
  });
  await check('No unexpected console, request or HTTP failures', async () => assert.deepEqual(report.errors, []));
} finally {
  await browser.close();
  report.counts = Object.values(report.checks).reduce((counts, { status }) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {});
  await Promise.all([
    fs.writeFile(path.join(out, 'FRONTEND_VERIFICATION.json'), JSON.stringify(report, null, 2)),
    fs.writeFile(path.join(out, 'PERFORMANCE_REPORT.json'), JSON.stringify({ ...timings, browser: report.browser, headed: report.headed, environment: 'Windows local Chromium; launch flags and renderer in WebGL report' }, null, 2)),
    fs.writeFile(path.join(out, 'ACCESSIBILITY_REPORT.json'), JSON.stringify(accessibility, null, 2)),
  ]);
  if (report.counts.FAIL) process.exitCode = 1;
  console.log(JSON.stringify({ browser: report.browser, counts: report.counts }, null, 2));
}

function samplesPass(themes) {
  return Object.values(themes).every((samples) => samples.every((sample) => sample.ratio >= 4.5));
}
