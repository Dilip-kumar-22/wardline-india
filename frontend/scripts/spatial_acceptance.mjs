import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = process.env.WARDLINE_EVIDENCE ?? path.join(root, 'evidence/final_local_acceptance');
const screenshots = path.join(evidence, process.env.WARDLINE_HEADED === '1' ? 'screenshots/spatial-headed' : 'screenshots/spatial');
const downloads = path.join(evidence, 'test-results/spatial');
const url = process.env.WARDLINE_URL ?? 'http://127.0.0.1:4173';
const report = { url, timestamp: new Date().toISOString(), checks: {}, console: [] };
const timeout = 12_000;
const viewport = { width: 1440, height: 900 };
const fixture = [
  'period,geo_id,geo_name,indicator_id,value,status,unit',
  '2021-01,TEST_U1,Test Clinic,inst_del,120,observed,deliveries',
  '2021-02,TEST_U1,Test Clinic,inst_del,0,observed,deliveries',
  '2021-03,TEST_U1,Test Clinic,inst_del,,missing,deliveries',
  '2021-04,TEST_U1,Test Clinic,inst_del,155,observed,deliveries',
].join('\n');

function instrumentPage(mode) {
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.dataset.wardlineVerify = 'spatial';
  }, { once: true });
  const originalContext = HTMLCanvasElement.prototype.getContext;
  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  const tracked = new WeakSet();
  const records = [];
  const text = [];
  window.wardlineCheck = { records, text };
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (mode === 'unavailable' && /webgl/.test(type)) return null;
    if (mode === 'initializationFailure' && type === 'webgl2' && attributes?.preserveDrawingBuffer) return null;
    const gl = originalContext.apply(this, arguments);
    if (gl && type === 'webgl2' && attributes?.preserveDrawingBuffer && !tracked.has(gl)) {
      tracked.add(gl);
      const record = { creates: 0, deletes: 0, lostEvents: 0, trustedLoss: false };
      records.push(record);
      this.addEventListener('webglcontextlost', (event) => {
        record.lostEvents++;
        record.trustedLoss = event.isTrusted && gl.isContextLost();
      });
      for (const [method, counter] of [['createBuffer', 'creates'], ['deleteBuffer', 'deletes']]) {
        const original = gl[method].bind(gl);
        gl[method] = (...args) => {
          record[counter]++;
          return original(...args);
        };
      }
    }
    return gl;
  };
  CanvasRenderingContext2D.prototype.fillText = function (value, x, y, maxWidth) {
    text.push({ value, x, y, maxWidth, width: this.canvas.width, height: this.canvas.height, measured: this.measureText(value).width });
    return originalFillText.apply(this, arguments);
  };
}

async function scenario(browser, name, run, mode = 'normal') {
  const context = await browser.newContext({
    viewport, acceptDownloads: true, reducedMotion: mode === 'systemReducedMotion' ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  try {
    page.setDefaultTimeout(timeout);
    await page.addInitScript(instrumentPage, mode);
    page.on('console', (message) => {
      if (message.type() === 'error') report.console.push({ scenario: name, text: message.text(), type: 'console' });
    });
    page.on('pageerror', (error) => report.console.push({ scenario: name, text: error.message, type: 'pageerror' }));
    page.on('response', (response) => {
      if (response.status() >= 400) report.console.push({ scenario: name, text: `${response.status()} ${response.url()}`, type: 'http' });
    });
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
        report.console.push({ scenario: name, text: `${request.url()} ${request.failure()?.errorText}`, type: 'requestfailed' });
      }
    });
    const navigation = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.getByRole('button', { name: /3D spatial lab/i }).waitFor();
    report.build ??= {
      documentStatus: navigation?.status(),
      scripts: await page.locator('script[src]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src'))),
      stylesheets: await page.locator('link[rel=stylesheet]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))),
    };
    if (!report.build.favicon) {
      const icon = await page.locator('link[rel=icon]').getAttribute('href');
      assert.ok(icon, 'The production document provides a local favicon link');
      const response = await page.request.get(new URL(icon, navigation.url()).href);
      assert.equal(response.status(), 200);
      assert.match(response.headers()['content-type'], /^image\/png/);
      const iconBytes = await response.body();
      assert.equal(iconBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      report.build.favicon = { url: response.url(), status: response.status(), bytes: iconBytes.length };
    }
    const findings = await run(page);
    report.checks[name] = findings?.status ? findings : { status: 'PASS', ...findings };
  } catch (error) {
    report.checks[name] = { status: 'FAIL', message: String(error), stack: error.stack };
    await page.screenshot({ path: path.join(screenshots, `${name}_failure.png`), timeout: 3000 }).catch(() => {});
  } finally {
    await context.close();
  }
}

