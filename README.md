# FitGate

一个仓库，两个独立应用：Chrome 扩展与 macOS 桌面版。两端分别构建、运行和发布，通过 npm workspaces 共享伴练基础模块。

## 目录

```text
apps/
  chrome-extension/   Chrome Manifest V3 扩展
  macos/              Electron + Swift 桌面应用
packages/
  workout-core/       共享逻辑与设计令牌
docs/                 产品资料、设计记录与图片
promo/                宣传文稿
```

- [Chrome 使用说明](apps/chrome-extension/README.md)
- [macOS 使用说明](apps/macos/README.md)
- [macOS 兼容性记录](apps/macos/COMPATIBILITY.md)
- [公共模块边界](packages/workout-core/README.md)
- [本次目录迁移验证记录](docs/monorepo-validation.md)
- [macOS 正式签名与公证流程](apps/macos/docs/releasing.md)
- [下载 macOS 1.1.7 正式版（已通过 Apple 公证）](https://github.com/longhaiqwe/fitgate/releases/tag/macos-v1.1.7)

## 安装与开发

使用 Node.js 22.12+，在仓库根目录统一安装依赖。仅维护根目录的 `package-lock.json`。

```sh
npm ci
npm run dev:chrome      # 扩展页面的开发预览
npm run dev:macos       # 构建并启动桌面版（需要 macOS 和 Xcode 命令行工具）
```

也可以在安装完成后进入对应的 `apps/` 子目录，使用该工程的 `npm run dev`（Chrome）或 `npm start`（macOS）。两端都依赖同仓库中的公共包，请克隆完整仓库。

## 构建与测试

```sh
npm test               # 两端与公共包的单元测试
npm run build:chrome   # apps/chrome-extension/dist
npm run build:macos    # apps/macos/dist + 原生监测器
npm run build          # 构建两端，需要 macOS
npm run smoke:chrome   # Chromium 扩展完整流程、合成摄像头与离线模型检查
npm run smoke:macos    # 桌面核心流程、合成摄像头与离线模型检查
npm run smoke:startup  # 冷启动与首次交互检查
npm run package:macos  # apps/macos/release 下的 .app 和 ZIP
```

Chrome 加载：打开 `chrome://extensions/`，启用开发者模式，选择“加载已解压的扩展程序”，指定 `apps/chrome-extension/dist`。Vite 开发预览不包含真实扩展后台，完整功能需加载构建产物。

首次运行 Chrome 冒烟测试前执行 `npx playwright install chromium`；Linux CI 使用 `npx playwright install --with-deps chromium`。测试使用独立临时浏览器配置，不改动日常 Chrome 数据，也不访问真实摄像头。报告和截图位于 `apps/chrome-extension/artifacts/`。

macOS 交叉打包：

```sh
npm run package:arm64 --workspace=fitgate-macos
npm run package:x64 --workspace=fitgate-macos
```

`npm run package:macos` 生成本地开发用的 ad-hoc 包。维护者使用 `npm run release:macos` 执行 Developer ID 正式签名、Apple 公证、附加票据与 Gatekeeper 校验；全部通过后，正式 ZIP 才会写入 `apps/macos/release/notarized/`。详细配置见[发布流程](apps/macos/docs/releasing.md)。从源码运行不需要 Apple 开发者证书或公证凭据。

## 维护约定

两端保留独立版本号和发布节奏。公共包变更需运行两端测试；发布标签建议使用 `chrome-v…` 与 `macos-v…` 区分。平台存储、窗口/权限、页面交互和已经分化的动作识别规则保留在各自应用里。

旧路径迁移：根目录 `src/`、`public/`、`test/`、`dev/`、`scripts/` 移至 `apps/chrome-extension/`；`fitgate-macos/` 移至 `apps/macos/`。历史设计记录中的旧路径仅表示当时的目录结构。
