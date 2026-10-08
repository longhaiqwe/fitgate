# 居家办公防沉迷深蹲健身插件 (FitGate) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一款 Chrome MV3 浏览器防沉迷插件，在 X (x.com/twitter.com) 等网站使用超时后触发全屏 Shadow DOM 锁屏遮罩，要求用户打开独立扩展全屏健身房，通过本地 AI 视觉姿态识别完成指定数量的标准深蹲后，方可解锁继续浏览。

**Architecture:** 采用 Chrome Extension Manifest V3 架构。由 Background Service Worker 集中统计当前活动标签页的使用时间；超时后向 Content Script 下发锁屏指令注入防穿透 Shadow DOM；用户点击进入独立扩展页面 `workout.html`，通过本地 MoveNet 骨骼姿态模型和三点夹角状态机检测深蹲；完成目标后广播解锁信号、重置计时并无缝切回原网页。

**Tech Stack:** JavaScript (ESNext), Vite 5, Chrome Extension Manifest V3, `@tensorflow/tfjs-core`, `@tensorflow/tfjs-backend-webgl`, `@tensorflow-models/pose-detection` (MoveNet SinglePose Lightning), Web Audio API, Canvas 2D API.

## Global Constraints

- 严禁使用任何云端 API 传输视频流或图像数据，所有视觉推断必须 100% 在本地完成。
- 必须严格遵循 Chrome Extension Manifest V3 规范，代码产物需静态打包入 `dist/`，不依赖外部动态执行代码。
- 必须遵循中文交流规则：代码注释和所有界面文案均使用清晰中文。
- 锁屏遮罩必须使用 Closed Shadow DOM 彻底隔离，防止宿主网站样式污染。

---

### Task 1: 项目工程构建与 Manifest V3 配置

**Files:**
- Create: `vite.config.js`
- Create: `public/manifest.json`
- Modify: `package.json`

**Interfaces:**
- Produces: 能够一键运行 `npm run build`，产出符合 Chrome MV3 要求的 `dist/` 目录结构（包含 `manifest.json`, `background.js`, `content.js`, `workout.html`, `popup.html`）。

- [ ] **Step 1: 编写 Vite 配置文件 `vite.config.js`**
配置多入口构建（background, content, workout, popup）及静态资源拷贝。

```javascript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        workout: resolve(__dirname, 'src/workout/workout.html'),
        popup: resolve(__dirname, 'src/popup/popup.html'),
        background: resolve(__dirname, 'src/background/index.js'),
        content: resolve(__dirname, 'src/content/index.js')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});
```

- [ ] **Step 2: 编写 `public/manifest.json` 清单文件**
定义 MV3 权限、Content Scripts 注入规则、Web Accessible Resources 及独立扩展页。

- [ ] **Step 3: 创建各入口的基础骨架文件**
创建 `src/background/index.js`、`src/content/index.js`、`src/workout/workout.html`、`src/popup/popup.html`，使 Vite 打包流程通顺。

- [ ] **Step 4: 运行 `npm run build` 验证打包**
确保生成 `dist/` 且产物目录完整无报错。

- [ ] **Step 5: 提交代码**
```bash
git add vite.config.js public/manifest.json src/
git commit -m "chore: setup vite multi-input build and mv3 manifest"
```

---

### Task 2: 共享配置、存储与音频合成层 (Shared Module)

**Files:**
- Create: `src/shared/constants.js`
- Create: `src/shared/storage.js`
- Create: `src/shared/audio.js`

**Interfaces:**
- Produces:
  - `DEFAULT_SETTINGS`: `{ usageLimit: 20, squatTarget: 10, targetDomains: ['x.com', 'twitter.com'] }`
  - `storage`: `getSettings()`, `setSettings()`, `getUsageState()`, `setUsageState()`, `resetSessionUsage()`
  - `soundEffects`: `playSquatBeep()`, `playCountSuccess()`, `playVictoryFanfare()`

- [ ] **Step 1: 编写 `src/shared/constants.js`**
定义默认配置、消息通道名称枚举（`LOCK_PAGE`, `UNLOCK_PAGE`, `HEARTBEAT`, `OPEN_WORKOUT`, `WORKOUT_COMPLETED`）。

- [ ] **Step 2: 编写 `src/shared/storage.js`**
封装基于 `chrome.storage.local` 的异步配置读取、保存与默认值回退逻辑。

