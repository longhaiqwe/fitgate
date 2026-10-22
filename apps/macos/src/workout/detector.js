// MoveNet 姿态检测模型加载与推理封装模块
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

import { createPoseDetector } from '@fitgate/workout-core/pose-detector.js';

export const { initPoseDetector, detectPose } = createPoseDetector({
  tf, poseDetection,
  getModelUrl: () => typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('models/movenet/model.json')
    : '/models/movenet/model.json',
  messages: {"initializing": "正在初始化姿态检测…", "loading": "正在加载本地姿态检测模型…", "ready": "姿态检测已就绪"}
});