async function enter(page) {
  await page.getByRole('button', { name: /3D spatial lab/i }).click();
  await page.getByRole('heading', { name: '3D seasonal terrain & regional comparison.' }).waitFor();
}

function frameStats(canvas) {
  const gl = canvas.getContext('webgl2');
  if (!gl || gl.isContextLost()) return { variation: 0 };
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const data = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const colors = new Set();
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += 28) {
    colors.add(data[i] << 16 | data[i + 1] << 8 | data[i + 2]);
    hash = Math.imul(hash ^ data[i] ^ data[i + 1] << 8 ^ data[i + 2] << 16, 16777619);
  }
  return {
    width: canvas.width, height: canvas.height,
    cssWidth: canvas.clientWidth, container: canvas.parentElement.clientWidth,
    version: gl.getParameter(gl.VERSION),
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
    variation: colors.size, hash,
    position: canvas.dataset.cameraPosition, target: canvas.dataset.cameraTarget,
    projection: canvas.dataset.cameraProjection, zoom: canvas.dataset.cameraZoom,
    drawCalls: canvas.dataset.drawCalls, triangles: canvas.dataset.triangles,
    damping: canvas.dataset.cameraDamping,
  };
}

function panel(page, id) {
  return page.locator(`[data-viz-id="${id}"]`);
}

