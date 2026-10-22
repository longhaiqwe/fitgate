> 历史记录：2026-10-13 已按用户要求停用熊猫动画。当前应用使用普通提醒弹窗；原动画素材保留在 `artifacts/retired-panda/public-assets/`，不再随应用打包。以下为原制作记录。

# 熊猫走入与坐下动画

2026-10-13 更新。使用 [LTX-2.3 首尾帧 Space](https://huggingface.co/spaces/linoyts/LTX-2-3-First-Last-Frame) 的免费 ZeroGPU 生成，未购买额度。不是实拍视频，也不是本机运行生成模型。应用运行时仅播放随包的文件，无生成服务依赖。

首帧为空画面，末帧使用用户提供的透明熊猫图。镜头固定：熊猫从左边界外走入，停步、屈腿、降低身体、伸出后腿，连续坐到参考姿势。请求参数为 6 秒、1024×576、24 fps、seed 42，关闭提示词增强。原始 145 帧与请求记录位于 `artifacts/panda-exact-pose/`，提示词为 `prompt.txt`。原参考图完整保存在 `reference.png`。

在本机使用 Vision 逐帧去背景。Vision 漏识别的入场鼻部通过固定灰背景与屏幕边缘连通区域修正，避免第 9、10 帧消失。保持全部运动帧的顺序、位置与播放速度。运动结束后，以 12 帧将已对齐末帧的纹理还原到原参考图；不是把其他坐姿切换成参考图。总长 157 帧 / 24 fps，约 6.54 秒。视频静音，VP9 alpha 编码。播放器结束后在同位置、同尺寸的原图上开始呼吸，直到休息提醒关闭。

```sh
ffmpeg -i artifacts/panda-exact-pose/free-space-candidate.mp4 artifacts/panda-exact-pose/frames/%04d.png
swiftc -O scripts/animation/matte-video.swift -o build/matte-video
build/matte-video artifacts/panda-exact-pose/frames artifacts/panda-exact-pose/alpha
python3 scripts/animation/finish-reference-video.py
ffmpeg -framerate 24 -i artifacts/panda-exact-pose/finished/%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 20 -deadline good -cpu-used 4 -row-mt 1 -an public/assets/panda-reference.webm
python3 scripts/animation/review-sequence.py public/assets/panda-reference.webm public/assets/panda-poster.png artifacts/panda-exact-pose/review
```

画布始终左对齐屏幕，适配 4:3、16:10、16:9 和超宽屏，确保第一次出现的位置就是屏幕左边界。加载阶段不提前显示最终姿势；系统开启“减少动态效果”或视频解码失败时显示参考图。

逐帧检查覆盖交替落脚、身体重心变化、连续屈腿和伸腿，以及末帧姿势。像素检查覆盖空首帧、左边界入场、末帧与参考图误差。生成视频与自动抠像仍可能有细小毛发变化；视频分辨率为 1024×576，不是 4K。源码、参考图和生成视频保存在本机；旧 Pexels 视频移出发行包。

## 坐下后的呼吸

`src/content/panda-breathing.js` 使用原参考 PNG 的单张纹理，通过连续位移场让胸腹轻微起伏，头部随动。运动场在脚掌落地区域衰减为 0，不平移或缩放整张图片，不添加新姿势。周期 4.8 秒，最多 30 fps；周期起点和终点位移、速度均为 0。首帧与原图像素一致，运动自然承接入场视频末帧。

窗口不可见、提醒停止或系统开启减少动态效果时暂停绘制；销毁时释放 WebGL 资源。WebGL 不可用或上下文丢失时回退到原图。全部计算在本机执行，无外部服务、视频生成或额度消耗。

`review-breathing.mjs` 检查起止帧一致、脚掌落地区域像素不变、胸腹像素变化，导出一轮实际渲染帧。`verify.mjs` 验证入场衔接、呼吸播放、暂停恢复、减少动态效果和 GPU 丢失后的原图回退。预览为 `artifacts/breathing-review/preview.mp4`。

## 2026-10-13 清晰度修复

旧版把参考图缩为熊猫主体约 704×520，再放到 1024×576 海报中；呼吸 canvas 也固定为 1024×576，Retina 全屏时又被放大。这是坐下后模糊的主要原因。新版直接从用户 1448×1086 原图制作 2048×1152 注册海报，熊猫主体为 1408×1040，不从旧缩图放大。canvas 使用实际 CSS 尺寸×devicePixelRatio 绘制，上限 4096 边长并遵守 GPU 限制。窗口尺寸或显示器密度变化后重新分配画布。

胸腹位移幅度由 3.3 提至约 6 个设计像素，头部由 0.85 提至约 1.8 个设计像素，周期仍为 4.8 秒；设计坐标为 1024×576。呼吸依然是原图的局部形变模拟，不是实拍呼吸镜头。脚掌落地区域固定。

走入镜头的原生生成分辨率仍是 1024×576。更高分辨率的免费生成请求因 ZeroGPU 额度不足而未执行，没有购买额度，也没有更换动作。现有运动帧由 [Real-ESRGAN general-x4v3](https://github.com/xinntao/Real-ESRGAN/blob/master/docs/model_zoo.md) 在本机 Apple M2 上修复至 2048×1152；保留运动轨迹、帧序、原透明遮罩和时长。它是超分辨率修复，不能等同于原生高清拍摄，也不能补回源片不存在的真实毛发。模型与制作工具不随应用分发。模型来源许可见 `public/assets/REAL-ESRGAN-LICENSE.txt`。

复现路径：将官方 `realesr-general-x4v3.pth` 和 `realesrgan/archs/srvgg_arch.py` 放到 `build/video-upscale/`（后者仅移除 BasicSR 注册导入和装饰器），在支持 MPS 的 PyTorch 环境执行 `python3 scripts/animation/restore-video.py --all`，再执行 `python3 scripts/animation/finish-hires-video.py`，将 finished 帧以 24 fps、VP9 alpha 编码到 `panda-reference.webm`。原 1024×576 输入不覆盖。

`artifacts/clarity-review/fur-detail-comparison.png` 将旧海报放大、新 Retina 渲染和新源海报放在相同像素尺寸下比较；它证明参考细节保留，不单凭此图评价走入或呼吸自然度。

高清版将最终纹理还原缩短为 4 帧，随后保持原图 8 帧，再启动呼吸，减少两张已对齐面部纹理叠加造成的短暂模糊；总时长不变。
