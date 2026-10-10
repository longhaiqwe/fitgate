// Content Script: Shadow DOM 隔离锁屏与心跳通信
import overlayCss from './overlay.css?inline';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { getCurrentWorkoutQueue, getSettings } from '../shared/storage.js';
import { SCENARIOS } from '../shared/actions-data.js';

// 单例与防重复注入清理
if (window.__FITGATE_CLEANUP__) {
  try {
    window.__FITGATE_CLEANUP__();
  } catch {}
}

let isLocked = false;
let hostElement = null;
let shadowRoot = null;
let heartbeatTimer = null;
let mutationObserver = null;
let currentWorkoutAction = null;
let isContextInvalidated = false;

const HOST_ID = 'fitgate-host';

/**
 * 检查当前扩展上下文是否有效
 */
function isExtensionContextValid() {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome?.runtime && Boolean(chrome.runtime.id));
  } catch {
    return false;
  }
}

/**
 * 释放对滚轮和键盘按键的阻断，恢复网页默认滚动
 */
function releaseNavigationEvents() {
  window.removeEventListener('wheel', blockNavigationEvents, { capture: true });
  window.removeEventListener('keydown', blockNavigationEvents, { capture: true });
  window.removeEventListener('touchmove', blockNavigationEvents, { capture: true });
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

/**
 * 处理扩展上下文失效（插件重新加载、更新或注销）
 */
function handleContextInvalidated() {
  if (isContextInvalidated) return;
  isContextInvalidated = true;

  console.warn('[FitGate] 插件上下文已失效（插件可能被重新加载或更新），正在清理定时器与拦截事件');

  // 1. 停止心跳定时器
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // 2. 停止防篡改观察者
  stopAntiTamperObserver();

  // 3. 释放页面滚轮和快捷键阻断，防止页面被锁定
  releaseNavigationEvents();

  // 4. 如果页面当前处于锁定遮罩状态，优化卡片文案并提供一键刷新操作
  if (isLocked && shadowRoot) {
    const descEl = shadowRoot.getElementById('fitgate-desc-text');
    const hintEl = shadowRoot.getElementById('fitgate-footer-hint-text');
    const startBtn = shadowRoot.getElementById('fitgate-start-btn');
    const snoozeBtn = shadowRoot.getElementById('fitgate-snooze-btn');

    if (snoozeBtn) {
      snoozeBtn.style.display = 'none';
    }

    if (descEl) {
      descEl.textContent = '检测到插件已重新加载或更新，与后台通信中断。请刷新网页以恢复正常运行。';
    }
    if (hintEl) {
      hintEl.textContent = '* 点击下方按钮或按 F5 刷新当前网页即可恢复';
    }
    if (startBtn) {
      startBtn.innerHTML = '<span>🔄</span><span>刷新网页以继续</span>';
      const freshBtn = startBtn.cloneNode(true);
      startBtn.parentNode?.replaceChild(freshBtn, startBtn);
      freshBtn.addEventListener('click', () => {
        window.location.reload();
      });
    }
  }
}

/**
 * 安全发送 runtime 消息封装，拦截上下文失效与运行时错误
 */
function safeSendMessage(message, callback) {
  if (!isExtensionContextValid()) {
    handleContextInvalidated();
    return;
  }

  try {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime?.lastError) {
        const errMsg = chrome.runtime.lastError.message || '';
        if (errMsg.includes('Extension context invalidated')) {
          handleContextInvalidated();
          return;
        }
      }
      if (callback && typeof callback === 'function') {
        callback(res);
      }
    });
  } catch (err) {
    if (err?.message?.includes('Extension context invalidated')) {
      handleContextInvalidated();
    } else {
      console.warn('[FitGate] safeSendMessage 发送异常:', err);
    }
  }
}

// 注册全局清理句柄
window.__FITGATE_CLEANUP__ = () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  stopAntiTamperObserver();
  releaseNavigationEvents();
};

/**
 * 动态加载并更新锁屏卡片内容
 */
