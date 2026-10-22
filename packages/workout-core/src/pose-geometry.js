export function getKp(keypoints, index, minScore = 0.2) {
  if (!keypoints || !keypoints[index]) return null;
  const kp = keypoints[index];
  if (kp.score !== undefined && kp.score < minScore) return null;
  if (!Number.isFinite(kp.x) || !Number.isFinite(kp.y)) return null;
  return kp;
}

export function getMidPoint(p1, p2) {
  if (!p1 && !p2) return null;
  if (!p1) return { x: p2.x, y: p2.y };
  if (!p2) return { x: p1.x, y: p1.y };
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
}

export function calcDistance(p1, p2) {
  if (!p1 || !p2) return 0;
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * 计算向量与竖直向下方向的夹角 (度数 0 ~ 180)
 * 0度表示正向下，90度水平，180度正向上
 */
export function calcAngleWithVertical(fromPt, toPt) {
  if (!fromPt || !toPt) return 0;
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const rad = Math.atan2(Math.abs(dx), Math.abs(dy));
  return Math.round((rad * 180) / Math.PI);
}

/**
 * 计算三点连线夹角 (度数 0 ~ 180)
 */
export function calcJointAngle(p1, vertex, p2) {
  if (!p1 || !vertex || !p2) return 180;
  const ux = p1.x - vertex.x;
  const uy = p1.y - vertex.y;
  const vx = p2.x - vertex.x;
  const vy = p2.y - vertex.y;
  const uMag = Math.hypot(ux, uy);
  const vMag = Math.hypot(vx, vy);
  if (uMag === 0 || vMag === 0) return 180;
  let cos = (ux * vx + uy * vy) / (uMag * vMag);
  cos = Math.max(-1, Math.min(1, cos));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

