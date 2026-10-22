import { StretchRunner as CoreStretchRunner } from '@fitgate/workout-core/stretch-runner.js';
export { STRETCH_STATES } from '@fitgate/workout-core/stretch-runner.js';

// Preserve the extension's existing wall-clock timer behavior.
export class StretchRunner extends CoreStretchRunner {
  constructor(options = {}) {
    super({ maxIntervalSeconds: Infinity, ...options });
  }
}
