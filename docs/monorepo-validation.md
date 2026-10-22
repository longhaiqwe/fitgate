# 平级工程迁移验证

验证日期：2026-10-22。Chrome 扩展版本保持 1.0.0，macOS 版本保持 1.1.7。本次产物为本地构建，未发布到 GitHub。

## 结构与行为

- Chrome 扩展移至 `apps/chrome-extension`，桌面版移至 `apps/macos`。
- `packages/workout-core` 提供 10 个共享模块；两端使用 npm workspaces，统一维护根锁文件。
- 保留迁移前所有未提交源码。按迁移前的文件快照核对，没有遗漏源码；未涉及公共模块适配的功能文件保持原样。
- 平台动作库、深蹲与动作到位识别规则、存储和界面交互各自保留。共用状态机通过适配层维持原有提示文案和挂起计时策略。
- macOS 安装包包含公共包的真实文件，打包校验检查每个导出文件均存在且不是符号链接。

## 本地验证结果

| 检查 | 结果 |
| --- | --- |
| 根目录 `npm ci` | 干净安装通过；锁文件包含完整版本与 integrity 信息 |
| 根目录 `npm test` | TAP 汇总 249 项，0 失败；原有额外断言脚本亦正常退出 |
| 根目录 `npm run build` | Chrome 与 macOS 构建通过，Swift arm64 监测器编译通过 |
| Chrome 完整冒烟 | Chromium 141，真实 MV3 后台、设置保存、网页锁定、计时伴练、暂停恢复、完成解锁与统计通过；离线 MoveNet 与合成摄像头通过 |
| macOS 开发环境完整冒烟 | 原生监测、面板、设置、全屏提醒、双组计时、暂停恢复、解锁、推迟与离线模型通过 |
| macOS 冷启动冒烟 | 首次状态延迟和首次状态请求失败两种情形均通过，首次点击、窗口恢复与错误恢复正常 |
| Apple Silicon 安装包 | 构建、14 个 Mach-O 文件的架构/最低系统版本/依赖检查与签名校验通过 |
| 安装包独立运行 | 从 `/tmp` 工作目录启动 arm64 `.app`，完整冒烟通过；`packaged=true`，`cameraModel=true`，错误列表为空 |
| Intel 安装包 | x64 交叉构建及 14 个 Mach-O 文件的兼容性、签名检查通过；未在 Intel 真机运行 |

摄像头测试使用合成视频输入，不访问真实摄像头。两端 GitHub Actions 配置已更新，本次结果来自本机执行，未宣称远端工作流已运行。

Intel 打包时直接连接 GitHub 曾超时，随后通过现有代理下载官方 Electron 44.7.0 x64 ZIP，核对官方 `SHASUMS256.txt` 后使用打包脚本已有的 `FITGATE_ELECTRON_ZIP_DIR` 完成构建。npm 镜像连接失败时使用命令级官方 registry 参数，不修改全局配置。

## 产物和证据

- Chrome 加载目录：`apps/chrome-extension/dist/`
- Chrome 报告与截图：`apps/chrome-extension/artifacts/`
- macOS 安装包：`apps/macos/release/FitGate-1.1.7-macOS-{arm64,x64}.zip`
- macOS 架构校验：`apps/macos/release/compatibility-{arm64,x64}.json`
- macOS 安装包运行报告与截图：`apps/macos/artifacts/packaged-monorepo/`

**Apple 公证未完成。** 当前脚本使用 ad-hoc 签名，没有 Developer ID 签名、提交公证或附加公证票据的步骤。本次迁移没有更改此状态。
