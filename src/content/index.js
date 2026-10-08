// Content Script: Shadow DOM 隔离锁屏与心跳通信
import overlayCss from './overlay.css?inline';
import { MESSAGE_TYPES } from '../shared/constants.js';

let isLocked = false;
let hostElement = null;
let shadowRoot = null;
let heartbeatTimer = null;
let mutationObserver = null;

const HOST_ID = 'fitgate-host';

/**
 * 创建或获取 Shadow DOM 宿主
 */
function ensureOverlayHost() {
  if (hostElement && document.contains(hostElement)) {
    return;
  }

  // 避免已存在重复节点
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove();
  }

  hostElement = document.createElement('div');
  hostElement.id = HOST_ID;
  hostElement.style.position = 'fixed';
  hostElement.style.zIndex = '2147483647';
  hostElement.style.top = '0';
  hostElement.style.left = '0';

  // 使用封闭式 Shadow DOM，彻底隔离宿主网页的 CSS 影响
  shadowRoot = hostElement.attachShadow({ mode: 'closed' });

  // 注入样式与 HTML
  shadowRoot.innerHTML = `
    <style>${overlayCss}</style>
    <div class="fitgate-overlay" id="fitgate-overlay">
      <div class="fitgate-card">
        <div class="fitgate-icon-badge">🏋️‍♂️</div>
        <h1 class="fitgate-title">屏幕时间达标，该活动身体了！</h1>
        <p class="fitgate-desc">
          你在当前网站已连续停留达到预设上限。为了保护颈椎与腰椎健康，请离开椅子，在摄像头前完成指定动作解锁。
        </p>

        <div class="fitgate-target-box">
          <div class="fitgate-target-item">
            <span class="fitgate-target-label">今日目标动作</span>
            <span class="fitgate-target-value">标准深蹲 (Squats)</span>
          </div>
          <div class="fitgate-target-item">
            <span class="fitgate-target-label">解锁要求</span>
            <span class="fitgate-target-value" id="fitgate-squat-target-text">10 次</span>
          </div>
        </div>

        <button class="fitgate-btn-primary" id="fitgate-start-btn">
          <span>🔥</span>
          <span>立即前往健身房解锁</span>
        </button>

        <div class="fitgate-footer-hint">
          * AI 视觉姿态检测完全在本地运行，视频流绝不上云，保护隐私
        </div>
      </div>
    </div>
  `;

  // 绑定点击事件：打开独立健身房
  const startBtn = shadowRoot.getElementById('fitgate-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OPEN_WORKOUT });
    });
  }

  document.documentElement.appendChild(hostElement);
}

/**
 * 阻断滚轮与快捷键翻页
 */
function blockNavigationEvents(e) {
  if (!isLocked) return;
  // 允许在健身遮罩内的正常操作，阻断底层滚动与按键
  const blockedKeys = ['Space', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'End', 'Home'];
  if (e.type === 'keydown' && blockedKeys.includes(e.code)) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (e.type === 'wheel' || e.type === 'touchmove') {
    e.preventDefault();
    e.stopPropagation();
  }
}

/**
 * 显示锁屏遮罩
 */
function showLockOverlay() {
  isLocked = true;
  ensureOverlayHost();

  const overlay = shadowRoot?.getElementById('fitgate-overlay');
  if (overlay) {
    overlay.classList.add('active');
  }

  // 禁用页面底层滚动
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  // 注册全局阻断事件
  window.addEventListener('wheel', blockNavigationEvents, { passive: false, capture: true });
  window.addEventListener('keydown', blockNavigationEvents, { capture: true });
  window.addEventListener('touchmove', blockNavigationEvents, { passive: false, capture: true });

  // 开启 DOM 防删除监听
  startAntiTamperObserver();
}

/**
 * 解锁并移除遮罩
 */
function hideLockOverlay() {
  isLocked = false;
  stopAntiTamperObserver();

  // 恢复滚动
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';

  window.removeEventListener('wheel', blockNavigationEvents, { capture: true });
  window.removeEventListener('keydown', blockNavigationEvents, { capture: true });
  window.removeEventListener('touchmove', blockNavigationEvents, { capture: true });

  const overlay = shadowRoot?.getElementById('fitgate-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }

  // 延迟移除宿主 DOM，保持渐隐动画
  setTimeout(() => {
    if (!isLocked && hostElement && hostElement.parentNode) {
      hostElement.remove();
      hostElement = null;
      shadowRoot = null;
    }
  }, 400);
}

/**
 * 启动 DOM 篡改监听（防止用户用审查元素强行删除遮罩节点）
 */
function startAntiTamperObserver() {
  if (mutationObserver) return;
  mutationObserver = new MutationObserver(() => {
    if (isLocked && (!hostElement || !document.contains(hostElement))) {
      console.warn('[FitGate] 检测到宿主节点被移除，立即恢复挂载');
      ensureOverlayHost();
      const overlay = shadowRoot?.getElementById('fitgate-overlay');
      if (overlay) overlay.classList.add('active');
    }
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function stopAntiTamperObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

/**
 * 启动心跳上报
 */
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(() => {
    // 仅在当前页面可见且处于活动前台时发送心跳累加时间
    if (document.visibilityState !== 'visible' || !document.hasFocus()) {
      return;
    }

    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.HEARTBEAT }, (res) => {
      if (chrome.runtime.lastError) return;

      if (res && (res.status === 'locked' || res.status === 'locked_now')) {
        if (!isLocked) {
          showLockOverlay();
        }
      }
    });
  }, 1000);
}

// 监听来自 Background 的直接广播
chrome.runtime.onMessage.addListener((request) => {
  if (request?.type === MESSAGE_TYPES.LOCK_PAGE) {
    showLockOverlay();
  } else if (request?.type === MESSAGE_TYPES.UNLOCK_PAGE) {
    hideLockOverlay();
  }
});

// 监听可见性变化
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // 恢复可见时立即发送一次心跳校验状态
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.HEARTBEAT }, (res) => {
      if (res && (res.status === 'locked' || res.status === 'locked_now')) {
        showLockOverlay();
      }
    });
  }
});

// 初始化
startHeartbeat();