async function updateOverlayCardContent() {
  if (!shadowRoot) return;
  if (!isExtensionContextValid()) {
    handleContextInvalidated();
    return;
  }

  try {
    const [queue, settings] = await Promise.all([
      getCurrentWorkoutQueue(),
      getSettings()
    ]);
    const action = queue[0];
    currentWorkoutAction = action;

    const badgeEl = shadowRoot.getElementById('fitgate-icon-badge');
    const nameEl = shadowRoot.getElementById('fitgate-action-name-text');
    const specEl = shadowRoot.getElementById('fitgate-action-spec-text');

    if (badgeEl && action) {
      badgeEl.textContent = action.icon || '🏋️‍♂️';
    }

    if (nameEl && action) {
      if (queue.length > 1) {
        nameEl.textContent = `组合训练 (共 ${queue.length} 组)`;
      } else {
        nameEl.textContent = action.name;
      }
    }

    if (specEl && action) {
      if (queue.length > 1) {
        specEl.textContent = `首个: ${action.name}`;
      } else if (action.type === 'pose_counter') {
        specEl.textContent = action.id === 'home_jumping_jacks'
          ? `${action.targetReps || 15} 次`
          : `${settings.squatTarget || 10} 次`;
      } else if (action.type === 'bilateral') {
        specEl.textContent = `${action.perSideSeconds || 30} 秒 × 2 侧`;
      } else if (action.type === 'rep_hold') {
        specEl.textContent = `${action.reps || 8} 次循环`;
      } else {
        specEl.textContent = `${action.durationSeconds || 30} 秒保持`;
      }
    }
  } catch (err) {
    console.error('[FitGate] 更新锁屏内容异常:', err);
  }
}

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

  // 使用封闭式 Shadow DOM，隔离宿主网页的 CSS
  shadowRoot = hostElement.attachShadow({ mode: 'closed' });

  // 注入居中卡片弹窗结构
  shadowRoot.innerHTML = `
    <style>${overlayCss}</style>
    <div class="fitgate-overlay" id="fitgate-overlay">
      <div class="fitgate-card">
        <div class="fitgate-icon-badge" id="fitgate-icon-badge">🏋️‍♂️</div>
        <h1 class="fitgate-title">屏幕时间达标，该活动身体了！</h1>
        <p class="fitgate-desc" id="fitgate-desc-text">
          你在当前网站已连续停留达到预设上限。为了保护颈椎与腰椎健康，请离开椅子，完成指定动作解锁。
        </p>

        <div class="fitgate-target-box">
          <div class="fitgate-target-item">
            <span class="fitgate-target-label">今日目标动作</span>
            <span class="fitgate-target-value" id="fitgate-action-name-text">标准深蹲</span>
          </div>
          <div class="fitgate-target-item">
            <span class="fitgate-target-label">解锁要求</span>
            <span class="fitgate-target-value" id="fitgate-action-spec-text">10 次</span>
          </div>
        </div>

        <div class="fitgate-actions-row">
          <button class="fitgate-btn-primary" id="fitgate-start-btn" type="button">
            <span>🔥</span>
            <span>立即前往伴练室解锁</span>
          </button>
          <button class="fitgate-btn-secondary" id="fitgate-snooze-btn" type="button" title="推迟 5 分钟后再次提醒">
            <span>⏳</span>
            <span>推迟 5 分钟</span>
          </button>
        </div>

        <div class="fitgate-footer-hint" id="fitgate-footer-hint-text">
          * AI 视觉姿态检测完全在本地运行，视频流绝不上云，保护隐私
        </div>
      </div>
    </div>
  `;

  // 绑定推迟按钮点击事件：推迟 5 分钟并临时解除遮罩
  const snoozeBtn = shadowRoot.getElementById('fitgate-snooze-btn');
  if (snoozeBtn) {
    snoozeBtn.addEventListener('click', () => {
      if (!isExtensionContextValid()) {
        handleContextInvalidated();
        return;
      }
      safeSendMessage({
        type: MESSAGE_TYPES.SNOOZE_WORKOUT,
        payload: { snoozeMinutes: 5 }
      });
      hideLockOverlay();
    });
  }

  // 绑定主按钮点击事件：打开独立伴练室
  const startBtn = shadowRoot.getElementById('fitgate-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (!isExtensionContextValid()) {
        handleContextInvalidated();
        return;
      }
      safeSendMessage({
        type: MESSAGE_TYPES.OPEN_WORKOUT,
        payload: {}
      });
    });
  }

  document.documentElement.appendChild(hostElement);
}

/**
 * 阻断滚轮与快捷键翻页
 */
function blockNavigationEvents(e) {
  if (!isLocked) return;
  // 允许在弹窗内的正常操作，阻断底层滚动与按键
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
  updateOverlayCardContent();

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

  // 恢复滚动与事件监听
  releaseNavigationEvents();

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
  }, 350);
}

/**
 * 启动 DOM 篡改监听（防止用户审查元素强行删除遮罩节点）
 */
function startAntiTamperObserver() {
  if (mutationObserver) return;
  mutationObserver = new MutationObserver(() => {
    if (!isExtensionContextValid()) {
      stopAntiTamperObserver();
      return;
    }
    if (isLocked && (!hostElement || !document.contains(hostElement))) {
      console.warn('[FitGate] 检测到宿主节点被移除，立即恢复挂载');
      ensureOverlayHost();
      updateOverlayCardContent();
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
    if (!isExtensionContextValid()) {
      handleContextInvalidated();
      return;
    }

    // 仅在当前页面可见且处于活动前台时发送心跳累加时间
    if (document.visibilityState !== 'visible' || !document.hasFocus()) {
      return;
    }

    safeSendMessage({ type: MESSAGE_TYPES.HEARTBEAT }, (res) => {
      if (res && (res.status === 'locked' || res.status === 'locked_now')) {
        if (!isLocked) {
          showLockOverlay();
        }
      }
    });
  }, 1000);
}

// 监听来自 Background 与 Popup 的消息
try {
  if (isExtensionContextValid()) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request?.type === MESSAGE_TYPES.LOCK_PAGE) {
        showLockOverlay();
        sendResponse?.({ success: true, isLocked: true });
      } else if (request?.type === MESSAGE_TYPES.UNLOCK_PAGE) {
        hideLockOverlay();
        sendResponse?.({ success: true, isLocked: false });
      }
    });
  }
} catch {
  handleContextInvalidated();
}

// 监听可见性变化
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!isExtensionContextValid()) {
      handleContextInvalidated();
      return;
    }
    // 恢复可见时立即发送一次心跳校验状态
    safeSendMessage({ type: MESSAGE_TYPES.HEARTBEAT }, (res) => {
      if (res && (res.status === 'locked' || res.status === 'locked_now')) {
        showLockOverlay();
      }
    });
  }
});

// 初始化
startHeartbeat();
