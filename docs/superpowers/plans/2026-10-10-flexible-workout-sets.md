# 灵活动作组数与时长联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现「灵活动作组数与时长联动」功能：支持用户自由设置每次锁屏需要完成的动作组数（1~5 组），提供常见快捷预设（25m/1组、50m/3组），并在伴练页面中实现多动作队列的连续执行与自动平滑切换，全部动作完成后解锁受控页面。

**Architecture:**
- **数据与存储层**：在 `constants.js` 和 `storage.js` 中增加 `actionCountPerSession` 配置项、快捷预设定义与 `getCurrentWorkoutQueue()` 队列生成函数；
- **配置与展示层**：在 `popup` 中增加快捷预设按钮组与动作组数双向滑块输入；在 `content` 锁屏遮罩中动态感知本轮动作组数；
- **执行引擎层**：在 `workout.js` 中维护多动作执行上下文（队列、当前索引、过渡态），单动作达标后自动进入下一个动作，全部达标后广播解锁。

**Tech Stack:**
- Chrome Extension Manifest V3 (Storage, Runtime messaging, Closed Shadow DOM)
- MoveNet Lightning AI 姿态检测模型 / 倒计时伴练器 (StretchRunner)
- Web Audio API (音效合成)
- 原生 ESM / Node.js 20+ 内置测试运行器 (`node --test`) / Vite 5

---

### Task 1: 动作组数解析与格式化工具函数

**Files:**
- Modify: `src/shared/duration-parser.js`
- Modify: `test/duration-parser.test.js`

**Interfaces:**
- Produces: `parseActionCountInput(raw: string): number | null` (有效范围 1~5)
- Produces: `formatActionCount(val: number): string` (输出 `${val} 组`)

- [ ] **Step 1: 编写失败测试**
  在 `test/duration-parser.test.js` 中增加针对 `parseActionCountInput` 和 `formatActionCount` 的测试用例（合法数字、带“组”单位、空值、超范围值截断或报错）。

- [ ] **Step 2: 运行测试验证失败**
  `node test/duration-parser.test.js` 预期失败。

- [ ] **Step 3: 实现工具函数**
  在 `src/shared/duration-parser.js` 中实现 `parseActionCountInput` 和 `formatActionCount` 并导出。

- [ ] **Step 4: 运行测试验证通过**
  `node test/duration-parser.test.js` 预期全部 PASS。

---

### Task 2: 动作组数配置、预设定义与队列抽取方法

**Files:**
- Modify: `src/shared/constants.js`
- Modify: `src/shared/storage.js`
- Modify: `test/storage-settings.test.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.actionCountPerSession = 1`
- Produces: `WORKOUT_PRESETS` 预设数组
- Produces: `getCurrentWorkoutQueue(): Promise<Array<Action>>` (返回 N 个动作对象的数组)

- [ ] **Step 1: 编写失败测试**
  在 `test/storage-settings.test.js` 中添加针对 `getCurrentWorkoutQueue()` 的测试用例：
  - 测试默认返回 1 个动作的队列；
  - 测试设置 `actionCountPerSession = 3` 时，智能轮换模式下返回 3 个不重复的动作；
  - 测试固定某个动作时（如 `home_squats`），返回包含 3 个相同动作对象的队列。

- [ ] **Step 2: 运行测试验证失败**
  `node test/storage-settings.test.js` 预期失败。

- [ ] **Step 3: 修改 `src/shared/constants.js`**
  增加 `actionCountPerSession: 1` 默认值与 `WORKOUT_PRESETS` 预设列表。

- [ ] **Step 4: 修改 `src/shared/storage.js`**
  实现 `getCurrentWorkoutQueue()`，并让 `getCurrentWorkoutAction()` 内部调用 `getCurrentWorkoutQueue()` 取首个动作，保持向后兼容。

- [ ] **Step 5: 运行测试验证通过**
  `node test/storage-settings.test.js` 预期全部 PASS。

---

### Task 3: 控制面板 Popup 支持动作组数设置与快捷预设

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.css`
- Modify: `src/popup/popup.js`

- [ ] **Step 1: 修改 `src/popup/popup.html`**
  - 在设置视图中加入快捷预设胶囊按钮组（「25m / 1组」、「50m / 3组」）；
  - 增加「每次动作组数」调节项（滑块 `input-action-count` 与文本输入框 `input-action-count-text`）。

- [ ] **Step 2: 修改 `src/popup/popup.css`**
  添加快捷预设按钮组的样式、动作组数滑动条与输入框的紧凑排版样式。

- [ ] **Step 3: 修改 `src/popup/popup.js`**
  - 使用 `bindManualInput` 绑定动作组数滑块与输入框的联动与持久化；
  - 绑定快捷预设按钮点击事件：一键更新时长（`usageLimit`）和组数（`actionCountPerSession`），保存并给出 toast 提示；
  - 初始加载时正确填充预设和组数值。

---

### Task 4: 锁屏遮罩感知多动作组数

**Files:**
- Modify: `src/content/index.js`
- Modify: `src/content/overlay.css`

- [ ] **Step 1: 修改 `src/content/index.js`**
  在 `updateOverlayCardContent()` 中使用 `getCurrentWorkoutQueue()` 获取队列：
  - 若队列长度为 1，保持原样显示；
  - 若队列长度 > 1，展示「共 N 组动作 · 首个：[动作名]」，让用户明确知晓解锁所需的任务量。

- [ ] **Step 2: 优化 `src/content/overlay.css`**
  调整微浮层文本折行与排版，确保多组动作文案显示平整美观。

---

### Task 5: 伴练工作台多动作队列执行与自动切换

**Files:**
- Modify: `src/workout/workout.html`
- Modify: `src/workout/workout.css`
- Modify: `src/workout/workout.js`

- [ ] **Step 1: 修改 `src/workout/workout.html`**
  在顶部状态条中添加队列进度徽章与步骤指示容器（如 `#queue-progress-badge`）。

- [ ] **Step 2: 修改 `src/workout/workout.css`**
  增加多动作队列进度指示徽章与平滑切换过渡效果的样式。

- [ ] **Step 3: 修改 `src/workout/workout.js`**
  - 初始化时调用 `getCurrentWorkoutQueue()` 获取本轮动作队列 `workoutQueue`；
  - 维护 `currentQueueIndex`；
  - 更新顶部指示器（显示如「第 1/3 组」）；
  - 单动作达标时：若队列未完，播放过渡音效，显示切换提示，延迟 1.5 秒调用 `loadAction()` 自动切换到下一动作并重置状态机；
  - 最后一组达标时：触发 `handleGoalAccomplished()` 播放通关音效、发送解锁消息并自动关闭页面。

---

### Task 6: 完整构建与回归测试验证

**Files:**
- Verification: `npm test`
- Verification: `npm run build`

- [ ] **Step 1: 运行全量测试**
  `npm test` 确保所有 11 个测试套件全部通过。

- [ ] **Step 2: 运行 Vite 构建**
  `npm run build` 确保生产环境打包成功无语法或模块导入错误。
