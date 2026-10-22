# 更新记录

## 1.1.7 — 2026-10-22

- Apple Silicon 与 Intel 发行包均完成 Developer ID 签名、Apple 公证及票据附加；最终 ZIP 通过 Gatekeeper 验证。
- 新增可复用的正式发布命令、公证超时恢复与签名验证；正式流程失败时不生成发行 ZIP。
- Chrome 与 macOS 整理为同仓库平级工程，公共伴练逻辑提取到 workspace 包，支持从完整仓库构建。
- 两端及公共模块共 258 项单元测试通过；正式签名 macOS 应用通过双架构完整冒烟（x64 使用 Rosetta）。详细记录见 [交付验证](docs/notarization-1.1.7.md)。

## 1.1.0 — 2026-10-15

- 新增 Intel x64 安装包，与 Apple Silicon arm64 安装包分开提供。
- 增加指定目标架构的构建命令；Swift 监测器随目标架构重新编译，防止跨架构打包混用二进制文件。
- 统一最低系统要求为 macOS 13，与 Electron 44 的要求一致；修正原生监测器未明确设置最低系统版本的问题。
- 打包时验证全部 Mach-O 文件的架构、最低系统版本、动态库路径和本地代码签名。
- 增加 Intel 与 Apple Silicon 的 GitHub Actions 兼容性验证，保留实际运行架构与 Rosetta 状态。

浏览器扩展的版本号与功能保持独立，本次版本号用于 macOS 桌面应用。
