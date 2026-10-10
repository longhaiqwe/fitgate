# 场景化动作分类与工位动作库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 FitGate 防沉迷动作重构为场景化体系：分为「办公室·坐姿(不可站立)」、「办公室·站立(可站起来)」和「居家办公(全身大动作)」，接入 Obsidian 长文中的 10 个工位拉伸动作（含图文和安全指引），支持多场景切换、定时伴练与深蹲 AI 视觉检测无缝并存。

**Architecture:**
1. **数据层 (`src/shared/actions-data.js`)**：定义三类场景模型（办公室坐姿、办公室站立、居家大动作）与 11 个动作详细元数据（ID、名称、场景分类、配图、功效、步骤、安全判定、训练类型[单侧/双侧定时/循环计数/AI姿态]）。
2. **设置与状态层 (`src/shared/constants.js` / `storage.js`)**：扩展用户场景偏好设置（`scenario`）、当前选中动作与动作轮换机制。
3. **控制面板 (`src/popup/`)**：增加三场景切换卡片、动作详情与缩略图预览、不同场景下的目标配置。
4. **锁屏拦截 (`src/content/`)**：动态读取当前场景与推荐动作，提示卡片展示契合当前场景的动作名称、标签与时长/次数。
5. **训练伴练工作台 (`src/workout/`)**：重构为统一舞台，同时支持「工位拉伸计时/换侧/循环伴练」与「居家 MoveNet 视觉深蹲」，展示原著高清指导图与安全禁忌，支持一键切换动作。

**Tech Stack:**
- Chrome Extension Manifest V3 (Storage, Runtime messaging, Closed Shadow DOM)
- MoveNet Lightning AI 姿态检测模型 (TensorFlow.js WebGL 本地推理)
- Web Audio API (无依赖音效合成)
- 原生 ESM / Vite 5

---

### Task 1: 建立场景与动作数据库 (`src/shared/actions-data.js`)

**Files:**
- Create: `src/shared/actions-data.js`
- Modify: `public/manifest.json:42-52`
- Test: `test/actions-data.test.js`

- [ ] **Step 1: 编写动作库数据测试**
  验证场景分类定义、10个工位动作+1个深蹲动作元数据完整性、按场景筛选动作逻辑、随机动作抽取逻辑。

- [ ] **Step 2: 运行测试验证失败**
  `node test/actions-data.test.js` -> 预期因文件未创建而报错。

- [ ] **Step 3: 编写 `src/shared/actions-data.js`**
  实现完整的场景定义（`SCENARIOS`）、11个动作完整数据（包含配图路径、管什么、怎么做、安全提示、时长/次数规格、类型），以及辅助函数 `getActionsByScenario(scenario)`、`getActionById(id)`、`getRandomAction(scenario)`。

- [ ] **Step 4: 更新 `public/manifest.json`**
  将 `"actions/*"` 注册进 `web_accessible_resources`。

- [ ] **Step 5: 运行测试验证通过**
  `node test/actions-data.test.js` -> 预期全部 PASS。

---

### Task 2: 扩展配置与存储层 (`src/shared/constants.js` / `src/shared/storage.js`)

**Files:**
- Modify: `src/shared/constants.js:1-36`
- Modify: `src/shared/storage.js:1-106`
- Test: `test/storage-settings.test.js`

- [ ] **Step 1: 编写配置扩展与持久化测试**
  测试默认设置中包含 `scenario`、`actionId`，测试读取与保存合并逻辑。

- [ ] **Step 2: 运行测试验证**
  `node test/storage-settings.test.js`

- [ ] **Step 3: 修改 `src/shared/constants.js`**
  在 `DEFAULT_SETTINGS` 中加入 `scenario: 'office_seated'`、`actionId: 'auto'` 等新常量。

- [ ] **Step 4: 修改 `src/shared/storage.js`**
  增强设置读取与保存方法，增加获取当前推荐动作 `getCurrentWorkoutAction()` 的便捷接口。

- [ ] **Step 5: 运行测试验证通过**
  `node test/storage-settings.test.js` -> PASS。

---

### Task 3: 升级控制面板 Popup 支持三场景切换 (`src/popup/`)

