import { ACTIONS } from './actions-data.js';
// Keep these historical labels even when the display copy changes again.
const legacyNames = new Map([
  ['背后交扣侧头', 'seated_behind_neck'], ['坐姿侧头舒展', 'seated_behind_neck'],
  ['耳朵找肩膀', 'seated_ear_shoulder'], ['低头看腋窝', 'seated_look_armpit'],
  ['手按锁骨看斜上方', 'seated_press_collarbone'],
  ['托后脑低头', 'seated_hold_head_down'], ['托住后脑低头', 'seated_hold_head_down'],
  ['举手翻掌', 'standing_raise_hands'], ['胳膊向后旋', 'standing_arms_rotate'],
  ['扶腰后伸', 'standing_waist_stretch'], ['站姿小燕飞', 'standing_swallow_fly'],
  ['交叉腿叉腰侧屈', 'standing_cross_leg_side_bend'],
  ['标准深蹲', 'home_squats'], ['活力开合跳', 'home_jumping_jacks'], ['开合跳', 'home_jumping_jacks'],
  ['站立 5 分钟', 'standing_five_minutes'],
  ...ACTIONS.map(action => [action.name, action.id])
]);
const namesById = new Map(ACTIONS.map(action => [action.id, action.name]));
export const actionRecordId = key => legacyNames.get(key) || key;
export const actionRecordName = key => namesById.get(actionRecordId(key)) || key;
export function normalizeActionRecords(records = {}) {
  const result = new Map();
  for (const [key, value] of Object.entries(records)) {
    const id = actionRecordId(key);
    result.set(id, (result.get(id) || 0) + (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0));
  }
  return Object.fromEntries(result);
}
