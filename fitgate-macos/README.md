# FitGate for macOS

独立于浏览器运行的本地桌面应用。从现有 FitGate 插件复用动作库、动作示范图、MoveNet 模型、姿态判定、深蹲和开合跳计数、拉伸计时和音效。桌面提醒使用全屏遮挡与居中活动卡片，显示休息倒计时、动作、组数和操作按钮。原插件代码未改动；本目录可独立开发与构建。

## 打开应用

从 [GitHub Releases](https://github.com/longhaiqwe/fitgate/releases) 下载对应芯片的压缩包，解压后把 `FitGate.app` 拖到“应用程序”文件夹。在苹果菜单 → 关于本机中查看芯片类型。

| Mac 芯片 | 安装包 |
| --- | --- |
| Intel | `FitGate-1.1.0-macOS-x64.zip` |
| Apple Silicon（M 系列） | `FitGate-1.1.0-macOS-arm64.zip` |

两个版本均要求 **macOS 13 Ventura 或以上**。Electron 44 已不支持 macOS 12；之前文档中的 macOS 12 要求有误。Intel 包在 Intel Mac 上无需 Rosetta。每次发布的实测环境与边界见 [兼容性报告](COMPATIBILITY.md)。

应用使用 ad-hoc 签名，未使用 Apple Developer ID 签名或做 Apple 公证。如果从 GitHub 下载后被 macOS 阻止，先尝试打开应用，再进入“系统设置 → 隐私与安全性”选择“仍要打开”；不要关闭系统的整体安全保护。

关闭主窗口后，菜单栏仍会继续监控。点击菜单栏图标可开始伴练、暂停、继续或退出。使用 ⌘Q 可完全退出。

## 功能

- **电脑活跃使用计时**：默认统计所有前台应用；打开 FitGate 自身和进入伴练不累计。无需辅助功能或屏幕录制权限。
- **三种监控范围**：整台电脑、指定应用、指定网站。指定应用列表包含正在运行的应用与已选择的应用。
- **网站模式**：复用原插件平台开关、自定义域名、YouTube / Shorts 独立规则。支持 Safari、Chrome、Edge、Brave、Arc；通过系统 Apple Events 查询当前标签页，每两秒一次，不存储完整 URL。第一次使用需允许“自动化”权限。Firefox 和其他浏览器可使用整台电脑或指定应用模式。
- **空闲与休眠处理**：默认没有键鼠活动 1 分钟后暂停，可选 30 秒至 15 分钟。锁屏和系统休眠立即暂停；超过 15 分钟自然休息后重置当前周期。看视频等长时间无输入的场景可适当调高空闲阈值。
- **休息提醒**：默认 25 分钟 / 1 组。累计达到上限后覆盖所有显示器，包括菜单栏和 Dock 所在区域。窗口不可拖动、缩放或最小化，点击卡片外不会关闭；切换普通应用后恢复提醒焦点。支持跨 Space 和全屏应用显示，显示器变化时保持覆盖。活动卡片居中显示 5 分钟倒计时；到期伴练继续覆盖当前屏幕，其他屏幕保留提醒，未完成时可返回休息提醒。休息结束或完成伴练后解除遮挡并重置周期。可推迟 5 分钟，Escape 或关闭真实提醒窗口也可推迟。预览中的关闭操作会解除全部预览遮挡，不更改使用周期。
- **完整伴练**：坐姿 5 个动作、站立 10 个动作、居家 12 个动作；随机动作或指定动作；1–5 组串联；本地摄像头姿态识别或无摄像头纯计时；深蹲深度设置、暂停、重新开始及节奏音效。
- **本地统计**：今日受控范围活跃时长、按应用分布、最近 7 天趋势、完成活动次数及组数。保留最近 90 天，支持 JSON 导出。
- **桌面集成**：菜单栏剩余时间、单实例运行、窗口关闭后继续工作、登录时启动（在打包应用中启用）。

提醒提供应用层面的全屏遮挡，不是 macOS 系统账户锁；保留推迟、退出应用和系统强制退出。摄像头系统授权期间允许操作授权对话框。动作图和提示沿用插件；姿态识别只是运动辅助，不是医疗评估。

## 数据与权限

所有动作图和 AI 模型随应用打包，不依赖外部 CDN。摄像头画面在本机内存中处理，不保存视频。基础计时只读取系统空闲状态和前台应用标识，不监听或存储输入内容。指定网站模式需要浏览器自动化权限，但不保存浏览历史。

设置、当前周期和按日记录写入 `~/Library/Application Support/FitGate/fitgate.json`，每 5 秒以及关键操作时保存。采用临时文件加原子替换；损坏的数据会保留备份。统计日期跟随 Mac 的本地时区。

首次使用摄像头伴练时出现系统授权请求；拒绝后可用“无摄像头纯计时”继续。也可从规则设置直接打开摄像头隐私设置。

## 开发与构建

需要 Node.js 22.12+、npm、Xcode Command Line Tools（用于编译 Swift 原生活动监测器）。

```sh
npm ci
npm start
npm test
npm run smoke
npm run package
# 可在同一台 Mac 上交叉构建两种架构
npm run package:x64
npm run package:arm64
```

- `npm start`：构建界面和原生监测器，然后运行。
- `npm test`：原插件动作测试 + 桌面计时、休眠、暂停、跨天、推迟、记录与数据持久化测试。
- `npm run smoke`：以独立临时数据目录运行 Electron，验证主界面、原生监测、设置、提醒、真实双组倒计时、暂停恢复、自动完成与离线 AI 模型加载。使用合成摄像头，不访问真实摄像头。截图与结果在 `artifacts/`。
- `npm run package`：默认构建当前机器架构，可用 `FITGATE_ARCH=x64` 或 `arm64` 指定。分别编译对应架构、以 macOS 13 为最低版本的 Swift 监测器，构建 `.app` 和 ZIP，检查所有 Mach-O 文件的架构、最低系统版本、动态库路径与签名。结果在 `release/`，校验记录为 `compatibility-<arch>.json`。
- `node scripts/verify-package.mjs release/FitGate-darwin-x64/FitGate.app x64`：独立复核安装包。将两处架构改为 `arm64` 可复核 M 系列版本。
- GitHub Actions 在 macOS 15 的 Intel 和 Apple Silicon 环境分别运行单元测试、原生构建与打包应用冒烟测试。测试使用临时设置目录及合成摄像头；结果以工作流附件保存。

桌面端采用 Electron + Swift NSWorkspace。渲染进程启用 sandbox、context isolation，禁用 Node integration；预加载桥接只暴露有限 IPC；资源来自受约束的本地 `fitgate://app/` 协议。

主要目录：

| 目录 | 内容 |
| --- | --- |
| `electron/` | 原生窗口、菜单栏、电源事件、权限、持久化、计时引擎 |
| `native/` | Swift 前台应用采样器 |
| `src/desktop.*` | 桌面主面板与设置 |
| `src/reminder.*` | 全屏遮挡与居中休息提醒卡片 |
| `src/workout/` | 从插件复用的本地 AI 与计时伴练 |
| `src/shared/` | 动作定义、规则、音效、设计令牌及兼容桥接 |
| `scripts/` | macOS 打包与端到端冒烟验证 |

实现所用接口参考：[Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)、[本地协议](https://www.electronjs.org/docs/latest/api/protocol)、[摄像头授权](https://www.electronjs.org/docs/latest/api/system-preferences)。

## 全屏提醒

提醒复用原插件的卡片、动作信息和双按钮结构，配色、字体、圆角及按钮与桌面主面板统一：浅灰底、白色卡片、灰绿色信息区与深绿色主按钮。界面采用事实与操作文案。没有视频、熊猫图片或呼吸画布；旧动画素材不参与构建。设置中的“预览提醒”可查看弹窗，预览不会开启真实休息周期。

打包可通过 `FITGATE_ELECTRON_ZIP_DIR` 指定已有 Electron ZIP 所在目录，避免重复下载；文件名需与项目 Electron 版本及架构一致。