- [ ] **Step 3: 编写 `src/shared/audio.js`**
使用浏览器原生 Web Audio API，合成三种无版权依赖的提示音：
1. 触底提示音（高频轻快 sine 波）
2. 计数成功音（双音递增和弦）
3. 胜利通关音（三和弦琶音）

- [ ] **Step 4: 提交代码**
```bash
git add src/shared/
git commit -m "feat: add shared constants, storage wrapper, and web audio synthesizer"
```

---

### Task 3: Background Service Worker 集中式计时调度与跨标签中继

**Files:**
- Create: `src/background/index.js`

**Interfaces:**
- Consumes: `src/shared/constants.js`, `src/shared/storage.js`
- Produces:
  - 监听 `chrome.runtime.onMessage` 处理心跳（`HEARTBEAT`）、开健身房（`OPEN_WORKOUT`）、运动完成（`WORKOUT_COMPLETED`）。
  - 自动向目标标签页广播 `LOCK_PAGE` 和 `UNLOCK_PAGE`。

- [ ] **Step 1: 实现标签页活跃检测与心跳计时器**
在 `src/background/index.js` 中监听活跃标签页，结合 Content Script 发送的可见性心跳，递增对应域名的使用秒数。

- [ ] **Step 2: 实现超时锁定广播与状态维护**
当已用秒数达标时，向所有匹配标签页下发 `LOCK_PAGE`，并将域名的 `isLocked` 置为 `true`。

- [ ] **Step 3: 实现打开健身房与通关解锁逻辑**
接收 `OPEN_WORKOUT` 开启全屏 `workout.html` 标签页；接收 `WORKOUT_COMPLETED` 后将 `isLocked` 置为 `false`，重置会话计时器，并向所有受控标签页广播 `UNLOCK_PAGE`。

- [ ] **Step 4: 构建并验证 Background 代码**
运行 `npm run build` 确保无语法与模块解析错误。

- [ ] **Step 5: 提交代码**
```bash
git add src/background/index.js
git commit -m "feat: implement background tracker and message relay"
```

---

### Task 4: Content Script 与 Shadow DOM 锁屏遮罩层

**Files:**
- Create: `src/content/index.js`
- Create: `src/content/overlay.css`

**Interfaces:**
- Consumes: `src/shared/constants.js`
- Produces:
  - 在网页中注入独立的 Closed Shadow DOM。
  - 阻断用户浏览交互与滚动。
  - 响应后台的 `LOCK_PAGE` 与 `UNLOCK_PAGE`。

- [ ] **Step 1: 编写 `src/content/overlay.css`**
设计现代深色高质感锁屏遮罩：毛玻璃背景、醒目图标、大标题、提示文案、动感炫彩“🔥 立即深蹲解锁”按钮。

- [ ] **Step 2: 编写 `src/content/index.js` 注入与拦截逻辑**
创建 `div#fitgate-host` 并使用 `attachShadow({ mode: 'closed' })` 注入遮罩。拦截 wheel/keydown/touchmove 事件。

- [ ] **Step 3: 实现防脱壳 MutationObserver**
当检测到宿主节点被用户手动从 DOM 删除时，自动立即重建挂载，防止作弊。

- [ ] **Step 4: 实现心跳上报与锁屏/解锁响应机制**
页面可见且活跃时，每 1 秒向后台发送 `HEARTBEAT`；后台广播 `LOCK_PAGE` 时显示遮罩，广播 `UNLOCK_PAGE` 时淡出移除。

- [ ] **Step 5: 提交代码**
```bash
git add src/content/
git commit -m "feat: implement shadow dom overlay and anti-bypass protection"
```

---

### Task 5: 姿态估计算法与深蹲动作状态机

**Files:**
- Create: `src/workout/detector.js`
- Create: `src/workout/squat-counter.js`
- Create: `test/squat-counter.test.js`

**Interfaces:**
- Produces:
  - `PoseDetector`: `init()`, `detect(videoElement) -> poses`
  - `SquatCounter`: `update(keypoints) -> { state, count, currentAngle, isBottom, isCounted, feedback }`

- [ ] **Step 1: 编写深蹲几何与状态机 `src/workout/squat-counter.js`**
实现三点夹角公式 $\theta = \arccos\left(\frac{\vec{u}\cdot\vec{v}}{|\vec{u}||\vec{v}|}\right) \times \frac{180}{\pi}$，实现 `WAITING -> STANDING -> SQUATTING -> BOTTOM -> RISING -> COUNT` 的严格状态机，并加入时间阈值（防高频抖动）。

