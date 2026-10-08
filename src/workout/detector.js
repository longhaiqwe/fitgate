// MoveNet 姿态检测模型加载与推理封装模块
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

let detectorInstance = null;
let isInitializing = false;

/**
 * 初始化姿态检测器 (完全使用本地打包的模型权重，彻底零外网请求与延迟)
 */
export async function initPoseDetector(onProgress = () => {}) {
  if (detectorInstance) {
    return detectorInstance;
  }
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return detectorInstance;
  }

  isInitializing = true;
  try {
    onProgress('正在启用 WebGL 硬件图形加速...');
    await tf.setBackend('webgl');
    await tf.ready();

    // 100% 离线本地加载，直接从扩展内部读取已下载的 MoveNet 静态权重文件
    const localModelUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('models/movenet/model.json')
      : '/models/movenet/model.json';

    onProgress('正在从本地秒级载入 MoveNet 骨骼模型...');
    detectorInstance = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        modelUrl: localModelUrl,
        enableSmoothing: true,
        minPoseScore: 0.25
      }
    );

    // 预热 Shader 着色器（避免第一帧卡顿）
    try {
      const dummy = tf.zeros([192, 192, 3], 'int32');
      await detectorInstance.estimatePoses(dummy);
      dummy.dispose();
    } catch {
      // 预热容错
    }

    onProgress('AI 姿态引擎准备就绪');
    return detectorInstance;
  } finally {
    isInitializing = false;
  }
}

/**
 * 推断单帧人体姿态
 * @param {HTMLVideoElement | HTMLCanvasElement} imageSource 
 */
export async function detectPose(imageSource) {
  if (!detectorInstance) {
    throw new Error('姿态检测器尚未初始化，请先调用 initPoseDetector()');
  }

  const poses = await detectorInstance.estimatePoses(imageSource, {
    maxPoses: 1,
    flipHorizontal: false
  });

  if (poses && poses.length > 0) {
    return poses[0];
  }
  return null;
}