async function frame(page, id, previousHash) {
  const canvas = panel(page, id).locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  let result;
  const started = performance.now();
  while (performance.now() - started < timeout) {
    result = await canvas.evaluate(frameStats);
    if (result.variation > 4 && result.hash !== previousHash) return result;
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  throw new Error(`${id} did not produce a nonblank changed WebGL framebuffer: ${JSON.stringify(result)}`);
}

function cameraDistance(state) {
  const target = state.target.split(',').map(Number);
  return Math.hypot(...state.position.split(',').map((value, i) => Number(value) - target[i]));
}

async function cameraScenario(page) {
  await page.getByRole('button', { name: /Motion:/i }).click();
  const start = performance.now();
  await enter(page);
  const v01 = panel(page, 'V01');
  const original = await frame(page, 'V01');
  const firstFrameMs = performance.now() - start;
  assert.match(original.version, /^WebGL 2/);
  assert.equal(original.projection, 'perspective');
  assert.equal(original.damping, 'false');
  await v01.getByRole('button', { name: 'Top View' }).click();
  const top = await frame(page, 'V01', original.hash);
  assert.ok(Math.abs(+top.position.split(',')[2]) < 0.1, 'Top camera must be almost directly above target');
  await v01.getByRole('button', { name: 'Front View' }).click();
  const front = await frame(page, 'V01', top.hash);
  assert.ok(+front.position.split(',')[2] > 10 && Math.abs(+front.position.split(',')[0]) < 0.1);
  await v01.getByRole('button', { name: 'Camera: Perspective' }).click();
  const orthographic = await frame(page, 'V01', front.hash);
  assert.equal(orthographic.projection, 'orthographic');
  await v01.getByRole('button', { name: 'Perspective View' }).click();
  const preset = await frame(page, 'V01', orthographic.hash);
  assert.notEqual(preset.position, orthographic.position);
  await v01.getByRole('button', { name: 'Reset Camera' }).click();
  const reset = await frame(page, 'V01', preset.hash);
  assert.equal(reset.projection, original.projection);
  assert.equal(reset.position, original.position);
  const box = await v01.locator('canvas').boundingBox();
  assert.ok(box);
  const x = box.x + box.width * 0.62;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  const before = await frame(page, 'V01');
  const orbitStarted = performance.now();
  await page.mouse.down();
  await page.mouse.move(x + 90, y - 50, { steps: 4 });
  await page.mouse.up();
  const orbited = await frame(page, 'V01', before.hash);
  const orbitFrameMs = performance.now() - orbitStarted;
  assert.notEqual(orbited.position, before.position, 'Dragging must change camera coordinates');
  assert.ok(Math.abs(cameraDistance(orbited) - cameraDistance(before)) < 0.001);
  const zoomStarted = performance.now();
  await page.mouse.wheel(0, -180);
  const zoomed = await frame(page, 'V01', orbited.hash);
  const zoomFrameMs = performance.now() - zoomStarted;
  assert.ok(cameraDistance(zoomed) < cameraDistance(orbited), 'Wheel alone must change camera distance');
  const beforeTheme = zoomed.hash;
  await page.getByRole('button', { name: 'Sage', exact: true }).click();
  const sage = await frame(page, 'V01', beforeTheme);
  await page.screenshot({ path: path.join(screenshots, 'terrain_sage_1440.png') });
  return { firstFrameMs, orbitFrameMs, zoomFrameMs, original, top, front, orthographic, preset, reset, orbited, zoomed, sage };
}

async function pickRaycast(page, id, selector, predicate, sample = { start: 0.15, end: 0.85, step: 0.025 }) {
  const target = panel(page, id);
  const canvas = target.locator('canvas');
  await frame(page, id);
  const box = await canvas.boundingBox();
  const tooltip = target.locator(selector);
  const get = (locator) => locator.evaluate((element) => ({ ...element.dataset }));
  for (const y of [0.5, 0.43, 0.57, 0.34, 0.66]) {
    for (let x = sample.start; x <= sample.end; x += sample.step) {
      await canvas.dispatchEvent('pointermove', { clientX: box.x + box.width * x, clientY: box.y + box.height * y });
      if (await tooltip.count()) {
        const data = await get(tooltip);
        if (predicate(data)) return data;
      }
    }
  }
  throw new Error(`No matching ${id} raycast hit on the visible scene`);
}

const pickTerrain = (page, predicate) => pickRaycast(page, 'V01', '[data-terrain-tooltip]', predicate, { start: 0.27, end: 0.73, step: 0.0125 });

async function assertTerrainParity(page, observation, unit) {
  const terrain = panel(page, 'V01');
  await terrain.getByRole('button', { name: '2D Heatmap' }).click();
  const cell = terrain.locator(`[data-period="${observation.period}"]`);
  await cell.focus();
  assert.equal(await cell.getAttribute('aria-pressed'), 'true');
  const data = await cell.evaluate((element) => ({ ...element.dataset }));
  assert.equal(data.value, observation.value);
  assert.equal(data.unit, observation.unit);
  assert.equal(data.unit, unit);
  assert.equal(data.status, observation.status);
  assert.equal(data.period, observation.period);
  return data;
}

async function parityScenario(page) {
  await page.getByLabel('Global geography selector').selectOption('PB');
  await page.getByLabel('Global indicator selector').selectOption('inst_del');
  await enter(page);
  const v01 = panel(page, 'V01');
  const source = JSON.parse(await readFile(path.join(root, 'frontend/public/data/wardline_india_bundle.json'), 'utf8'));
  const observations = source.analytics.states.inst_del.PB.monthly;
  await v01.getByRole('button', { name: 'Top View' }).click();
  const daily = await pickTerrain(page, (d) => d.status === 'observed' && Number(d.value) % 1 !== 0);
  const expected = observations.find((entry) => entry.period === daily.period);
  assert.equal(Number(daily.value), expected.daily_rate);
  assert.match(await v01.locator('[data-terrain-tooltip]').textContent(), new RegExp(String(expected.daily_rate).split('.')[1]));
  const daily2D = await assertTerrainParity(page, daily, 'deliveries/day');
  await v01.getByRole('button', { name: 'Daily Rate' }).click();
  await v01.getByRole('button', { name: '3D Terrain' }).click();
  await v01.getByRole('button', { name: 'Top View' }).click();
  const monthly = await pickTerrain(page, (d) => d.period === daily.period);
  assert.equal(Number(monthly.value), expected.value);
  const monthly2D = await assertTerrainParity(page, monthly, 'deliveries');
  return { geography: 'PB', indicator: 'inst_del', daily, daily2D, monthly, monthly2D, reference: expected };
}

async function markerScenario(page) {
  await page.getByRole('button', { name: /Data & methods/i }).click();
  await page.getByLabel('Import monthly CSV').setInputFiles({ name: 'spatial-fixture.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture) });
  await page.getByRole('status').filter({ hasText: 'Loaded 4 validated rows' }).waitFor();
  await page.getByLabel('Global geography selector').selectOption('TEST_U1');
  await enter(page);
  const v01 = panel(page, 'V01');
  await v01.getByRole('button', { name: 'Top View' }).click();
  await v01.getByRole('button', { name: 'Camera: Perspective' }).click();
  const zero = await pickTerrain(page, (d) => d.period === '2021-02');
  assert.equal(zero.value, '0');
  assert.equal(zero.height, '0');
  assert.equal(zero.status, 'observed');
  const missing = await pickTerrain(page, (d) => d.period === '2021-03');
  assert.equal(missing.value, '');
  assert.equal(missing.height, '');
  assert.equal(missing.status, 'missing');
  const missing2D = await assertTerrainParity(page, missing, 'deliveries/day');
  const zero2D = await v01.locator('[data-period="2021-02"]').evaluate((node) => ({ ...node.dataset }));
  assert.equal(zero2D.value, zero.value);
  assert.equal(zero2D.status, zero.status);
  const regions = panel(page, 'V02').getByRole('list', { name: /1 regions/ });
  await regions.getByRole('button', { name: /Test Clinic/i }).waitFor();
  return { zero, missing, zero2D, missing2D };
}

async function regionalScenario(page) {
  await enter(page);
  const v02 = panel(page, 'V02');
  const regions = v02.getByRole('list', { name: /34 regions/ });
  await regions.waitFor();
  assert.equal(await regions.getByRole('listitem').count(), 34);
  await v02.getByRole('heading', { name: /Regional Comparison Matrix/ }).evaluate(
    heading => heading.scrollIntoView({ block: 'start' }),
  );
  await page.screenshot({ path: path.join(screenshots, 'regional_matrix_1440.png') });
  await v02.getByRole('searchbox', { name: 'Filter regional comparison wall' }).fill('Punjab');
  const filtered = v02.getByRole('list', { name: /1 regions/ });
  const unit = filtered.getByRole('listitem');
  assert.equal(await unit.count(), 1);
  const pick = unit.getByRole('button', { name: /Punjab/i });
  await pick.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.getByLabel('Global geography selector').inputValue(), 'PB');
  return { reportingUnits: 34, filteredUnits: 1, keyboardSelected: 'PB' };
}

async function loseContext(canvas) {
  return canvas.evaluate((c) => new Promise((resolve) => {
    const gl = c.getContext('webgl2');
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return resolve(null);
    const timer = setTimeout(() => resolve({ timedOut: true }), 3000);
    c.addEventListener('webglcontextlost', (event) => {
      clearTimeout(timer);
      resolve({ trusted: event.isTrusted, lost: gl.isContextLost() });
    }, { once: true });
    extension.loseContext();
  }));
}

async function lossScenario(page) {
  await enter(page);
  const original = await frame(page, 'V01');
  const outcome = await loseContext(panel(page, 'V01').locator('canvas'));
  if (!outcome) return { status: 'BLOCKED', reason: 'WEBGL_lose_context extension unavailable', original };
  assert.deepEqual(outcome, { trusted: true, lost: true });
  await page.getByText('2D FALLBACK ACTIVE').waitFor();
  await panel(page, 'V01').getByRole('group', { name: /utilization heatmap/i }).waitFor();
  await page.getByRole('list', { name: /34 regions/ }).waitFor();
  assert.match(await panel(page, 'V01').locator('.unavailable-box').textContent(), /lost its WebGL context/i);
  assert.equal(await page.locator('canvas').count(), 0);
  await page.getByRole('button', { name: /Overview/i }).click();
  await enter(page);
  const recovered = await frame(page, 'V01');
  return { outcome, original, recovered };
}

async function fallbackScenario(page, mode) {
  await enter(page);
  await page.getByText('2D FALLBACK ACTIVE').waitFor();
  const v01 = panel(page, 'V01');
  assert.ok(await v01.getByRole('button', { name: '3D Terrain' }).isDisabled());
  await v01.getByRole('group', { name: /utilization heatmap/i }).waitFor();
  const reason = await v01.locator('.unavailable-box').textContent();
  assert.match(reason, mode === 'unavailable' ? /unavailable or disabled/i : /creating WebGL context/i);
  assert.doesNotMatch(reason, /undefined/);
  return { reason, injectedCondition: mode };
}

async function systemMotionScenario(page) {
  await enter(page);
  const state = await frame(page, 'V01');
  assert.equal(state.damping, 'false');
  await page.getByRole('button', { name: 'Motion: Reduced' }).waitFor();
  assert.ok(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches && document.body.classList.contains('reduce-motion')));
  return { preference: 'reduce', damping: state.damping };
}

async function resizeAndCleanup(page) {
  await enter(page);
  const terrain = panel(page, 'V01');
  const before = await frame(page, 'V01');
  await page.setViewportSize({ width: 320, height: 900 });
  const canvas = terrain.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const target = document.querySelector('[data-viz-id="V01"] canvas');
    return target && target.clientWidth === target.parentElement.clientWidth;
  });
  const after = await frame(page, 'V01');
  assert.equal(after.cssWidth, after.container);
  assert.ok(after.width < before.width);
  await page.screenshot({ path: path.join(screenshots, 'V01_320.png') });
  await panel(page, 'V02').getByRole('list', { name: /34 regions/ }).waitFor();
  const documentWidths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflow: [...document.querySelectorAll('main *')]
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
      .map((element) => ({ tag: element.tagName, className: element.getAttribute('class'), right: element.getBoundingClientRect().right }))
      .slice(0, 12),
  }));
  assert.ok(documentWidths.scroll <= documentWidths.viewport + 1, JSON.stringify(documentWidths));
  await page.setViewportSize(viewport);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /Overview/i }).click();
    await enter(page);
    await frame(page, 'V01');
  }
  await page.getByRole('button', { name: /Overview/i }).click();
  await page.waitForFunction(() => window.wardlineCheck.records.filter((r) => r.creates > 0).every((r) => r.trustedLoss));
  const resources = await page.evaluate(() => window.wardlineCheck.records.filter((entry) => entry.creates > 0));
  assert.ok(resources.length >= 4);
  for (const record of resources) assert.equal(record.deletes, record.creates);
  return { before, after, documentWidths, resources, limit: 'Tracked native buffer disposal and active context termination. GPU memory capacity and leak freedom unmeasured.' };
}

