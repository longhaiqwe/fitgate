# macOS 正式签名与 Apple 公证

源码构建与官方发行使用不同命令。普通使用者从源码运行不需要 Apple 开发者账号，也不需要维护者的证书或公证凭据。

## 从源码运行

从仓库根目录开始，使用 Node.js 22.12+ 与 Xcode Command Line Tools：

```sh
npm ci
npm run dev:macos
```

`npm run package:macos` 生成仅供本地开发的 ad-hoc 签名包，位置为 `apps/macos/release/`。此命令不上传 Apple，也不代表已公证。

## 维护者准备发行包

需要钥匙串内有效的 **Developer ID Application** 证书（含私钥）与可用的 `notarytool` profile。Apple Development 证书不能用于此流程。证书私钥和 App 专用密码不进入源码或发布附件。

```sh
security find-identity -v -p codesigning

# 仅在新维护机器首次配置，密码在安全提示中输入。
xcrun notarytool store-credentials <profile-name> \
  --apple-id '<Apple ID 邮箱>' --team-id '<Team ID>'

export FITGATE_NOTARY_PROFILE='<已有 profile 名称>'
# 有多个有效 Developer ID 证书时，显式选择证书名称或 SHA-1 指纹。
export FITGATE_SIGN_IDENTITY='Developer ID Application: <名称> (<Team ID>)'

npm test
npm run package:release:arm64 --workspace=fitgate-macos
npm run package:release:x64 --workspace=fitgate-macos
```

本机维护者已验证可复用灵感晾台所用的 `shiyinfm-notary` profile，签名身份为 `Developer ID Application: hai long (5RFJK73RSL)`。profile 名称只是本机钥匙串中凭据的引用，不是密码，也不会随应用分发。

流程依次执行：构建前验证身份和公证凭据、构建原生监测器、由 Electron 官方签名工具从内到外签名、校验所有 Mach-O 文件的架构/最低系统版本/Developer ID/Team ID/Hardened Runtime/安全时间戳、提交 Apple、等待 `Accepted`、附加并验证票据、执行 Gatekeeper 校验，最后才压缩正式 ZIP 并生成 SHA-256。

主应用声明摄像头和 Apple Events 权限；原生活动监测器不使用 JIT 权限。Electron 内部辅助进程沿用官方签名工具的各自权限。应用签名后不能再编辑 bundle 内容。

正式产物在 `apps/macos/release/notarized/`：

- `FitGate-<版本>-macOS-arm64.zip` / `FitGate-<版本>-macOS-x64.zip`
- 每个 ZIP 对应的 `.sha256`
- `compatibility-<架构>.json`：签名和兼容性证据
- `notarization-<架构>.json`：Apple 提交 ID、状态、票据与最终校验和
- `notarization-<架构>-log.json`：Apple 返回的公证日志

流程拒绝覆盖已有正式产物或已签名候选包。下一版先递增版本，并将上一版的 `release/notarized/` 目录归档，再重新构建。

## 超时后继续，不重复上传

Apple 审核耗时不固定。若等待超时，提交 ID 已记录；不要重新构建或重新签名，使用原 app 和原输出目录继续：

```sh
cd apps/macos
node scripts/notarize.mjs \
  --app release/notarized/FitGate-darwin-arm64/FitGate.app \
  --arch arm64 --output release/notarized \
  --profile "$FITGATE_NOTARY_PROFILE"
```

Intel 使用 `x64`。脚本确认签名哈希与原提交一致，再继续等待、附加票据和打包。被 Apple 拒绝或 Gatekeeper 校验失败时不会生成正式 ZIP。

## 发布前验收

解压最终 ZIP，对解压后的副本执行：

```sh
codesign --verify --deep --strict '/解压目录/FitGate.app'
xcrun stapler validate '/解压目录/FitGate.app'
spctl --assess --type execute --verbose=2 '/解压目录/FitGate.app'
```

还需在独立数据目录运行应用冒烟检查，确认摄像头、离线模型、提醒、解锁和原生监测在正式签名后正常。未在 Intel 真机运行的结果应明确标注，Rosetta 运行不能替代 Intel 真机验证。

公开 Release 应指向生成该产物的源码提交与 `macos-v<版本>` 标签，附件包含两种架构 ZIP、校验和及必要的验证记录。源码目录重组也必须随该提交发布。旧的未公证附件不应被描述为已公证；上传后重新下载并核对最终 ZIP 的校验和。

常规 GitHub 兼容性 CI 仍使用 ad-hoc 签名，不具备维护者本机的钥匙串凭据。正式发行命令不会回退到该模式。本脚本只准备发行产物，不自动创建 Git 标签或公开 GitHub Release。

参考：[Electron 代码签名](https://www.electronjs.org/docs/latest/tutorial/code-signing)、[Apple 自定义公证流程](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)。
