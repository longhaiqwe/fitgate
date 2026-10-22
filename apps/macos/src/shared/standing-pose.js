const calcDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function calcJointAngle(a, b, c) {
  const magnitude = calcDistance(a, b) * calcDistance(c, b);
  if (!magnitude) return 0;
  const cosine = ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / magnitude;
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}
export function isFreshStandingFrame(video, stream, previousTime) {
  return video.readyState >= 2 && video.currentTime !== previousTime
    && !!stream?.getVideoTracks().some(track => track.readyState === 'live' && !track.muted);
}

// Shoulders, hips and knees distinguish an upright torso with extended thighs.
// Ankles may be outside a desktop webcam frame and are deliberately ignored.
export function evaluateStanding(keypoints) {
  const indices = [5, 6, 11, 12, 13, 14];
  const visible = indices.every(i => Number.isFinite(keypoints?.[i]?.score) && (keypoints[i].score >= 0.5 && Number.isFinite(keypoints[i].x) && Number.isFinite(keypoints[i].y)));
  let matched = false;
  if (visible) {
    matched = [[5, 11, 13], [6, 12, 14]].every(([s, h, k]) => {
      const [shoulder, hip, knee] = [s, h, k].map(i => keypoints[i]);
      const torso = calcDistance(shoulder, hip);
      return torso > 10 && hip.y - shoulder.y > torso * 0.7
        && knee.y - hip.y > torso * 0.45
        && calcJointAngle(shoulder, hip, knee) >= 155;
    });
  }
  return {
    matched, rawMatched: matched,
    feedback: !visible ? '请让双肩、髋部和膝盖完整入镜，无需拍到脚踝' : matched ? '已检测到站立，继续自然站立；坐下或离开画面会暂停' : '计时已暂停，请自然站立，让髋部和膝盖保持可见',
    statusText: matched ? '站立计时中' : '站立计时暂停',
    statusClass: matched ? 'bottom' : 'waiting', metricName: '站立检测', metricValue: matched ? '已站立' : '未确认'
  };
}