**Files:**
- Modify: `src/popup/popup.html:20-60`
- Modify: `src/popup/popup.css:1-150`
- Modify: `src/popup/popup.js:1-133`

- [ ] **Step 1: 修改 `src/popup/popup.html`**
  在面板中加入场景选择选项卡/卡片（🏢 办公室·不可站起 / 🚶 办公室·可站起来 / 🏠 居家办公·大动作），并根据所选场景联动展示动作卡片与对应目标调节项（拉伸秒数 或 深蹲次数）。

- [ ] **Step 2: 增强 `src/popup/popup.css`**
  增加场景选择卡片样式、动作缩略卡片网格样式、标签徽章样式。

- [ ] **Step 3: 修改 `src/popup/popup.js`**
  实现场景切换事件响应、动态渲染动作列表、保存场景设置，在点击“立即打开健身房”时将选中的场景或动作带入参数。

---

### Task 4: 升级锁屏提示卡片 Content Script (`src/content/`)

**Files:**
- Modify: `src/content/index.js:40-80`
- Modify: `src/content/overlay.css:1-100`

- [ ] **Step 1: 修改 `src/content/index.js`**
  锁屏遮罩不再固定显示“标准深蹲 10次”，而是在锁屏时从 Storage / Background 异步获取当前选定动作的信息，动态展示动作名称、场景标签（如“🪑 办公室·坐姿”）、要求（如“35秒×2侧放松”或“10次深蹲”）。

- [ ] **Step 2: 优化 `src/content/overlay.css`**
  适配多样化动作展示排版，支持动作场景胶囊和更美观的图文呈现。

---

### Task 5: 重构动作与拉伸伴练页面 (`src/workout/`)

**Files:**
- Modify: `src/workout/workout.html:1-89`
- Modify: `src/workout/workout.css:1-200`
- Modify: `src/workout/workout.js:1-290`
- Create: `src/workout/stretch-runner.js` (工位拉伸倒计时/换侧/循环伴练状态机)
- Test: `test/stretch-runner.test.js`

- [ ] **Step 1: 编写拉伸伴练状态机单测**
  针对单次保持（30s）、双侧轮换（35s x 2侧，中间换侧提醒）、节奏循环（后伸 5s x 8 次）编写独立测试。

- [ ] **Step 2: 实现 `src/workout/stretch-runner.js`**
  精准时间轮询、状态回调（准备、进行中、换侧提醒、单次完成、全部达标）。

- [ ] **Step 3: 修改 `src/workout/workout.html`**
  设计支持双模式的工作台：
  - 顶部栏：当前动作卡片、场景标签、**「🔄 切换其他动作」** 下拉菜单。
  - 左侧：双模式舞台（深蹲模式为摄像头+骨骼画布；拉伸模式为原著高清示范图+倒计时环+可选自拍镜像）。
  - 右侧：动作教学与安全卡片（管什么、怎么做、做对了/疼就停安全禁忌）、计时与计数进度卡片。

- [ ] **Step 4: 增强 `src/workout/workout.css`**
  支持动作原图展示、倒计时环动效、换侧高亮提醒、双模式无缝切换样式。

- [ ] **Step 5: 修改 `src/workout/workout.js`**
  根据当前动作类型（`stretching` vs `squat`）自动分支启动对应流程：
  - 若为拉伸：启动 `StretchRunner`，播放阶段提示音，完成后触发解锁广播。
  - 若为深蹲：保持已有的 MoveNet AI 骨骼检测管线。
  - 提供无刷新在页面内随意切换任意动作的能力。

---

### Task 6: 完整构建与单元测试验证

**Files:**
- Verify: `npm test`
- Verify: `npm run build`
- Verify: `dist/` 产物结构

- [ ] **Step 1: 运行所有单元测试**
  确保深蹲状态机、拉伸计时状态机、动作数据层测试 100% 通过。

- [ ] **Step 2: 运行 Vite 编译打包**
  确保 `dist/` 成功构建，包括新的 html/css/js 以及 `public/actions/` 中的 10 张图片。

- [ ] **Step 3: 最终自检并形成使用报告**
