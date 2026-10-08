// MoveNet 姿态检测模型加载与推理封装模块
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

let detectorInstance = null;
let isInitializing = false;

/**
 * 初始化姿态检测器
 */
export async function initPoseDetector(onProgress = () => {}) {
  if (detectorInstance) {
    return detectorInstance;
  }
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return detectorInstance;
  }

  isInitializing = true;
  try {
    onProgress('正在初始化 WebGL 高性能图形加速...');
    await tf.setBackend('webgl');
    await tf.ready();

    onProgress('正在加载 MoveNet 骨骼姿态模型...');
    detectorInstance = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
        minPoseScore: 0.25
      }
    );

    onProgress('模型加载完毕，准备就绪');
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
