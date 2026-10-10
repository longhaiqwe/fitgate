import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUsageLimitInput,
  parseStretchSecondsInput,
  parseSquatTargetInput,
  formatUsageLimit,
  formatStretchSeconds,
  formatSquatTarget,
  parseActionCountInput,
  formatActionCount
} from '../src/shared/duration-parser.js';

test('parseUsageLimitInput: 正确解析各种格式的累计使用上限', () => {
  // 常见中文单位
  assert.strictEqual(parseUsageLimitInput('30 分钟'), 30);
  assert.strictEqual(parseUsageLimitInput('30分钟'), 30);
  assert.strictEqual(parseUsageLimitInput('45分'), 45);

  // 常见英文单位
  assert.strictEqual(parseUsageLimitInput('30m'), 30);
  assert.strictEqual(parseUsageLimitInput('30min'), 30);
  assert.strictEqual(parseUsageLimitInput('25 mins'), 25);
  assert.strictEqual(parseUsageLimitInput('20 minutes'), 20);

  // 纯数字
  assert.strictEqual(parseUsageLimitInput('20'), 20);
  assert.strictEqual(parseUsageLimitInput(20), 20);

  // 小时换算
  assert.strictEqual(parseUsageLimitInput('1小时'), 60);
  assert.strictEqual(parseUsageLimitInput('1h'), 60);
  assert.strictEqual(parseUsageLimitInput('1.5小时'), 90);
  assert.strictEqual(parseUsageLimitInput('1.5h'), 90);
  assert.strictEqual(parseUsageLimitInput('1小时30分'), 90);
  assert.strictEqual(parseUsageLimitInput('1h20m'), 80);

  // 秒换算为分钟
  assert.strictEqual(parseUsageLimitInput('120s'), 2);
  assert.strictEqual(parseUsageLimitInput('90秒'), 2);
  assert.strictEqual(parseUsageLimitInput('30秒'), 1); // 不足1分钟取1分钟

  // 边界约束 (1 ~ 180)
  assert.strictEqual(parseUsageLimitInput('0 分钟'), 1);
  assert.strictEqual(parseUsageLimitInput('300 分钟'), 180);

  // 非法输入拦截
  assert.strictEqual(parseUsageLimitInput(''), null);
  assert.strictEqual(parseUsageLimitInput('abc'), null);
  assert.strictEqual(parseUsageLimitInput('-10'), null);
  assert.strictEqual(parseUsageLimitInput(null), null);
});

test('parseStretchSecondsInput: 正确解析各种格式的单侧拉伸目标时长', () => {
  // 常见秒单位
  assert.strictEqual(parseStretchSecondsInput('20s'), 20);
  assert.strictEqual(parseStretchSecondsInput('20 s'), 20);
  assert.strictEqual(parseStretchSecondsInput('20秒'), 20);
  assert.strictEqual(parseStretchSecondsInput('20 秒'), 20);
  assert.strictEqual(parseStretchSecondsInput('25sec'), 25);
  assert.strictEqual(parseStretchSecondsInput('25 secs'), 25);

  // 纯数字
  assert.strictEqual(parseStretchSecondsInput('30'), 30);
  assert.strictEqual(parseStretchSecondsInput(30), 30);

  // 分钟换算为秒
  assert.strictEqual(parseStretchSecondsInput('1m'), 60);
  assert.strictEqual(parseStretchSecondsInput('1分钟'), 60);
  assert.strictEqual(parseStretchSecondsInput('1分'), 60);
  assert.strictEqual(parseStretchSecondsInput('0.5分'), 30);
  assert.strictEqual(parseStretchSecondsInput('0.5m'), 30);

  // 边界约束 (5 ~ 180)
  assert.strictEqual(parseStretchSecondsInput('2s'), 5);
  assert.strictEqual(parseStretchSecondsInput('300秒'), 180);

  // 非法输入拦截
  assert.strictEqual(parseStretchSecondsInput(''), null);
  assert.strictEqual(parseStretchSecondsInput('hello'), null);
  assert.strictEqual(parseStretchSecondsInput('-5s'), null);
  assert.strictEqual(parseStretchSecondsInput(undefined), null);
});

test('parseSquatTargetInput: 正确解析各种格式的深蹲目标', () => {
  assert.strictEqual(parseSquatTargetInput('10 次'), 10);
  assert.strictEqual(parseSquatTargetInput('15次'), 15);
  assert.strictEqual(parseSquatTargetInput('12个'), 12);
  assert.strictEqual(parseSquatTargetInput('20 reps'), 20);
  assert.strictEqual(parseSquatTargetInput('10'), 10);
  assert.strictEqual(parseSquatTargetInput(10), 10);

  // 边界约束 (1 ~ 100)
  assert.strictEqual(parseSquatTargetInput('0 次'), null);
  assert.strictEqual(parseSquatTargetInput('150 次'), 100);

  // 非法输入拦截
  assert.strictEqual(parseSquatTargetInput(''), null);
  assert.strictEqual(parseSquatTargetInput('xyz'), null);
  assert.strictEqual(parseSquatTargetInput('-1'), null);
});

test('parseActionCountInput: 正确解析动作组数输入 (1~5)', () => {
  assert.strictEqual(parseActionCountInput('1 组'), 1);
  assert.strictEqual(parseActionCountInput('3组'), 3);
  assert.strictEqual(parseActionCountInput('2组动作'), 2);
  assert.strictEqual(parseActionCountInput('4 sets'), 4);
  assert.strictEqual(parseActionCountInput('5'), 5);
  assert.strictEqual(parseActionCountInput(3), 3);

  // 边界约束 (1 ~ 5)
  assert.strictEqual(parseActionCountInput('0 组'), null);
  assert.strictEqual(parseActionCountInput('10 组'), 5);

  // 非法输入拦截
  assert.strictEqual(parseActionCountInput(''), null);
  assert.strictEqual(parseActionCountInput('abc'), null);
  assert.strictEqual(parseActionCountInput('-2'), null);
  assert.strictEqual(parseActionCountInput(null), null);
});

test('格式化输出函数验证', () => {
  assert.strictEqual(formatUsageLimit(30), '30 分钟');
  assert.strictEqual(formatStretchSeconds(20), '20 秒');
  assert.strictEqual(formatSquatTarget(10), '10 次');
  assert.strictEqual(formatActionCount(3), '3 组');
});

