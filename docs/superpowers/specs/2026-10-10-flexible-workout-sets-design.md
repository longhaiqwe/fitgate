# 灵活动作组数与时长联动 (Flexible Workout Sets) 设计方案

## 1. 需求背景与目标
用户在不同办公节奏下对防沉迷与身体活动的诉求不同：
- 短周期模式（如番茄工作法）：每专注工作 25 分钟，执行 1 组动作放松；
- 长周期模式（如深度工作）：每专注工作 50 分钟，执行 3 组动作进行全身性舒展；
- 自由组合：允许用户自由调节「专注时长（分钟）」与「每次达标动作组数（1~5 组）」，并提供常见预设快捷档位。

在伴练页面（workout.html）中，当需要执行多组动作时，系统应串联这 $N$ 个动作，形成连续的训练流，全部完成后方可解除网页锁定。

---

## 2. 总体架构与数据流

```
+-------------------------------------------------------------------+
| 1. 控制台弹窗 (popup.html / popup.js)                              |
|    - 快捷预设按钮: [25m / 1组] [50m / 3组]                           |
|    - 独立参数调节: 使用时长 (分钟) + 每次动作组数 (1~5 组)           |
|    - 写入 chrome.storage.local (usageLimit, actionCountPerSession) |
+----------------------------------+--------------------------------+
                                   |
                                   v
+-------------------------------------------------------------------+
| 2. 存储与数据层 (constants.js / storage.js)                       |
|    - DEFAULT_SETTINGS.actionCountPerSession = 1                   |
|    - getCurrentWorkoutQueue(): 按场景与配置抽取 N 个动作队列      |
+----------------------------------+--------------------------------+
                                   |
        +--------------------------+--------------------------+
        |                                                     |
        v                                                     v
+-----------------------------+       +-----------------------------+
| 3. 锁屏遮罩 (content/index) |       | 4. 伴练工作台 (workout.js)   |
|    - 读取队列信息           |       |    - workoutQueue: [A1, A2] |
|    - 卡片提示:              |       |    - 顶部队列进度: 1 / N    |
|      "共 N 组动作"          |       |    - 动作达标 -> 过渡 -> 下一个|
|                             |       |    - 全部达标 -> WORKOUT_OK |
+-----------------------------+       +-----------------------------+
```

---

## 3. 详细设计规范

### 3.1 数据模型与配置扩展
1. **`src/shared/constants.js`**：
   - 在 `DEFAULT_SETTINGS` 扩展：
     ```javascript
     actionCountPerSession: 1 // 每次锁屏需要完成的动作组数，范围 1 ~ 5，默认 1
     ```
   - 导出快捷预设常量 `WORKOUT_PRESETS`：
     ```javascript
     export const WORKOUT_PRESETS = [
       { id: 'pomodoro', name: '番茄', usageLimit: 25, actionCount: 1, label: '25m / 1组' },
       { id: 'deep_work', name: '深度专注', usageLimit: 50, actionCount: 3, label: '50m / 3组' }
     ];
     ```

2. **`src/shared/duration-parser.js`**：
   - 增加 `parseActionCountInput(raw)`：解析输入字符串为 1~5 之间的整数，非法时返回 `null`。
   - 增加 `formatActionCount(val)`：格式化输出 `${val} 组`。

3. **`src/shared/storage.js`**：
   - 新增 `getCurrentWorkoutQueue()`：
     - 读取 `settings = await getSettings()`；
     - 目标数量 `count = Math.max(1, Math.min(5, settings.actionCountPerSession || 1))`；
     - 若 `settings.activeActionId && settings.activeActionId !== 'auto'`：
       - 固定动作模式：返回包含 `count` 个相同动作对象的数组（即同一动作做 $N$ 组）；
     - 若为智能轮换模式（`'auto'`）：
       - 获取当前场景的所有动作列表 `list = getActionsByScenario(settings.scenario)`；
       - 若 `list.length >= count`，无放回随机抽取 `count` 个不重复动作；
       - 若 `list.length < count`，洗牌后循环填充至 `count` 个动作；
     - 返回动作数组 `[action1, action2, ...]`。
   - 保持 `getCurrentWorkoutAction()` 兼容：内部调用 `getCurrentWorkoutQueue()` 并返回第一项。

### 3.2 界面交互 (Popup 与 Content Overlay)
1. **Popup 弹窗 ([popup.html](file:///Users/longhai/Projects/居家办公插件/src/popup/popup.html) / [popup.js](file:///Users/longhai/Projects/居家办公插件/src/popup/popup.js))**：
   - 设置视图提供「每次达标动作组数」调节项：
     - 滑块 `input#input-action-count` (min=1, max=5, step=1)；
     - 文本框 `input#input-action-count-text`；
     - 联动持久化至 `settings.actionCountPerSession`。
   - 在使用时长与动作组数设置旁，增加快捷预设按钮组：
     - 点击「25m / 1组」：同时将时长设为 25、组数设为 1；
     - 点击「50m / 3组」：同时将时长设为 50、组数设为 3；
     - 触发 toast 提示并保存设置。

2. **锁屏遮罩 ([content/index.js](file:///Users/longhai/Projects/居家办公插件/src/content/index.js))**：
   - 读取 `getCurrentWorkoutQueue()`，获取本轮队列长度；
   - 若队列长度为 1：显示具体动作名称及单动作规格（如「坐姿侧头舒展 · 30秒」）；
   - 若队列长度 > 1：规格显示为「共 N 组动作 · 首个：[动作名]」。

### 3.3 伴练工作台队列执行状态机 (workout.js)
1. **状态定义**：
   - `workoutQueue`: 动作对象队列；
   - `currentQueueIndex`: 当前进行中的队列索引（`0` ~ `workoutQueue.length - 1`）；
   - `isTransitioning`: 动作切换过渡态布尔值。

2. **UI 元素与进度展示**：
   - 顶部导航栏增加队列计数徽章（如 `动作 1 / 3`）及进度指示点；
   - 当只有一个动作时，进度徽章保持极简显示或隐藏总数。

3. **流转逻辑**：
   - 单动作完成（拉伸倒计时归零或深蹲/开合跳计数达标）：
     - 若 `currentQueueIndex < workoutQueue.length - 1`：
       - 进入过渡态 `isTransitioning = true`；
       - 停止当前检测器与计时器；
       - 播放单动作完成音效 `playCountSuccessSound()`；
       - 反馈气泡显示「当前动作完成！即将进入第 (X+1) 组动作...」；
       - 延迟 1.5 秒后，`currentQueueIndex++`，调用 `loadAction(workoutQueue[currentQueueIndex].id)` 切换至下一动作；
       - `isTransitioning = false`；
     - 若 `currentQueueIndex === workoutQueue.length - 1`：
       - 调用 `handleGoalAccomplished()`；
       - 播放通关音效 `playVictorySound()`；
       - 弹出最终胜利弹窗；
       - 广播 `WORKOUT_COMPLETED`，解锁网页并关闭页面。

---

## 4. 测试与验证策略
1. **单元测试**：
   - `test/duration-parser.test.js`: 测试 `parseActionCountInput` 与 `formatActionCount` 的解析与边界值；
   - `test/storage-settings.test.js`: 测试 `actionCountPerSession` 默认值与存储读写，测试 `getCurrentWorkoutQueue()` 在固定模式与智能轮换模式下的动作队列抽取逻辑（数量、不重复性、降级兜底）。
2. **构建与运行测试**：
   - `npm test`: 确保所有测试通过；
   - `npm run build`: 确保 Vite 打包无报错。
