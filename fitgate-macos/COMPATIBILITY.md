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

Apple Silicon 安装包已在 macOS 26.5.2 原生运行通过完整冒烟测试，渲染错误为 0。

Intel 安装包的 Rosetta 验证和 GitHub 原生 Intel 验证结果将在本次发布前补充。GitHub 工作流使用 macOS 15 的 `macos-15-intel` 与 `macos-15` 两种环境，验证实际运行架构并禁止将 Rosetta 运行误记为原生运行。

冒烟测试覆盖原生前台应用监测、设置、全屏提醒、预览关闭、显示器增减逻辑、两组计时伴练、暂停与恢复、完成解除遮挡、模拟锁屏恢复、推迟、离线 MoveNet 与合成摄像头初始化。

## 验证边界

- macOS 13 为编译与运行库声明的最低版本，不代表已在 macOS 13 的所有机型上逐一实测。
- 摄像头测试使用合成画面；未覆盖真实人体动作识别准确度、所有 Intel 集成显卡或真实摄像头的性能。
- 显示器增减、锁屏和唤醒使用事件模拟；未覆盖外接显示器热插拔、真实休眠、首次权限交互和登录自启动。
- 自动化运行使用隐藏窗口模式，未验证前台焦点恢复和人工拖拽操作。

## 安装包校验

在下载目录运行 `shasum -a 256 -c SHA256SUMS.txt`，可复核两个压缩包。

```text
70a57b6f77bd1949b6ceaa4b9e04bdf90726cc836963d9783cfc03a380d1bac6  FitGate-1.1.0-macOS-x64.zip
79236d89151fe3e488b3e29577270c6e2c7fe592f9fd09730e6c36f7db8409b7  FitGate-1.1.0-macOS-arm64.zip
```
