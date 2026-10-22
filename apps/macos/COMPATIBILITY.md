# FitGate for macOS 兼容性记录

当前 1.1.7 已完成双架构 Developer ID 签名、Apple 公证和最终 ZIP 验证，详见 [1.1.7 公证与交付验证](docs/notarization-1.1.7.md)。两种架构完整冒烟均通过；Intel 版本次在 Rosetta 下运行。

---

# FitGate for macOS 1.1.0 兼容性记录

日期：2026-10-15（Asia/Shanghai）。Intel 与 Apple Silicon 安装包分别提供，最低系统要求为 macOS 13 Ventura。

## 构建与静态检查

- 90 项单元测试通过。
- 两个安装包各包含 14 个 Mach-O 二进制文件，全部与目标架构一致；Intel 为 x86_64，Apple Silicon 为 arm64。
- Swift 监测器显式以 macOS 13 为部署目标；全部二进制文件的最低系统版本不高于 13。
- 原生动态库和运行时搜索路径未引用开发机的目录。
- 两个 ZIP 完整性检查通过；解压后的应用再次通过架构、最低系统版本及签名检查。
- 本地 ad-hoc 签名有效；未进行 Apple Developer ID 签名或公证。

## 运行验证

| 验证对象 | 环境 | 结果 |
| --- | --- | --- |
| 最终 Intel ZIP 解压后的应用 | Apple Silicon，macOS 26.5.2，通过 Rosetta 运行 x64 | 完整冒烟测试通过，含合成摄像头与离线 MoveNet；渲染错误 0 |
| 最终 Apple Silicon ZIP 解压后的应用 | Apple Silicon，macOS 26.5.2，原生 arm64 | 完整冒烟测试通过，含合成摄像头与离线 MoveNet；渲染错误 0 |
| 同源码在 Intel 上原生构建的应用 | GitHub `macos-15-intel`，macOS 15（Darwin 24.6.0） | 90 项测试、打包与核心桌面冒烟测试通过；x64、非 Rosetta；渲染错误 0 |
| 同源码在 Apple Silicon 上原生构建的应用 | GitHub `macos-15`，macOS 15（Darwin 24.6.0） | 90 项测试、打包与核心桌面冒烟测试通过；arm64、非 Rosetta；渲染错误 0 |

[GitHub 验证记录](https://github.com/longhaiqwe/fitgate/actions/runs/38677122100)。测试源码提交为 `34c5abb65159eb5179444f967d9ea3cd394ded87`；后续发布提交只整理报告与校验值。Release 的 `verification-results.json` 保存本地和 CI 的结构化结果。

CI 的 Intel 虚拟环境无法初始化 GPU，摄像头测试出现 EGL / SharedImage 初始化错误。因此 CI 明确使用核心桌面测试范围，结果包含 `scope: desktop-core`、`cameraModel: false`、`skipped: [cameraModel]`；摄像头和 AI 测试没有被记为云端通过。本地完整测试不跳过摄像头，结果为 `scope: full`、`cameraModel: true`。

验证过程中还修正了显示器模拟测试：系统显示器事件与直接调用使用同一份虚拟屏幕列表，并主动触发一次显示器变化事件作为回归检查，避免虚拟窗口被真实屏幕列表提前清除。应用正式运行的显示器逻辑未改变。

冒烟测试覆盖原生前台应用监测、设置、全屏提醒、预览关闭、显示器增减逻辑、两组计时伴练、暂停与恢复、完成解除遮挡、模拟锁屏恢复、推迟、离线 MoveNet 与合成摄像头初始化。

## 验证边界

- macOS 13 为编译与运行库声明的最低版本，不代表已在 macOS 13 的所有机型上逐一实测。
- 摄像头测试使用合成画面；未覆盖真实人体动作识别准确度、所有 Intel 集成显卡或真实摄像头的性能。
- 显示器增减、锁屏和唤醒使用事件模拟；未覆盖外接显示器热插拔、真实休眠、首次权限交互和登录自启动。
- 自动化运行使用隐藏窗口模式，未验证前台焦点恢复和人工拖拽操作。

## 安装包校验

在下载目录运行 `shasum -a 256 -c SHA256SUMS.txt`，可复核两个压缩包。

```text
c612ce2ebedd14d9819aec2916afd4eca4353a327b5544ef63055344b649102a  FitGate-1.1.0-macOS-x64.zip
567b0f29277ad8a540988469e64041d2b8af1e3b6f9a168f5e971529091fa011  FitGate-1.1.0-macOS-arm64.zip
```
