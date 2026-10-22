import os
from pathlib import Path
import subprocess
import shutil

BASE_DIR = str(Path(__file__).resolve().parents[1])
REPO_DIR = str(Path(BASE_DIR).parents[1])
DOCS_POINTS_OUT = os.path.join(REPO_DIR, "docs/screenshots/points")
BRAIN_POINTS_OUT = "/Users/longhai/.gemini/antigravity/brain/d9867030-5ad5-4ed0-8124-5c0e0e52f398/screenshots_points"
TMP_DIR = "/tmp/fitgate_9points_gen"

os.makedirs(DOCS_POINTS_OUT, exist_ok=True)
os.makedirs(BRAIN_POINTS_OUT, exist_ok=True)
os.makedirs(TMP_DIR, exist_ok=True)

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

def get_git_file(path):
    for git_path in (f"apps/chrome-extension/{path}", path):
        res = subprocess.run(["git", "show", f"HEAD:{git_path}"], cwd=REPO_DIR, capture_output=True, text=True)
        if res.returncode == 0:
            return res.stdout
    raise RuntimeError(f"No committed source for {path}")

def read_local_file(path):
    with open(os.path.join(BASE_DIR, path), "r", encoding="utf-8") as f:
        return f.read()

# 获取 CSS 源码
tokens_css = Path(REPO_DIR, "packages/workout-core/src/tokens.css").read_text(encoding="utf-8")
popup_css_before = get_git_file("src/popup/popup.css")
popup_css_after = read_local_file("src/popup/popup.css")
workout_css_before = get_git_file("src/workout/workout.css")
workout_css_after = read_local_file("src/workout/workout.css")
overlay_css_before = get_git_file("src/content/overlay.css")
overlay_css_after = read_local_file("src/content/overlay.css")

# 定义 9 个点的 HTML 页面片段生成器
# 每个点生成一对 HTML: before.html 和 after.html

