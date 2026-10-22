import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoseDetector } from '../src/pose-detector.js';

test('detector adapters keep model URLs and instances isolated across platforms', async () => {
  const urls = [], backends = [], disposed = [], messages = [];
  const tf = {
    async setBackend(name) { backends.push(name); },
    async ready() {},
    zeros() { return { dispose() { disposed.push(true); } }; }
  };
  const poseDetection = {
    SupportedModels: { MoveNet: 'MoveNet' },
    movenet: { modelType: { SINGLEPOSE_LIGHTNING: 'lightning' } },
    async createDetector(model, options) {
      assert.equal(model, 'MoveNet');
      urls.push(options.modelUrl);
      return { async estimatePoses() { return [{ source: options.modelUrl }]; } };
    }
  };
  const make = url => createPoseDetector({
    tf, poseDetection, getModelUrl: () => url,
    messages: { initializing: 'init', loading: 'load', ready: 'ready' }
  });
  const extension = make('chrome-extension://test/models/movenet/model.json');
  const desktop = make('/models/movenet/model.json');
  await assert.rejects(extension.detectPose({}), /尚未初始化/);
  const first = await extension.initPoseDetector(message => messages.push(message));
  assert.equal(await extension.initPoseDetector(), first);
  assert.notEqual(await desktop.initPoseDetector(), first);
  assert.deepEqual(urls, ['chrome-extension://test/models/movenet/model.json', '/models/movenet/model.json']);
  assert.deepEqual(backends, ['webgl', 'webgl']);
  assert.deepEqual(messages, ['init', 'load', 'ready']);
  assert.equal(disposed.length, 2);
  assert.equal((await extension.detectPose({})).source, urls[0]);
  assert.equal((await desktop.detectPose({})).source, urls[1]);
});
