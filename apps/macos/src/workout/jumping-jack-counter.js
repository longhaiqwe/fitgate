import { JumpingJackCounter as CoreJumpingJackCounter } from '@fitgate/workout-core/jumping-jack-counter.js';
export { JJ_STATES } from '@fitgate/workout-core/jumping-jack-counter.js';

export class JumpingJackCounter extends CoreJumpingJackCounter {
  constructor(options = {}) {
    super({
      feedback: { OPENING: '跳起，双臂举过头顶、双脚跳开', OPEN: '跳开达标，请收拢双臂双脚' },
      incompleteFeedback: '起跳幅度不足，请将双臂举过头顶',
      countFeedback: count => `已完成 ${count} 次`,
      ...options
    });
  }
}