async function inspectPng(page, imagePath, expectedPlotHeight) {
  const data = (await readFile(imagePath)).toString('base64');
  return page.evaluate(async ({ data, expectedPlotHeight }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0))], { type: 'image/png' }));
    const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const colors = (start, height) => {
      const pixels = context.getImageData(0, start, canvas.width, height).data;
      const color = new Set();
      for (let i = 0; i < pixels.length; i += 12) color.add(pixels[i] << 16 | pixels[i + 1] << 8 | pixels[i + 2]);
      return color.size;
    };
    const plot = context.getImageData(0, 0, canvas.width, expectedPlotHeight).data;
    const stride = canvas.width * 4;
    let plotHash = 2166136261;
    for (let i = 0; i < plot.length; i += 28) {
      const bottomUp = (expectedPlotHeight - 1 - Math.floor(i / stride)) * stride + (i % stride);
      plotHash = Math.imul(plotHash ^ plot[bottomUp] ^ plot[bottomUp + 1] << 8 ^ plot[bottomUp + 2] << 16, 16777619);
    }
    return {
      width: bitmap.width, height: bitmap.height,
      plotColors: colors(0, expectedPlotHeight),
      footerColors: colors(expectedPlotHeight, bitmap.height - expectedPlotHeight),
      plotHash,
      text: window.wardlineCheck.text.filter((call) => call.width === bitmap.width && call.height === bitmap.height),
    };
  }, { data, expectedPlotHeight });
}