points_config = [
    # ---------------- Point 1: 场景网格与去红光 (Hierarchy - P0) ----------------
    {
        "id": "point_01_hierarchy_grid",
        "title": "Point 1: 场景选择网格与去红晕 (Hierarchy)",
        "width": 380,
        "height": 210,
        "before_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {popup_css_before}
            body {{ margin:0; padding:12px; background:#0f1523; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
        </style></head><body>
            <div class="setting-section">
                <div class="section-label"><span>当前工作场景</span><span class="scenario-badge">工位 · 坐姿</span></div>
                <div class="scenario-selector">
                    <div class="scenario-card active" data-scenario="workstation"><span class="scenario-icon">🪑</span><span class="scenario-name">工位坐姿</span><span class="scenario-desc">不可站起来</span></div>
                    <div class="scenario-card" data-scenario="standing"><span class="scenario-icon">🧍</span><span class="scenario-name">工位站姿</span><span class="scenario-desc">轻微幅度</span></div>
                    <div class="scenario-card" data-scenario="home"><span class="scenario-icon">🏠</span><span class="scenario-name">居家办公</span><span class="scenario-desc">大动作深蹲</span></div>
                    <div class="scenario-card" data-scenario="all"><span class="scenario-icon">🎲</span><span class="scenario-name">全场景</span><span class="scenario-desc">自由轮换</span></div>
                </div>
            </div>
        </body></html>""",
        "after_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {tokens_css}
            {popup_css_after}
            body {{ margin:0; padding:12px; background:var(--color-bg-base); font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
        </style></head><body>
            <div class="setting-section">
                <div class="section-label"><span>当前工作场景</span><span class="scenario-badge">工位 · 坐姿</span></div>
                <div class="scenario-grid">
                    <div class="scenario-card active" data-scenario="workstation"><div class="scenario-icon">🪑</div><div class="scenario-info"><div class="scenario-title">办公室 · 坐姿</div><div class="scenario-desc">不可站起来</div></div></div>
                    <div class="scenario-card" data-scenario="standing"><div class="scenario-icon">🚶</div><div class="scenario-info"><div class="scenario-title">办公室 · 站立</div><div class="scenario-desc">可站起来</div></div></div>
                    <div class="scenario-card" data-scenario="home"><div class="scenario-icon">🏠</div><div class="scenario-info"><div class="scenario-title">居家办公</div><div class="scenario-desc">大动作深蹲</div></div></div>
                    <div class="scenario-card" data-scenario="all"><div class="scenario-icon">🎲</div><div class="scenario-info"><div class="scenario-title">全场景</div><div class="scenario-desc">自由轮换</div></div></div>
                </div>
            </div>
        </body></html>"""
    },

    # ---------------- Point 2: 字体阶梯与消灭 9px/10px (Typography - P0) ----------------
    {
        "id": "point_02_typography",
        "title": "Point 2: 字体阶梯与消灭 9px/10px (Typography)",
        "width": 420,
        "height": 260,
        "before_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {popup_css_before}
            {workout_css_before}
            body {{ margin:0; padding:12px; background:#0f1523; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
            .demo-box {{ display: flex; flex-direction: column; gap: 12px; }}
        </style></head><body>
            <div class="demo-box">
                <div class="scenario-card" style="width: 280px;"><span class="scenario-icon">🪑</span><span class="scenario-name">工位坐姿</span><span class="scenario-desc" style="font-size: 9px; color: rgba(255,255,255,0.4);">不可站起来 · 9px 模糊发虚</span></div>
                <div style="background: #182035; padding: 14px; border-radius: 12px; width: 360px;">
                    <div style="font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 6px;">深蹲计数 (断层跳阶 64px -> 24px)</div>
                    <div class="counter-value-box" style="margin: 0;"><span class="counter-current" style="font-size: 64px;">4</span><span class="counter-target" style="font-size: 24px;">/ 10 次</span></div>
                </div>
            </div>
        </body></html>""",
        "after_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {tokens_css}
            {popup_css_after}
            {workout_css_after}
            body {{ margin:0; padding:12px; background:var(--color-bg-base); font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
            .demo-box {{ display: flex; flex-direction: column; gap: 12px; }}
        </style></head><body>
            <div class="demo-box">
                <div class="scenario-card" style="width: 280px;"><div class="scenario-icon">🪑</div><div class="scenario-info"><div class="scenario-title">办公室 · 坐姿</div><div class="scenario-desc">不可站起来 · 11px 清晰字阶</div></div></div>
                <div style="background: var(--color-slate-900); border: 1px solid var(--color-slate-800); padding: 14px; border-radius: var(--radius-lg); width: 360px;">
                    <div style="font-size: var(--font-xs); color: var(--color-text-muted); margin-bottom: 6px;">深蹲计数 (标准 48px 配 14px 基线对齐)</div>
                    <div class="counter-value-box" style="margin: 0;"><span class="counter-current">4</span><span class="counter-target">/ 10 次</span></div>
                </div>
            </div>
        </body></html>"""
    },

    # ---------------- Point 3: 全局统一底色与主色阶 (Color - P1) ----------------
    {
        "id": "point_03_color_system",
        "title": "Point 3: 统一 Slate 灰阶与运动橙色阶 (Color)",
        "width": 540,
        "height": 280,
        "before_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {popup_css_before}
            {workout_css_before}
            body {{ margin:0; padding:16px; background:#1e1e24; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
            .compare-row {{ display: flex; gap: 16px; }}
            .panel {{ flex: 1; padding: 16px; border-radius: 12px; }}
        </style></head><body>
            <div style="color: #bbb; font-size: 12px; margin-bottom: 8px;">优化前：Popup 与 Workout 底色存在色相偏移 (#0f1523 vs #0a0e1a)</div>
            <div class="compare-row">
                <div class="panel" style="background: #0f1523; border: 1px solid rgba(255,255,255,0.08);">
                    <div style="color: #ff6b4a; font-weight: 700; margin-bottom: 6px;">Popup 面板底色</div>
                    <div style="color: #fff; font-size: 13px;">#0f1523 (偏藏蓝青灰)</div>
                    <div style="margin-top: 12px; background: #ff6b4a; color: #fff; padding: 6px 12px; border-radius: 6px; text-align: center; font-size: 12px;">高饱和原生橙</div>
                </div>
                <div class="panel" style="background: #0a0e1a; border: 1px solid rgba(255,255,255,0.08);">
                    <div style="color: #30d158; font-weight: 700; margin-bottom: 6px;">Workout 工坊底色</div>
                    <div style="color: #fff; font-size: 13px;">#0a0e1a (偏冷黑灰，色相脱节)</div>
                    <div style="margin-top: 12px; background: #30d158; color: #fff; padding: 6px 12px; border-radius: 6px; text-align: center; font-size: 12px;">高饱和绿发光</div>
                </div>
            </div>
        </body></html>""",
        "after_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {tokens_css}
            {popup_css_after}
            {workout_css_after}
            body {{ margin:0; padding:16px; background:#000; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
            .compare-row {{ display: flex; gap: 16px; }}
            .panel {{ flex: 1; padding: 16px; border-radius: var(--radius-lg); }}
        </style></head><body>
            <div style="color: var(--color-slate-400); font-size: 12px; margin-bottom: 8px;">优化后：全局严格统一 Slate-950/900 底色与 Orange-500 运动主色</div>
            <div class="compare-row">
                <div class="panel" style="background: var(--color-bg-base); border: 1px solid var(--color-slate-800);">
                    <div style="color: var(--color-primary-400); font-weight: 700; margin-bottom: 6px;">Popup 面板底色</div>
                    <div style="color: #fff; font-size: 13px;">Slate-950 (#030712) 绝对一致</div>
                    <div style="margin-top: 12px; background: var(--color-primary-500); color: #fff; padding: 6px 12px; border-radius: var(--radius-md); text-align: center; font-size: 12px; box-shadow: var(--shadow-sm), var(--inset-top-highlight);">活力运动橙色阶</div>
                </div>
                <div class="panel" style="background: var(--color-bg-base); border: 1px solid var(--color-slate-800);">
                    <div style="color: var(--color-primary-400); font-weight: 700; margin-bottom: 6px;">Workout 工坊底色</div>
                    <div style="color: #fff; font-size: 13px;">Slate-950 (#030712) 绝对一致</div>
                    <div style="margin-top: 12px; background: var(--color-surface-2); color: var(--color-primary-400); border: 1px solid var(--color-primary-border); padding: 6px 12px; border-radius: var(--radius-md); text-align: center; font-size: 12px;">柔和语义辅助色</div>
                </div>
            </div>
        </body></html>"""
    },

    # ---------------- Point 4: 空间亲密性 Outer > Inner (Layout - P1) ----------------
    {
        "id": "point_04_spacing_layout",
        "title": "Point 4: 空间亲密性 Outer > Inner (Layout)",
        "width": 380,
        "height": 280,
        "before_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {popup_css_before}
            body {{ margin:0; padding:12px; background:#0f1523; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
        </style></head><body>
            <div class="setting-section">
                <div class="section-label">规则参数设置 (内外间距 14px vs 12px 模糊)</div>
                <div class="setting-item">
                    <div class="item-header"><span>连续使用上限</span><span class="item-val">20 分钟</span></div>
                    <input type="range" min="1" max="60" value="20">
                </div>
                <div class="setting-item" style="margin-top: 12px;">
                    <div class="item-header"><span>解锁深蹲目标</span><span class="item-val">10 次</span></div>
                    <input type="range" min="3" max="30" value="10">
                </div>
            </div>
        </body></html>""",
        "after_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {tokens_css}
            {popup_css_after}
            body {{ margin:0; padding:12px; background:var(--color-bg-base); font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
        </style></head><body>
            <div class="setting-section">
                <div class="section-label">规则参数设置 (组外 16px，组内 8px 亲密内聚)</div>
                <div class="setting-item">
                    <div class="item-header"><span>连续使用上限</span><span class="item-val">20 分钟</span></div>
                    <input type="range" min="1" max="60" value="20">
                </div>
                <div class="setting-item" style="margin-top: 12px;">
                    <div class="item-header"><span>解锁深蹲目标</span><span class="item-val">10 次</span></div>
                    <input type="range" min="3" max="30" value="10">
                </div>
            </div>
        </body></html>"""
    },

    # ---------------- Point 5: 物理光照与收敛 80px 刺眼光晕 (Depth - P1) ----------------
    {
        "id": "point_05_depth_lighting",
        "title": "Point 5: 物理光照与收敛 80px 光晕 (Depth)",
        "width": 500,
        "height": 340,
        "before_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {workout_css_before}
            body {{ margin:0; padding:30px; background:#0a0e1a; font-family:-apple-system, BlinkMacSystemFont, sans-serif; display:flex; justify-content:center; align-items:center; }}
        </style></head><body>
            <div class="victory-box" style="margin: 0; box-shadow: 0 0 80px rgba(48, 209, 88, 0.4);">
                <div class="victory-icon">🎉</div>
                <h2 class="victory-title">今日活动达标！</h2>
                <p class="victory-desc">80px 纯色弥散发光，带有过度滤镜感</p>
                <div class="badge-target">即将自动关闭本页</div>
            </div>
        </body></html>""",
        "after_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {tokens_css}
            {workout_css_after}
            body {{ margin:0; padding:30px; background:var(--color-bg-base); font-family:-apple-system, BlinkMacSystemFont, sans-serif; display:flex; justify-content:center; align-items:center; }}
        </style></head><body>
            <div class="victory-box" style="margin: 0;">
                <div class="victory-icon">🎉</div>
                <h2 class="victory-title">今日活动达标！</h2>
                <p class="victory-desc">物理景深阴影 + 顶部 1px 微反光边缘</p>
                <div class="badge-target">即将自动关闭本页</div>
            </div>
        </body></html>"""
    },

    # ---------------- Point 6: Emoji 图标底座容器化 (Images/Icons - P1) ----------------
    {
        "id": "point_06_icon_containers",
        "title": "Point 6: Emoji 图标底座化 (Images/Icons)",
        "width": 380,
        "height": 160,
        "before_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {popup_css_before}
            body {{ margin:0; padding:16px; background:#0f1523; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
            .row {{ display: flex; gap: 12px; }}
        </style></head><body>
            <div style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 8px;">优化前：原生 Emoji 裸奔无底座</div>
            <div class="row">
                <div class="scenario-card" style="flex:1;"><span class="scenario-icon">🪑</span><span class="scenario-name">坐姿</span></div>
                <div class="scenario-card active" style="flex:1;"><span class="scenario-icon">🚶</span><span class="scenario-name">站姿</span></div>
                <div class="scenario-card" style="flex:1;"><span class="scenario-icon">🏠</span><span class="scenario-name">居家</span></div>
            </div>
        </body></html>""",
        "after_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {tokens_css}
            {popup_css_after}
            body {{ margin:0; padding:16px; background:var(--color-bg-base); font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
            .row {{ display: flex; gap: 12px; }}
        </style></head><body>
            <div style="font-size: 12px; color: var(--color-slate-400); margin-bottom: 8px;">优化后：28x28 微磨砂圆角容器底座 (Badge Container)</div>
            <div class="row">
                <div class="scenario-card" style="flex:1;"><div class="scenario-icon">🪑</div><span class="scenario-title">坐姿</span></div>
                <div class="scenario-card active" style="flex:1;"><div class="scenario-icon">🚶</div><span class="scenario-title">站姿</span></div>
                <div class="scenario-card" style="flex:1;"><div class="scenario-icon">🏠</div><span class="scenario-title">居家</span></div>
            </div>
        </body></html>"""
    },

    # ---------------- Point 7: 剔除反馈气泡虚线草稿感 (Finishing - P1) ----------------
    {
        "id": "point_07_feedback_bubble",
        "title": "Point 7: 剔除虚线气泡升级 Coach Tip (Finishing)",
        "width": 460,
        "height": 130,
        "before_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {workout_css_before}
            body {{ margin:0; padding:16px; background:#0a0e1a; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
        </style></head><body>
            <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 8px;">优化前：1px dashed 虚线边框，草稿线框味浓</div>
            <div class="feedback-bubble">
                <span class="icon">💡</span>
                <span>很好！深度已达标，起立完成第 5 次计数</span>
            </div>
        </body></html>""",
        "after_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {tokens_css}
            {workout_css_after}
            body {{ margin:0; padding:16px; background:var(--color-bg-base); font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
        </style></head><body>
            <div style="font-size: 12px; color: var(--color-slate-400); margin-bottom: 8px;">优化后：实色暗黑卡片 + 左侧琥珀色提示条 (Coach Tip)</div>
            <div class="feedback-bubble">
                <span class="icon">💡</span>
                <span>很好！深度已达标，起立完成第 5 次计数</span>
            </div>
        </body></html>"""
    },

    # ---------------- Point 8: 表单微交互与空状态 (Finishing - P2) ----------------
    {
        "id": "point_08_form_controls",
        "title": "Point 8: 表单微交互与空状态 (Finishing)",
        "width": 380,
        "height": 340,
        "before_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {popup_css_before}
            body {{ margin:0; padding:12px; background:#0f1523; font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
        </style></head><body>
            <div class="setting-section">
                <div class="section-label">规则参数设置 (原生灰色轨道滑块)</div>
                <div class="setting-item">
                    <div class="item-header"><span>连续使用上限</span><span class="item-val">20 分钟</span></div>
                    <input type="range" min="1" max="60" value="20">
                </div>
            </div>
            <div class="setting-section" style="margin-top: 12px;">
                <div class="section-label">受控网站域名 (无空状态直接留白)</div>
                <div style="min-height: 40px; border: 1px dashed rgba(255,255,255,0.1); border-radius: 6px; display:flex; align-items:center; justify-content:center; color: rgba(255,255,255,0.3); font-size: 12px;">
                    (空白无引导)
                </div>
            </div>
        </body></html>""",
        "after_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {tokens_css}
            {popup_css_after}
            body {{ margin:0; padding:12px; background:var(--color-bg-base); font-family:-apple-system, BlinkMacSystemFont, sans-serif; }}
        </style></head><body>
            <div class="setting-section">
                <div class="section-label">规则参数设置 (定制暗黑滑块 + 发光 Thumb)</div>
                <div class="setting-item">
                    <div class="item-header"><span>连续使用上限</span><span class="item-val">20 分钟</span></div>
                    <input type="range" min="1" max="60" value="20">
                </div>
            </div>
            <div class="setting-section" style="margin-top: 12px;">
                <div class="section-label">受控网站域名 (新增图文 Empty State)</div>
                <div class="empty-state">
                    <div class="empty-state-icon">🛡️</div>
                    <div class="empty-state-text">暂无限制域名，享受专注时光</div>
                </div>
            </div>
        </body></html>"""
    },

    # ---------------- Point 9: 锁屏动作规约框去虚线与解耦 (Hierarchy - P2) ----------------
    {
        "id": "point_09_overlay_card",
        "title": "Point 9: 锁屏动作规格去虚线与解耦 (Hierarchy)",
        "width": 500,
        "height": 280,
        "before_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {overlay_css_before}
            body {{ margin:0; padding:16px; background:#0f1422; font-family:-apple-system, BlinkMacSystemFont, sans-serif; display:flex; justify-content:center; align-items:center; }}
        </style></head><body>
            <div class="fitgate-card" style="width: 440px; margin: 0;">
                <div class="fitgate-target-box">
                    <div class="fitgate-target-item">
                        <span class="fitgate-target-label">解锁动作</span>
                        <span class="fitgate-target-value">背后交扣侧头 (工位坐姿)</span>
                    </div>
                    <div class="fitgate-target-item">
                        <span class="fitgate-target-label">完成目标</span>
                        <span class="fitgate-target-value">35 秒 × 2 侧</span>
                    </div>
                </div>
                <button class="fitgate-btn-primary" style="margin-top: 12px; width: 100%;">
                    <span>🚀 立即打开动作伴练工坊</span>
                </button>
            </div>
        </body></html>""",
        "after_html": f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            {tokens_css}
            {overlay_css_after}
            body {{ margin:0; padding:16px; background:var(--color-bg-base); font-family:-apple-system, BlinkMacSystemFont, sans-serif; display:flex; justify-content:center; align-items:center; }}
        </style></head><body>
            <div class="fitgate-card" style="width: 440px; margin: 0;">
                <div class="fitgate-target-box">
                    <div class="fitgate-target-item">
                        <span class="fitgate-target-label">解锁动作</span>
                        <span class="fitgate-target-value">背后交扣侧头 · 坐姿</span>
                    </div>
                    <div class="fitgate-target-item">
                        <span class="fitgate-target-label">完成目标</span>
                        <span class="fitgate-target-value">35 秒 × 2 侧</span>
                    </div>
                </div>
                <button class="fitgate-btn-primary" style="margin-top: 12px; width: 100%;">
                    <span>🚀 立即打开动作伴练工坊</span>
                </button>
            </div>
        </body></html>"""
    }
]

# 执行截图捕获
for p in points_config:
    p_id = p["id"]
    w = p["width"]
    h = p["height"]

    # 1. 写入 before HTML
    b_html_path = os.path.join(TMP_DIR, f"{p_id}_before.html")
    with open(b_html_path, "w", encoding="utf-8") as f:
        f.write(p["before_html"])

    # 2. 写入 after HTML
    a_html_path = os.path.join(TMP_DIR, f"{p_id}_after.html")
    with open(a_html_path, "w", encoding="utf-8") as f:
        f.write(p["after_html"])

    # 截取 Before
    b_out = os.path.join(DOCS_POINTS_OUT, f"{p_id}_before.png")
    cmd_b = [
        CHROME_BIN,
        "--headless=new",
        f"--screenshot={b_out}",
        f"--window-size={w},{h}",
        "--force-device-scale-factor=2",
        "--hide-scrollbars",
        f"file://{b_html_path}"
    ]
    subprocess.run(cmd_b, check=True)
    shutil.copy2(b_out, os.path.join(BRAIN_POINTS_OUT, f"{p_id}_before.png"))

    # 截取 After
    a_out = os.path.join(DOCS_POINTS_OUT, f"{p_id}_after.png")
    cmd_a = [
        CHROME_BIN,
        "--headless=new",
        f"--screenshot={a_out}",
        f"--window-size={w},{h}",
        "--force-device-scale-factor=2",
        "--hide-scrollbars",
        f"file://{a_html_path}"
    ]
    subprocess.run(cmd_a, check=True)
    shutil.copy2(a_out, os.path.join(BRAIN_POINTS_OUT, f"{p_id}_after.png"))

    print(f"Captured pair for {p['title']}: OK")

print("\nAll 9 pairs of screenshots captured successfully!")
