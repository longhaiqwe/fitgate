# FitGate macOS 1.1.7 公证与交付验证

日期：2026-10-22（Asia/Shanghai）。本次验证针对 1.1.7 正式发行包，对应 `macos-v1.1.7` 标签。[正式 Release](https://github.com/longhaiqwe/fitgate/releases/tag/macos-v1.1.7) 提供两种架构 ZIP 和校验文件。旧的 1.1.0 Release 不包含本次公证结果。

## Apple 签名与公证

两种架构均使用 `Developer ID Application: hai long (5RFJK73RSL)` 签名，启用 Hardened Runtime 和安全时间戳。Apple 返回 `Accepted` 后，公证票据已附加到应用中，再生成最终 ZIP。

| 架构 | Apple 提交 ID | 状态 |
| --- | --- | --- |
| arm64 | `748bd813-8653-4d6e-921c-607ffd511518` | Accepted；票据验证通过 |
| x64 | `54e972da-53ff-4876-80bc-dcd603e12bfe` | Accepted；票据验证通过 |

## 验证结果

- 仓库全部 258 项单元测试通过，包含正式签名筛选、公证拒绝/超时恢复、Gatekeeper 失败阻止打包等检查。
- 两份最终 ZIP 均在独立临时目录重新解压；SHA-256 与公证记录、独立校验文件一致。
- 解压后的应用均通过 `codesign --verify --deep --strict`、`stapler validate` 和 `spctl --assess`，Gatekeeper 返回 `Notarized Developer ID`。
- 每个应用的 14 个 Mach-O 文件均通过目标架构、最低系统版本、动态库路径、Developer ID、Team ID、Hardened Runtime 与时间戳检查；共享模块为随包分发的真实文件。
- 正式签名应用均通过完整冒烟测试：原生监测、设置、提醒、显示器事件、计时与暂停恢复、完成解除遮挡、锁屏恢复、推迟、合成摄像头和离线 MoveNet。渲染错误为 0。

| 运行包 | 验证环境 | 结果 |
| --- | --- | --- |
| arm64 | Apple Silicon / macOS 26.5.2，原生运行 | 完整冒烟通过 |
| x64 | Apple Silicon / macOS 26.5.2，Rosetta 运行 | 完整冒烟通过 |

运行测试针对正式签名的打包应用；最终 ZIP 另行解压并验证签名及票据。结构化证据和 Apple 原始日志位于本地 `apps/macos/release/notarized/`，其中 `verification-results.json` 保留运行结果与最终包检查结果。

## 验证边界

macOS 13 是二进制声明的最低系统版本，本次没有在 macOS 13 或 Intel 真机上测试。摄像头采用合成画面；多显示器、锁屏与唤醒采用事件模拟。隐藏窗口冒烟未覆盖真实摄像头动作准确度、真实休眠/热插拔、首次权限弹窗、登录自启动或人工交互。历史版本的 Intel CI 结果不代表本次版本已通过 Intel CI。

## 最终 ZIP 校验

```text
7f175ddbde75226841fa01c471645cb42329cce6a3bb130e2705fac9b337a7c2  FitGate-1.1.7-macOS-arm64.zip
b13eb2012ccfe6ba8cbd9a6615a44f535cfe20eaf2bc0ef6a9b6eb9f7f3323f6  FitGate-1.1.7-macOS-x64.zip
```

在 ZIP 与 `SHA256SUMS.txt` 所在目录运行 `shasum -a 256 -c SHA256SUMS.txt`。

维护者发布步骤见 [正式签名与公证流程](releasing.md)。`macos-v1.1.7` 标签对应发行源码；Release 的 `verification-results.json` 记录源码提交、运行验证与最终 ZIP 校验结果。