- [ ] **Step 2: 编写单元测试 `test/squat-counter.test.js`**
模拟一组人体下肢骨骼坐标轨迹（从站立 170° 到下蹲 90° 再到站直 170°），断言状态流转正确且完成计数。

- [ ] **Step 3: 运行测试验证算法正确性**
运行测试脚本确保 100% 通过。

- [ ] **Step 4: 编写 `src/workout/detector.js`**
集成 `@tensorflow-models/pose-detection`，初始化 MoveNet SinglePose Lightning，支持视频帧推理与关键点提取。

- [ ] **Step 5: 提交代码**
```bash
git add src/workout/detector.js src/workout/squat-counter.js test/
git commit -m "feat: implement movenet detector wrapper and squat state machine"
```

---

### Task 6: 独立全屏健身房 UI 与视频流渲染

**Files:**
- Create: `src/workout/workout.html`
- Create: `src/workout/workout.css`
- Create: `src/workout/workout.js`

**Interfaces:**
- Consumes: `src/workout/detector.js`, `src/workout/squat-counter.js`, `src/shared/audio.js`
- Produces: 完整的全屏健身交互界面，完成设定深蹲次数后发送 `WORKOUT_COMPLETED` 并自动关闭。

- [ ] **Step 1: 编写 `src/workout/workout.html` 与 `src/workout/workout.css`**
设计专业级暗色健身房 UI：顶部进度状态条、大号视频/Canvas 视窗、右侧动作仪表盘与实时角度刻度线、底部激励反馈气泡、撒花特效容器。

- [ ] **Step 2: 编写 `src/workout/workout.js` 摄像头生命周期**
使用 `navigator.mediaDevices.getUserMedia` 获取 720p 视频流，挂载到 `<video>`，支持摄像头切换与失败容错提示。

- [ ] **Step 3: 实现 Canvas 实时骨骼绘制与角度指示**
在 `<canvas>` 上绘制肢体连线（躯干、四肢），并在膝关节处动态渲染扇形角度圆弧和数值，当下蹲达标时动态变绿。

- [ ] **Step 4: 整合音效、计数更新与通关流程**
每次达标调用 `soundEffects.playSquatBeep()`，计数成功调用 `playCountSuccess()`。当累计次数达到目标（如 10 次）时，触发 `playVictoryFanfare()`，渲染撒花动画，向 Background 发送 `WORKOUT_COMPLETED`，并在 1.8 秒后调用 `window.close()` 自动关闭标签页。

- [ ] **Step 5: 提交代码**
```bash
git add src/workout/
git commit -m "feat: complete workout room ui, skeleton rendering and auto-unlock flow"
```

---

### Task 7: 插件配置弹窗 (Popup UI & Settings)

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`

**Interfaces:**
- Consumes: `src/shared/storage.js`
- Produces: 允许用户随时查看使用统计，修改浏览时长限制、深蹲目标次数，管理受控网址列表。

- [ ] **Step 1: 编写 `src/popup/popup.html` 与 `popup.css`**
设计精美现代的卡片式弹窗：今日深蹲累计统计、当前使用时长进度条、参数滑块（时长 5~60 分钟，深蹲 3~30 次）、受控域名标签管理列表。

- [ ] **Step 2: 编写 `src/popup/popup.js` 逻辑**
与 `chrome.storage.local` 双向绑定，支持修改即时生效；提供“立即前往健身房测试”快捷按钮。

- [ ] **Step 3: 提交代码**
```bash
git add src/popup/
git commit -m "feat: implement popup settings dashboard"
```

---

### Task 8: 全链路构建、打包与真机加载验证

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: 完整可安装的 `dist/` 目录，无报错无警告。

- [ ] **Step 1: 执行完整打包构建**
运行 `npm run build`，检查 `dist/` 目录下所有文件。

- [ ] **Step 2: 检查 Chrome 扩展加载兼容性**
检查 `dist/manifest.json` 与各静态引用的路径有效性，确保符合 Chrome MV3 要求。

- [ ] **Step 3: 编写用户使用说明文档 `README.md`**
说明如何在 Chrome 中以“开发者模式 - 加载已解压的扩展程序”安装，以及如何测试防沉迷和深蹲解锁。

- [ ] **Step 4: 最终提交代码**
```bash
git add .
git commit -m "feat: complete fitgate chrome extension build and documentation"
```
