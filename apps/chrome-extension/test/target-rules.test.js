import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNS_SERVICES,
  DEFAULT_SNS_SETTINGS,
  normalizeDomainEntry,
  normalizeDomainList,
  matchTarget,
  getActiveDomains
} from '../src/shared/target-rules.js';

test('SNS_SERVICES 应包含 7 大预设平台定义', () => {
  assert.equal(SNS_SERVICES.length, 7);
  const keys = SNS_SERVICES.map(s => s.key);
  assert.deepEqual(keys, ['x', 'facebook', 'reddit', 'threads', 'bluesky', 'youtube', 'youtubeShorts']);
});

test('normalizeDomainEntry 域名清洗功能', () => {
  assert.equal(normalizeDomainEntry('https://www.bilibili.com/video/123'), 'bilibili.com');
  assert.equal(normalizeDomainEntry('http://weibo.com/u/456'), 'weibo.com');
  assert.equal(normalizeDomainEntry('*.zhihu.com'), 'zhihu.com');
  assert.equal(normalizeDomainEntry('twitter.com'), 'x.com');
  assert.equal(normalizeDomainEntry('  X.COM  '), 'x.com');
  assert.equal(normalizeDomainEntry('invalid_domain'), '');
});

test('normalizeDomainList 去重与规范化', () => {
  const input = ['https://bilibili.com', 'bilibili.com', '  douyin.com  ', 'twitter.com', ''];
  const res = normalizeDomainList(input);
  assert.deepEqual(res, ['bilibili.com', 'douyin.com', 'x.com']);
});

test('YouTube 与 YouTube Shorts 路径分流隔离匹配', () => {
  // 1. YouTube 与 Shorts 都勾选时
  const allOnSettings = {
    sns: { ...DEFAULT_SNS_SETTINGS },
    customEnabled: true,
    customDomains: []
  };

  const normalMatch = matchTarget('www.youtube.com', '/watch?v=123', allOnSettings);
  assert.ok(normalMatch);
  assert.equal(normalMatch.serviceKey, 'youtube');

  const shortsMatch = matchTarget('youtube.com', '/shorts/xyz', allOnSettings);
  assert.ok(shortsMatch);
  assert.equal(shortsMatch.serviceKey, 'youtubeShorts');

  // 2. 只勾选 YouTube，不勾选 Shorts
  const onlyYoutubeSettings = {
    sns: { ...DEFAULT_SNS_SETTINGS, youtube: true, youtubeShorts: false },
    customEnabled: false,
    customDomains: []
  };
  assert.ok(matchTarget('youtube.com', '/watch', onlyYoutubeSettings));
  assert.equal(matchTarget('youtube.com', '/shorts/xyz', onlyYoutubeSettings), null);

  // 3. 只勾选 Shorts，不勾选普通 YouTube
  const onlyShortsSettings = {
    sns: { ...DEFAULT_SNS_SETTINGS, youtube: false, youtubeShorts: true },
    customEnabled: false,
    customDomains: []
  };
  assert.equal(matchTarget('youtube.com', '/watch', onlyShortsSettings), null);
  assert.ok(matchTarget('youtube.com', '/shorts/xyz', onlyShortsSettings));
});

test('X 与 Twitter 别名命中', () => {
  const settings = {
    sns: { ...DEFAULT_SNS_SETTINGS, x: true },
    customEnabled: false,
    customDomains: []
  };
  assert.ok(matchTarget('x.com', '/home', settings));
  assert.ok(matchTarget('twitter.com', '/home', settings));
});

test('自定义“其他网站”命中与开关控制', () => {
  const settings = {
    sns: { x: false, facebook: false, reddit: false, threads: false, bluesky: false, youtube: false, youtubeShorts: false },
    customEnabled: true,
    customDomains: ['bilibili.com', 'weibo.com']
  };

  assert.ok(matchTarget('www.bilibili.com', '/feed', settings));
  assert.ok(matchTarget('weibo.com', '/', settings));
  assert.equal(matchTarget('zhihu.com', '/', settings), null);

  // 当关闭 customEnabled 时
  settings.customEnabled = false;
  assert.equal(matchTarget('www.bilibili.com', '/feed', settings), null);
});
