import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { screen, powerMonitor } from 'electron';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let watchdog;
    try {
      if (await Promise.race([
        Promise.resolve().then(check),
        new Promise((_, reject) => {
          watchdog = setTimeout(() => reject(new Error(`Timed out: ${description}`)), Math.max(0, deadline - Date.now()));
        }),
      ])) return;
    } finally {
      clearTimeout(watchdog);
    }
    await delay(Math.min(200, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`Timed out: ${description}`);
}
export async function runSmoke({ app, engine, getDashboard, getWorkout, getReminders, openWorkout, showReminder, dismissReminders, reconcileReminders, status, root }) {
  if (process.env.FITGATE_EXPECT_ARCH) assert.equal(process.arch, process.env.FITGATE_EXPECT_ARCH, 'packaged app runs the expected architecture');
  const artifacts = process.env.FITGATE_ARTIFACT_DIR || path.join(root, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  const dashboard = getDashboard(); const errors = [], pandaRequests = [];
  const nativeProbe = process.env.FITGATE_NATIVE_PROBE === '1' && process.env.FITGATE_TEST_HIDDEN !== '1';
  const visualHoldMs = process.env.FITGATE_TEST_HIDDEN === '1' ? 0 : Math.min(60000, Math.max(0, Number(process.env.FITGATE_VISUAL_HOLD_MS) || 0));
  const webSession = dashboard.webContents.session;
  webSession.webRequest.onBeforeRequest((details, callback) => {
    if (/panda/i.test(details.url)) pandaRequests.push(details.url);
    callback({});
  });
  const captureErrors = window => window.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const cycle = () => ({ isLocked: engine.usage.isLocked, restEndsAt: engine.usage.restEndsAt || 0, snoozedUntil: engine.usage.snoozedUntil || 0 });
  function assertDisplayCoverage(displays = screen.getAllDisplays()) {
    const windows = getReminders();
    assert.equal(windows.length, displays.length, 'each connected display has a reminder window');
    for (const display of displays) {
      const window = windows.find(candidate => candidate.reminderDisplayId === display.id);
      assert.ok(window, `display ${display.id} has its own reminder`);
      assert.deepEqual(window.getBounds(), display.bounds, `reminder covers all of display ${display.id}, including the menu bar and Dock`);
      assert.equal(window.isMovable(), false, 'reminder cannot be dragged away');
      assert.equal(window.isResizable(), false, 'reminder cannot be resized');
      assert.equal(window.isMinimizable(), false, 'reminder cannot be minimized');
      assert.equal(window.isAlwaysOnTop(), true, 'reminder stays above ordinary app windows');
      assert.equal(window.getBackgroundColor().toLowerCase(), '#f7f8fa', 'reminder has the shared opaque app background');
    }
  }
  async function popup(isPreview) {
    showReminder(isPreview);
    assertDisplayCoverage();
    for (const window of getReminders()) {
      captureErrors(window);
      await until(() => window.webContents.executeJavaScript('!!document.querySelector(".reminder-card") && typeof document.querySelector("#begin")?.onclick === "function" && typeof document.querySelector("#snooze")?.onclick === "function"'), 'full-screen reminder loaded');
      assert.equal(await window.webContents.executeJavaScript('document.querySelectorAll("video,canvas,.pd-scene").length'), 0, 'reminder contains no animation surface');
      assert.equal(await window.webContents.executeJavaScript('[...document.querySelectorAll("*")].some(el => getComputedStyle(el).webkitAppRegion === "drag")'), false, 'reminder has no draggable UI region');
    }
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return getReminders().find(window => window.reminderDisplayId === display.id);
  }
  async function assertClickable(window, id, scroll = false) {
    assert.ok(await window.webContents.executeJavaScript(`(() => {
      const el=document.getElementById(${JSON.stringify(id)});
      if (!el || el.hidden || el.disabled) return false;
      if (${scroll}) el.scrollIntoView({block:'nearest'});
      const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.width>0 && r.height>0 && r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth && (hit===el || el.contains(hit));
    })()`), `${id} is visible and clickable`);
  }
  async function click(window, id) {
    await assertClickable(window, id, true);
    let watchdog, onClosed;
    try {
      await Promise.race([
        new Promise(resolve => {
          onClosed = resolve;
          window.once('closed', onClosed);
          if (window.isDestroyed()) resolve();
        }),
        Promise.resolve().then(async () => {
          if (window.isDestroyed()) return;
          try {
            await window.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)}).click()`);
          } catch (error) {
            if (!window.isDestroyed()) throw error;
          }
        }),
        new Promise((_, reject) => {
          watchdog = setTimeout(() => reject(new Error(`Timed out clicking: ${id}`)), 20000);
        }),
      ]);
    } finally {
      clearTimeout(watchdog);
      window.removeListener('closed', onClosed);
    }
  }
  dashboard.webContents.on('console-message', (details) => { if (details.level === 'error') errors.push(details.message); });
  await until(() => dashboard.webContents.executeJavaScript('!!document.querySelector("#session-time") && !!window.fitgate'), 'dashboard loaded');
  await until(() => status().nativeReady, 'native NSWorkspace monitor');
  assert.ok(status().foreground.apps.length > 0);
  await until(() => dashboard.webContents.executeJavaScript('!document.getElementById("live-reason").textContent.includes("重连")'), 'native status painted');
  await delay(400);
  fs.writeFileSync(path.join(artifacts, 'dashboard.png'), (await dashboard.webContents.capturePage()).toPNG());
  await dashboard.webContents.executeJavaScript(`document.querySelector('[data-view="settings"]').click()`);
  await delay(200);
  fs.writeFileSync(path.join(artifacts, 'settings.png'), (await dashboard.webContents.capturePage()).toPNG());
  await dashboard.webContents.executeJavaScript(`window.fitgate.settings({ usageLimit: 25, actionCountPerSession: 2, cameraEnabled: false, stretchSeconds: 5, activeActionId: 'seated_hold_head_down' })`);
  assert.equal(engine.settings.usageLimit, 25); assert.equal(engine.settings.actionCountPerSession, 2);
  const beforePreview = cycle(), secondsBeforePreview = engine.usage.seconds;
  let reminder = await popup(true);
  await until(() => reminder.webContents.executeJavaScript('document.querySelector("#action-count").textContent.includes("2") && !document.querySelector("#action-title").textContent.includes("读取")'), 'popup action details');
  assert.ok(await reminder.webContents.executeJavaScript('document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth'), 'default popup fits without a scrollbar');
  assert.ok(await reminder.webContents.executeJavaScript(`['clock-label','rest-time','action-title','action-count','keyboard-hint'].every(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return e.textContent.trim()&&r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight})`), 'popup information is visible');
  for (const id of ['begin', 'snooze', 'close-preview']) await assertClickable(reminder, id);
  assert.equal(await reminder.webContents.executeJavaScript('document.getElementById("snooze").textContent.trim()'), '关闭预览', 'preview does not describe its close button as snooze');
  const popupId = reminder.id;
  const pointerDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const displayWindowIds = new Map(getReminders().map(window => [window.reminderDisplayId, window.id]));
  if (nativeProbe) {
    console.log('SMOKE:NATIVE hiding FitGate while the preview blocks the displays');
    app.hide();
    await until(() => !app.isHidden() && getReminders().every(window => window.isVisible()), 'hidden app restores every reminder display', 8000);
    await until(() => status().foreground.pid === process.pid && getReminders().some(window => window.isFocused()), 'hidden app returns to the foreground', 8000);
    assertDisplayCoverage();
    assert.ok(getReminders().every(window => window.isVisible()), 'all reminder screens remain visible after app hide recovery');
    for (const window of getReminders()) assert.equal(window.id, displayWindowIds.get(window.reminderDisplayId), 'app hide recovery retains reminder windows');
    console.log('SMOKE:NATIVE app hide recovery passed');
  }
  screen.emit('display-metrics-changed', {}, pointerDisplay, ['workArea']);
  assert.equal(getReminders().find(window => window.reminderDisplayId === pointerDisplay.id)?.id, popupId, 'work area changes preserve the existing full-screen reminder');
  assert.equal(reminder.isDestroyed(), false, 'work area updates preserve the reminder renderer');
  assertDisplayCoverage();
  // Exercise display reconciliation without changing the computer's display settings.
  const displays = screen.getAllDisplays();
  const addedDisplay = { ...pointerDisplay, id: -2147483000, bounds: { ...pointerDisplay.bounds } };
  reconcileReminders([...displays, addedDisplay]);
  await until(() => getReminders().find(window => window.reminderDisplayId === addedDisplay.id)?.webContents.executeJavaScript('typeof document.querySelector("#begin")?.onclick === "function"'), 'new display receives a reminder');
  assertDisplayCoverage([...displays, addedDisplay]);
  const addedWindow = getReminders().find(window => window.reminderDisplayId === addedDisplay.id);
  reconcileReminders(displays);
  assertDisplayCoverage();
  assert.equal(addedWindow.isDestroyed(), true, 'removing a display closes only its reminder');
  for (const window of getReminders()) assert.equal(window.id, displayWindowIds.get(window.reminderDisplayId), 'display changes retain existing reminder renderers');
  const countdown = await reminder.webContents.executeJavaScript('document.querySelector("#rest-time").textContent');
  await until(async () => (await reminder.webContents.executeJavaScript('document.querySelector("#rest-time").textContent')) !== countdown, 'rest countdown advances', 5000);
  assert.ok(await reminder.webContents.executeJavaScript(`(() => {
    const r=document.querySelector('.reminder-card').getBoundingClientRect();
    return r.width<=520 && Math.abs(r.left+r.width/2-innerWidth/2)<=1 && Math.abs(r.top+r.height/2-innerHeight/2)<=1;
  })()`), 'activity card is centered within the full-screen blocker');
  await reminder.webContents.executeJavaScript('document.body.dispatchEvent(new MouseEvent("click", {bubbles:true, clientX:1, clientY:1}))');
  assertDisplayCoverage();
  assert.equal(reminder.isDestroyed(), false, 'clicking outside the card does not dismiss the reminder');
  if (visualHoldMs > 0) {
    console.log(`SMOKE: preview visual hold ${visualHoldMs}ms`);
    await delay(visualHoldMs);
    assertDisplayCoverage();
    assert.ok(getReminders().every(window => window.isVisible()), 'all reminders remain visible after visual interaction checks');
    await until(() => getReminders().some(window => window.isFocused()), 'reminder has focus after visual interaction checks', 8000);
  }
  fs.writeFileSync(path.join(artifacts, 'reminder.png'), (await reminder.webContents.capturePage()).toPNG());
  await click(reminder, 'close-preview');
  await until(() => getReminders().length === 0, 'preview button closes popup');

  assert.deepEqual(cycle(), beforePreview, 'preview leaves real reminder deadlines and lock unchanged');
  assert.ok(engine.usage.seconds >= secondsBeforePreview, 'preview does not reset accumulated computer usage');
  // Native close must remove the window from lifecycle state so another preview can open.
  reminder = await popup(true); reminder.close();
  await until(() => getReminders().length === 0, 'native preview close clears window state');
  reminder = await popup(true);
  await click(reminder, 'snooze');
  await until(() => getReminders().length === 0, 'preview secondary button closes popup');
  assert.deepEqual(cycle(), beforePreview, 'reopening and closing previews does not snooze the real cycle');
  reminder = await popup(true);
  await click(reminder, 'begin');
  await until(() => !!getWorkout() && getReminders().length === 0, 'preview starts an ordinary workout and releases its screens');
  assert.equal(getWorkout().isMovable(), true, 'preview workout is not a due-reminder lock');
  await until(() => getWorkout().webContents.executeJavaScript('!!document.getElementById("action-title")'), 'preview workout loaded');
  getWorkout().close();
  await until(() => !getWorkout(), 'preview workout closes');
  assert.deepEqual(cycle(), beforePreview, 'preview workout does not alter the real reminder cycle');
  await dashboard.webContents.executeJavaScript('window.fitgate.settings({ paused: true })');
  assert.equal(engine.settings.paused, true, 'monitoring pauses through settings IPC');
  reminder = await popup(true);
  await click(reminder, 'snooze');
  await until(() => getReminders().length === 0, 'preview remains usable while monitoring is paused');
  assert.deepEqual(cycle(), beforePreview, 'preview while paused leaves the real reminder cycle unchanged');
  await dashboard.webContents.executeJavaScript('window.fitgate.settings({ paused: false })');
  assert.equal(engine.settings.paused, false, 'monitoring resumes through settings IPC');
  // Start through the actual reminder renderer, then exercise the settings bridge and multi-set queue.
  engine.usage.isLocked = true;
  reminder = await popup(false);
  assert.ok(engine.usage.restEndsAt > Date.now(), 'real reminder starts its rest deadline');
  assert.equal(await reminder.webContents.executeJavaScript('document.getElementById("snooze").textContent.trim()'), '推迟 5 分钟');
  assert.equal(await reminder.webContents.executeJavaScript('document.getElementById("close-preview").hidden'), true);
  await click(reminder, 'begin');
  await until(() => !!getWorkout(), 'reminder primary button opens workout');
  assertDisplayCoverage();
  assert.equal(engine.usage.restEndsAt || 0, 0, 'starting workout cancels the rest countdown');
  let w = getWorkout();
  assert.equal(w.reminderDisplayId, pointerDisplay.id, 'due workout replaces the reminder on the active display');
  assert.deepEqual(w.getBounds(), pointerDisplay.bounds, 'due workout covers the full active display');
  assert.equal(w.isMovable(), false, 'due workout cannot be dragged away');
  assert.equal(w.isResizable(), false, 'due workout cannot be resized');
  assert.equal(w.isAlwaysOnTop(), true, 'due workout stays above other apps');
  if (process.env.FITGATE_TEST_HIDDEN !== '1') {
    await until(() => w.isVisible() && !reminder.isVisible(), 'protected workout replaces reminder');
  }
  assert.equal(reminder.isVisible(), false, 'the covered reminder remains hidden during its workout');
  if (process.env.FITGATE_TEST_HIDDEN !== '1') {
    for (const other of getReminders().filter(window => window !== reminder)) assert.equal(other.isVisible(), true, 'other displays remain covered during workout');
  }
  w.webContents.on('console-message', (details) => { if (details.level === 'error') errors.push(details.message); });
  await until(() => w.webContents.executeJavaScript('document.querySelector("#mode-selector")?.value === "timer" && document.querySelector("#stretch-remaining-sec")?.textContent === "5"'), 'workout initialized');
  await until(() => w.webContents.executeJavaScript('document.querySelector("#timer-guide-img")?.naturalWidth > 0'), 'offline action illustration');
  await delay(350);
  assert.ok(await w.webContents.executeJavaScript('document.getElementById("btn-toggle-timer").getBoundingClientRect().bottom <= innerHeight'), 'timer controls are within the viewport');
  fs.writeFileSync(path.join(artifacts, 'workout.png'), (await w.webContents.capturePage()).toPNG());
  await click(w, 'btn-toggle-timer');
  const remaining = await w.webContents.executeJavaScript('document.getElementById("stretch-remaining-sec").textContent');
  await delay(1200);
  assert.equal(await w.webContents.executeJavaScript('document.getElementById("stretch-remaining-sec").textContent'), remaining);
  await click(w, 'btn-toggle-timer');
  await until(() => status().today.sessions === 1, 'two real timed sets completed', 25000);
  assert.equal(status().today.sets, 2); assert.equal(engine.usage.isLocked, false); assert.equal(engine.usage.seconds, 0);
  await until(() => !getWorkout(), 'workout closes after success');
  assert.equal(getReminders().length, 0, 'completing the workout releases every display');
  // Verify bundled model + WebGL + camera path using Chromium's synthetic test camera.
  engine.updateSettings({ cameraEnabled: true, actionCountPerSession: 1 });
  openWorkout(); w = getWorkout();
  assert.equal(w.isMovable(), true, 'manual workout remains a normal movable window');
  assert.equal(getReminders().length, 0, 'manual workout does not block the other displays');
  w.webContents.on('console-message', (details) => { if (details.level === 'error') errors.push(details.message); });
  await until(() => w.webContents.executeJavaScript('document.querySelector("#webcam")?.readyState >= 2 && document.querySelector("#loading-mask")?.classList.contains("hidden")'), 'camera and offline AI model initialized', 45000);
  assert.ok(await w.webContents.executeJavaScript('document.getElementById("webcam").videoWidth > 0'));
  await delay(350);
  fs.writeFileSync(path.join(artifacts, 'camera.png'), (await w.webContents.capturePage()).toPNG());
  console.log('SMOKE: camera ready; checking suspension');
  w.webContents.send('workout-suspended');
  await until(() => w.webContents.executeJavaScript('!!document.getElementById("desktop-resume") && document.getElementById("webcam").srcObject?.getTracks().every(t => t.readyState === "ended")'), 'sleep stops camera and pauses workout');
  console.log('SMOKE: suspension passed');
  w.close();
  await until(() => !getWorkout(), 'camera workout closed');
  // Simulate Electron power events only; the computer itself is never locked.
  engine.updateSettings({ cameraEnabled: false });
  engine.usage.isLocked = true; engine.usage.snoozedUntil = 0;
  openWorkout();
  await until(() => getWorkout()?.webContents.executeJavaScript('!!document.getElementById("action-title")'), 'protected workout before lock event');
  assertDisplayCoverage();
  const sessionsBeforeLock = status().today.sessions;
  engine.usage.lastActiveAt = Date.now();
  console.log('SMOKE: simulating lock during a protected workout');
  try {
    powerMonitor.emit('lock-screen');
    await until(() => !getWorkout() && getReminders().length === 0, 'lock event closes protected workout and all blockers');
    assert.equal(engine.usage.isLocked, true, 'locking does not clear the due activity cycle');
  } finally {
    powerMonitor.emit('unlock-screen');
  }
  assert.equal(engine.usage.isLocked, true, 'brief unlock keeps the due activity cycle');
  await until(() => getReminders().length === screen.getAllDisplays().length && getReminders().every(window => !window.isDestroyed()), 'unlock rebuilds reminders on all displays');
  reminder = getReminders().find(window => window.reminderDisplayId === pointerDisplay.id);
  await until(() => reminder.webContents.executeJavaScript('typeof document.getElementById("snooze")?.onclick === "function"'), 'restored reminder is interactive');
  assertDisplayCoverage();
  assert.equal(status().today.sessions, sessionsBeforeLock, 'lock and unlock do not credit unfinished exercise');
  await click(reminder, 'snooze');
  await until(() => !engine.usage.isLocked && getReminders().length === 0 && !getWorkout(), 'snooze releases reminders restored after unlock');
  console.log('SMOKE: protected workout lock/unlock recovery passed');
  // Closing an unfinished workout restores a due reminder; snooze releases it.
  engine.usage.isLocked = true; engine.usage.snoozedUntil = 0; openWorkout();
  await until(() => getWorkout()?.webContents.executeJavaScript('!!document.getElementById("action-title")'), 'unfinished workout');
  console.log('SMOKE: closing unfinished workout');
  getWorkout().close();
  await until(() => getReminders().length > 0 && getReminders()[0].webContents.executeJavaScript('!!document.querySelector("#snooze")'), 'due reminder');
  assertDisplayCoverage();
  reminder = getReminders().find(window => window.reminderDisplayId === pointerDisplay.id);
  await click(reminder, 'begin');
  await until(() => !!getWorkout(), 'unfinished workout can be started again');
  assertDisplayCoverage();
  await click(reminder, 'snooze');
  await until(() => !engine.usage.isLocked && getReminders().length === 0 && !getWorkout(), 'snooze closes both the protected workout and every reminder');
  console.log('SMOKE: snooze passed');
  assert.ok(engine.usage.snoozedUntil > Date.now());
  dismissReminders();
  const beforeRest = status().today.sessions;
  engine.usage.isLocked = true; engine.usage.snoozedUntil = 0; showReminder(false);
  assert.ok(engine.usage.restEndsAt > Date.now());
  engine.usage.restEndsAt = Date.now() + 1200;
  await until(() => !engine.usage.isLocked && getReminders().length === 0, 'rest deadline closes the reminder');
  assert.equal(status().today.sessions, beforeRest, 'rest does not credit exercise');
  assert.deepEqual(pandaRequests, [], 'no panda artwork, animation, or manifest was requested');
  assert.deepEqual(await dashboard.webContents.executeJavaScript('performance.getEntriesByType("resource").map(entry=>entry.name).filter(name=>/panda/i.test(name))'), [], 'dashboard did not load panda assets');
  webSession.webRequest.onBeforeRequest(null);
  const realErrors = errors.filter(e => !e.includes('favicon.ico') && !e.includes('GPU stall'));
  assert.deepEqual(realErrors, [], 'no renderer errors');
  fs.writeFileSync(path.join(artifacts, 'smoke-result.json'), JSON.stringify({ passed: true, version: app.getVersion(), arch: process.arch, translated: app.runningUnderARM64Translation, darwin: os.release(), packaged: app.isPackaged, electron: process.versions.electron, native: true, settings: true, multiSetTimer: true, cameraModel: true, reminder: true, fullScreenReminder: true, allDisplaysCovered: true, immovableReminder: true, protectedWorkout: true, lockRecovery: true, nativeHideRecovery: nativeProbe, previewLifecycle: true, pausedPreview: true, displayUpdatesPreservePopup: true, displayAddRemove: true, noAnimationRequests: true, snooze: true, errors }, null, 2));
  console.log('SMOKE PASSED: native monitor, dashboard, settings, full-screen multi-display reminder, protected workout, lock/unlock recovery, preview lifecycle, display reconciliation, no animation requests, two timed sets, pause/resume, completion, offline MoveNet + synthetic camera, snooze.');
}
