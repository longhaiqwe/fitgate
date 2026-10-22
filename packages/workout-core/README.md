# @fitgate/workout-core

FitGate 两端的内部共享包，不发布到 npm。无外部运行时依赖；由根目录 npm workspaces 链接。

| 模块 | 用途 |
| --- | --- |
| `audio.js` | Web Audio 提示音 |
| `duration-parser.js` | 时长、次数、组数解析与格式化 |
| `target-rules.js` | 网站预设、域名标准化与匹配 |
| `tokens.css` | 两端共用的基础设计令牌 |
| `keypoint-smoother.js` | 姿态关键点平滑与丢帧容错 |
| `pose-geometry.js` | 几何与关节角度计算 |
| `action-catalog.js` | 绑定各端动作库的场景筛选、ID 查找与随机选择 |
| `stretch-runner.js` | 拉伸状态机；允许配置挂起间隔策略 |
| `jumping-jack-counter.js` | 开合跳状态机；允许传入各端提示文案 |
| `pose-detector.js` | MoveNet 初始化与推理；由应用传入 TensorFlow、模型地址与文案 |

应用中的同名文件是入口适配层。Chrome 保留原有壁钟计时策略，macOS 继续忽略超过 1 秒的挂起间隔；各端原有提示文案不变。

动作数据和深蹲、动作到位判定已存在行为差异（包括 macOS 站立休息和正面深蹲支持），留在应用内维护，不通过简单合并覆盖任何一端的现有能力。

浏览器端通过 Vite 将公共模块打入产物。macOS 主进程直接导入此包，打包脚本将真实包文件复制到 `.app/Contents/Resources/app/node_modules/@fitgate/workout-core`；安装包不依赖开发仓库或符号链接。

在仓库根目录运行 `npm test` 验证公共模块和两端适配后的行为。