async function exportScenario(page) {
  await page.getByLabel('Global geography selector').selectOption('PB');
  await enter(page);
  const v01 = panel(page, 'V01');
  const first = await frame(page, 'V01');
  const results = {};
  for (const mode of ['3d', '2d']) {
    let plot = first;
    if (mode === '2d') {
      await v01.getByRole('button', { name: '2D Heatmap' }).click();
      await v01.getByRole('button', { name: 'Daily Rate' }).click();
      plot = await v01.locator('.chart-wrap svg').evaluate((svg) => ({
        width: svg.viewBox.baseVal.width * 2, height: svg.viewBox.baseVal.height * 2,
      }));
    } else {
      assert.ok(await v01.getByRole('button', { name: 'SVG (2D only)' }).isDisabled());
      await v01.getByRole('button', { name: 'PNG', exact: true }).hover();
      plot = await frame(page, 'V01');
    }
    const [download] = await Promise.all([page.waitForEvent('download'), v01.getByRole('button', { name: 'PNG', exact: true }).click()]);
    const imagePath = path.join(downloads, `${mode}_${download.suggestedFilename()}`);
    await download.saveAs(imagePath);
    const image = await inspectPng(page, imagePath, plot.height);
    assert.equal(image.width, plot.width);
    assert.ok(image.height > plot.height && image.plotColors > 4 && image.footerColors > 4);
    if (mode === '3d') assert.equal(image.plotHash, plot.hash, '3D PNG plot must match the rendered WebGL frame');
    const footer = image.text.map((entry) => entry.value).join(' ');
    for (const pattern of [/WARDLINE INDIA/, /V01/, /Institutional Deliveries/, /Punjab/, /2012-04 to 2020-03/, /OFFICIAL/i, /DOI: 10\.5281\/zenodo\.23657569/, /Limitations:/]) assert.match(footer, pattern);
    assert.match(footer, mode === '3d' ? /Daily Rate.*deliveries\/day/i : /Monthly Count.*deliveries/i);
    assert.ok(image.text.every((entry) => entry.x + Math.min(entry.measured, entry.maxWidth ?? Infinity) < image.width));
    results[mode] = { ...image, file: path.relative(root, imagePath) };
  }
  return results;
}

