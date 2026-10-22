import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageEngine } from '../electron/engine.js';
import { reminderWindowOptions } from '../electron/reminder-window.js';
import { REMINDER_REST_MS, remainingRestSeconds, formatRestTime } from '../src/shared/reminder-timer.js';
const now=new Date(2026,9,12,12).getTime();
function due(){const e=new UsageEngine({settings:{cameraEnabled:false}},now);e.usage.seconds=1200;e.usage.isLocked=true;return e;}
function tick(e,t,options={}){e.tick({now:t,idle:0,activeApp:{id:'test',name:'Test'},target:true,...options});}
test('reminder covers the full display including the menu bar and Dock areas',()=>{
  const bounds={x:0,y:0,width:1920,height:1080};
  const o=reminderWindowOptions(bounds);
  assert.deepEqual({x:o.x,y:o.y,width:o.width,height:o.height},bounds);
  assert.equal(o.transparent,false);assert.equal(o.backgroundColor,'#f7f8fa');assert.equal(o.frame,false);
  assert.equal(o.hasShadow,false);assert.equal(o.roundedCorners,false);
  assert.equal(o.movable,false);assert.equal(o.resizable,false);assert.equal(o.alwaysOnTop,true);
  assert.equal(o.minimizable,false);assert.equal(o.maximizable,false);
});
test('reminder covers displays to the left and above the primary display without inset margins',()=>{
  for(const bounds of [{x:-1920,y:-120,width:1920,height:1080},{x:1440,y:-900,width:1025,height:769}]) {
    const o=reminderWindowOptions(bounds);
    assert.deepEqual({x:o.x,y:o.y,width:o.width,height:o.height},bounds);
  }
});
test('reminder uses display dimensions instead of a fixed popup size on small screens',()=>{
  const bounds={x:12,y:20,width:360,height:540};
  const o=reminderWindowOptions(bounds);
  assert.deepEqual({x:o.x,y:o.y,width:o.width,height:o.height},bounds);
});
test('building reminder options preserves the display geometry for reconciliation',()=>{
  const bounds=Object.freeze({x:-1200,y:0,width:1200,height:800});
  const first=reminderWindowOptions(bounds),second=reminderWindowOptions(bounds);
  first.x=999;
  assert.equal(bounds.x,-1200);assert.equal(second.x,-1200);
});
test('rest uses an absolute deadline and reopening the reminder does not restart it',()=>{
  const e=due();e.beginRest(now);e.beginRest(now+1000);assert.equal(e.usage.restEndsAt,now+REMINDER_REST_MS);
  tick(e,now+REMINDER_REST_MS-1);assert.equal(e.usage.isLocked,true);
  tick(e,now+REMINDER_REST_MS);assert.equal(e.usage.isLocked,false);assert.equal(e.usage.seconds,0);
  assert.equal(e.day(now).sessions,0);assert.equal(e.day(now).sets,0);
});
test('rest deadline survives restart and can expire without crediting exercise',()=>{
  const e=due();e.beginRest(now);
  const restored=new UsageEngine(e.snapshot(),now+REMINDER_REST_MS+1000);tick(restored,now+REMINDER_REST_MS+1000);
  assert.equal(restored.usage.isLocked,false);assert.equal(restored.day(now).sessions,0);
});
test('snooze cancels rest and still allows a full five-minute delay',()=>{
  const e=due();e.beginRest(now);e.snooze(now+1000);assert.equal(e.usage.restEndsAt,0);
  assert.equal(e.usage.snoozedUntil,now+301000);assert.equal(e.usage.isLocked,false);
});
test('starting workout cancels countdown and unfinished workout gets a new deadline',()=>{
  const e=due();e.beginRest(now);e.cancelRest();tick(e,now+REMINDER_REST_MS,{workout:true});
  assert.equal(e.usage.isLocked,true);assert.equal(e.day(now).sessions,0);
  e.beginRest(now+REMINDER_REST_MS);assert.equal(e.usage.restEndsAt,now+2*REMINDER_REST_MS);
});
test('countdown rounds up and never displays negative values',()=>{
  assert.equal(formatRestTime(remainingRestSeconds(now+REMINDER_REST_MS,now)),'05:00');
  assert.equal(formatRestTime(remainingRestSeconds(now+1001,now)),'00:02');
  assert.equal(formatRestTime(remainingRestSeconds(now-1000,now)),'00:00');
});
