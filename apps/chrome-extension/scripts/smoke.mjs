import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const extensionPath = path.join(root, 'dist');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'fitgate-chrome-smoke-'));
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const errors = [];
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`,
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  context.setDefaultTimeout(15000);
  const capture = page => page.on('pageerror', error => errors.push(error.message));
  context.on('page', capture);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/src/popup/popup.html`);
  await popup.locator('#btn-goto-settings').click();
  await popup.locator('#select-camera-mode').selectOption('false');
  await popup.waitForFunction(async () => (await chrome.storage.local.get('fitgate_settings')).fitgate_settings?.cameraEnabled === false);
  await popup.locator('#input-stretch-seconds-text').fill('5 秒');
  await popup.locator('#input-stretch-seconds-text').press('Tab');
  await popup.waitForFunction(async () => (await chrome.storage.local.get('fitgate_settings')).fitgate_settings?.stretchSeconds === 5);
  await popup.locator('#textarea-custom-domains').fill('fitgate-smoke.test');
  await popup.locator('#textarea-custom-domains').press('Tab');
  await popup.waitForFunction(async () => (await chrome.storage.local.get('fitgate_settings')).fitgate_settings?.customDomains.includes('fitgate-smoke.test'));
  await popup.locator('#btn-back-to-main').click();
  await popup.screenshot({ path: path.join(artifacts, 'popup.png') });

  // Seed only the elapsed time; the real content-script heartbeat must lock the site.
  await worker.evaluate(() => chrome.storage.local.set({
    fitgate_accumulated_usage: { seconds: 1200, isLocked: false, lastActiveAt: Date.now() }
  }));
  await context.route('http://fitgate-smoke.test/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>FitGate smoke</title><h1>Controlled website</h1>'
  }));
  const site = await context.newPage();
  await site.goto('http://fitgate-smoke.test/');
  await site.bringToFront();
  await site.locator('#fitgate-host').waitFor({ state: 'attached' });
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('fitgate_accumulated_usage')).fitgate_accumulated_usage.isLocked), true);

  await popup.bringToFront();
  const opened = context.waitForEvent('page');
  await popup.locator('#btn-open-workout').click();
  const workout = await opened;
  await workout.waitForURL(`chrome-extension://${id}/src/workout/workout.html*`);
  await workout.locator('#timer-stage').waitFor({ state: 'visible' });
  await workout.locator('#btn-toggle-timer').click();
  const pausedAt = await workout.locator('#stretch-remaining-sec').textContent();
  await workout.waitForTimeout(400);
  assert.equal(await workout.locator('#stretch-remaining-sec').textContent(), pausedAt);
  assert.equal(await workout.locator('#timer-guide-img').evaluate(img => img.complete && img.naturalWidth > 0), true);
  await workout.screenshot({ path: path.join(artifacts, 'workout.png') });
  await workout.locator('#btn-toggle-timer').click();
  await popup.waitForFunction(async () => {
    const data = await chrome.storage.local.get(['fitgate_accumulated_usage', 'fitgate_stats']);
    return data.fitgate_accumulated_usage?.isLocked === false && Object.keys(data.fitgate_stats || {}).length > 0;
  }, null, { timeout: 25000 });
  await site.locator('#fitgate-host').waitFor({ state: 'detached' });
  // Exercise the extension's own chrome.runtime.getURL model adapter using a
  // synthetic video device; never request access to the user's real camera.
  const ai = await context.newPage();
  await ai.goto(`chrome-extension://${id}/src/workout/workout.html?action=home_squats`);
  await ai.locator('#timer-stage').waitFor({ state: 'visible' });
  await ai.locator('#mode-selector').selectOption('camera');
  await ai.locator('#loading-mask').waitFor({ state: 'hidden', timeout: 45000 });
  await ai.waitForFunction(() => Number(document.querySelector('#fps-counter').textContent.replace('FPS: ', '')) > 0, null, { timeout: 30000 });
  assert.equal(await ai.locator('#webcam').evaluate(video => video.readyState >= 2 && video.videoWidth > 0), true);
  await ai.screenshot({ path: path.join(artifacts, 'camera.png') });
  assert.deepEqual(errors, []);
  const result = { passed: true, browser: await context.browser().version(), scope: 'full', cameraModel: true, checks: ['MV3 service worker', 'popup settings persistence', 'content script lock', 'workout resources', 'pause/resume', 'real timer completion', 'unlock and statistics', 'offline MoveNet and synthetic camera'], errors };
  await fs.writeFile(path.join(artifacts, 'smoke-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('CHROME EXTENSION SMOKE PASSED', JSON.stringify(result));
} finally {
  await context?.close();
  await fs.rm(profile, { recursive: true, force: true });
}