await mkdir(screenshots, { recursive: true });
await mkdir(downloads, { recursive: true });
const reportPath = path.join(evidence, process.env.WARDLINE_SPATIAL_REPORT ?? 'WEBGL_VERIFICATION.json');
let browser;
try {
  browser = await chromium.launch({
    headless: process.env.WARDLINE_HEADED !== '1',
    channel: process.env.WARDLINE_BROWSER_CHANNEL,
  });
  report.browser = browser.version();
  report.headed = process.env.WARDLINE_HEADED === '1';
  report.browserChannel = process.env.WARDLINE_BROWSER_CHANNEL ?? 'playwright-chromium';
  for (const [name, run, mode] of [
    ['camera_theme_and_framebuffer', cameraScenario],
    ['exact_2d_3d_values', parityScenario],
    ['zero_and_missing_markers', markerScenario],
    ['regional_matrix_and_keyboard', regionalScenario],
    ['terrain_real_context_loss', lossScenario],
    ['capability_fallback', (page) => fallbackScenario(page, 'unavailable'), 'unavailable'],
    ['initialization_failure_fallback', (page) => fallbackScenario(page, 'initializationFailure'), 'initializationFailure'],
    ['system_reduced_motion', systemMotionScenario, 'systemReducedMotion'],
    ['resize_and_resource_release', resizeAndCleanup],
    ['png_content_and_provenance', exportScenario],
  ]) {
    if (process.env.WARDLINE_SPATIAL_CHECKS && !process.env.WARDLINE_SPATIAL_CHECKS.split(',').includes(name)) continue;
    await scenario(browser, name, run, mode);
    console.log(name, report.checks[name].status, report.checks[name].message ?? '');
  }
} catch (error) {
  report.runnerError = String(error);
  console.error(report.runnerError);
} finally {
  await browser?.close();
  const checks = Object.values(report.checks);
  report.summary = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map((status) => [status, checks.filter((check) => check.status === status).length]));
  const unexpectedError = report.console.some((item) => !(item.scenario === 'initialization_failure_fallback' && item.type === 'console' && /THREE.WebGLRenderer: Error creating WebGL context/i.test(item.text)));
  report.status = !browser ? 'BLOCKED' : report.runnerError || !checks.length || report.summary.FAIL || unexpectedError ? 'FAIL' : report.summary.BLOCKED ? 'PARTIAL' : 'PASS';
  await writeFile(reportPath, JSON.stringify(report, null, 2));
}
if (report.status === 'BLOCKED') process.exitCode = 2;
else if (report.status !== 'PASS') process.exitCode = 1;
