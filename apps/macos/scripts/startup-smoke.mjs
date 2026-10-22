// Run the real entry point with fresh data and a deliberately slow first status.
import { app, ipcMain } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'fitgate-startup-')));
const failInitialStatus = process.argv.includes('--fail-initial-status');
let statusSettled = false, firstShow, dashboard;
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => originalHandle(channel, channel === 'status' ? async (...args) => {
  if (!statusSettled) {
    await delay(800);
    if (failInitialStatus) {
      statusSettled = true;
      throw new Error('Startup test: initial status unavailable');
    }
  }
  const result = await handler(...args);
  statusSettled = true;
  return result;
} : handler);
const shown = new Promise(resolve => app.once('browser-window-created', (_, window) => {
  dashboard = window;
  window.once('show', () => {
    firstShow = { loading: window.webContents.isLoadingMainFrame(), statusSettled };
    resolve();
  });
}));
const watchdog = setTimeout(() => { console.error('Startup timed out'); app.exit(1); }, 20000);
async function run() {
  try {
    await import('../electron/main.js');
    await shown;
    console.log('First show:', firstShow);
    assert.equal(firstShow.loading, false, 'dashboard must finish loading before it is shown');
    assert.equal(firstShow.statusSettled, true, 'dashboard must finish the initial status request before it is shown');
    const js = source => dashboard.webContents.executeJavaScript(source);
    if (failInitialStatus) {
      assert.match(await js('document.getElementById("toast").textContent'), /连接失败/);
      // The regular status broadcast should recover after a transient IPC error.
      for (let i = 0; i < 30 && !await js('document.getElementById("version").textContent.includes("FitGate for macOS")'); i++) await delay(100);
    }
    assert.ok(await js('document.getElementById("version").textContent.includes("FitGate for macOS")'));
    // Exercise the user's actual entry button, rather than calling openWorkout.
    await js('window.fitgate.settings({ cameraEnabled: false, stretchSeconds: 60 })');
    const workoutOpened = new Promise(resolve => app.once('browser-window-created', (_, window) => {
      window.once('ready-to-show', () => resolve(window));
    }));
    await js('document.getElementById("start-workout").click()');
    const workout = await workoutOpened;
    assert.equal(workout.isVisible(), true, 'first start-workout click opens a visible workout');
    assert.ok(await workout.webContents.executeJavaScript('!!document.getElementById("desktop-close-workout")'));
    workout.minimize();
    await delay(200);
    dashboard.show(); dashboard.focus();
    await js('document.getElementById("start-workout").click()');
    await delay(200);
    assert.equal(workout.isMinimized(), false, 'start-workout restores an existing minimized workout');
    workout.close();
    await js('document.getElementById("pause-button").click()');
    await delay(100);
    assert.equal(await js('window.fitgate.status().then(s => s.settings.paused)'), true, 'first button click works');
    await js('document.querySelector("[data-view=settings]").click()');
    assert.equal(await js('document.getElementById("settings").hidden'), false);
    dashboard.hide();
    app.emit('activate');
    assert.equal(dashboard.isVisible(), true, 'hidden dashboard reopens');
    dashboard.minimize();
    await delay(200);
    app.emit('activate');
    await delay(200);
    assert.equal(dashboard.isMinimized(), false, 'minimized dashboard is restored');
    console.log('STARTUP SMOKE PASSED');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    app.quit();
    if (process.exitCode) app.exit(process.exitCode);
  }
}
void run();
