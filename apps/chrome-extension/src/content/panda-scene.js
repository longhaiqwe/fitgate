// 锁屏熊猫场景：写实手绘熊猫图片 + 代码驱动动作
// 剧本：走路视频从屏幕左侧走到中间 → 趴下打盹 → 随机去吃竹叶 / 爬竹子 → 再趴回去，循环
import sceneCss from './panda-scene.css?inline';

export { sceneCss };

const ASSETS = {
  walk: 'assets/panda-walk.webm',
  lie: 'assets/panda-lie.webp',
  eat1: 'assets/panda-eat-1.webp',
  eat2: 'assets/panda-eat-2.webp',
  climb: 'assets/panda-climb.webp',
  stalk: 'assets/bamboo-stalk.webp',
  leaves: 'assets/bamboo-leaves.webp'
};

// 位置都以熊猫身长 --W 为单位（见 panda-scene.css）
const POS = {
  home: '0px',
  bamboo: 'calc(var(--W) * -0.95)', // 竹子在熊猫左边，避开右下角按钮
  offscreen: 'calc(-50vw - var(--W))'
};

const MS = {
  enter: 5200, // 入场走到中间
  toBamboo: 2600, // 从中间慢慢走到竹子下
  climbUp: 6000,
  hang: 4500,
  slideDown: 1600,
  eat: [9000, 12000],
  lie: [7000, 10000]
};

const between = ([a, b]) => a + Math.random() * (b - a);

/**
 * @param {(path: string) => string} assetUrl 把相对资源路径转成可加载的 URL
 */
export function createPandaScene(assetUrl) {
  const url = (key) => assetUrl(ASSETS[key]);
  const root = document.createElement('div');
  root.className = 'pd-scene';
  root.innerHTML = `
    <div class="pd-bamboo" style="background-image:url('${url('stalk')}')">
      <img class="pd-leaves pd-leaves-a" src="${url('leaves')}" alt="" draggable="false">
      <img class="pd-leaves pd-leaves-b" src="${url('leaves')}" alt="" draggable="false">
    </div>
    <div class="pd-actor">
      <div class="pd-shadow"></div>
      <div class="pd-lift">
        <div class="pd-flip">
          <video class="pd-layer pd-walk" src="${url('walk')}" muted playsinline loop preload="auto"></video>
          <img class="pd-layer pd-lie" src="${url('lie')}" alt="" draggable="false">
          <div class="pd-layer pd-eat">
            <img class="pd-eat-1" src="${url('eat1')}" alt="" draggable="false">
            <img class="pd-eat-2" src="${url('eat2')}" alt="" draggable="false">
          </div>
          <img class="pd-layer pd-climb" src="${url('climb')}" alt="" draggable="false">
        </div>
      </div>
      <div class="pd-zzz"><span>z</span><span>z</span><span>Z</span></div>
    </div>`;

  const actor = root.querySelector('.pd-actor');
  const lift = root.querySelector('.pd-lift');
  const flip = root.querySelector('.pd-flip');
  const video = root.querySelector('.pd-walk');

  let timers = [];
  let at = POS.home;

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function setPose(pose) {
    root.dataset.pose = pose;
    if (pose === 'walk') {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  function place(x, ms = 0, easing = 'linear') {
    actor.style.transition = ms ? `transform ${ms}ms ${easing}` : 'none';
    actor.style.transform = `translateX(${x})`;
    at = x;
  }

  function setLift(y, ms = 0, easing = 'linear') {
    lift.style.transition = ms ? `transform ${ms}ms ${easing}` : 'none';
    lift.style.transform = `translateY(${y})`;
  }

  function walkTo(x, ms, faceLeft, next) {
    flip.style.transform = faceLeft ? 'scaleX(-1)' : 'none';
    setPose('walk');
    place(x, ms);
    later(() => {
      flip.style.transform = 'none';
      next();
    }, ms);
  }

  function lieDown() {
    setPose('lie');
    later(doTrick, between(MS.lie));
  }

  let lastTrick = Math.random() < 0.5 ? 'eat' : 'climb';
  function doTrick() {
    // 大多数时候换着来，偶尔连着做同一件事
    const trick = Math.random() < 0.75 ? (lastTrick === 'eat' ? 'climb' : 'eat') : lastTrick;
    lastTrick = trick;
    if (trick === 'eat') {
      setPose('eat');
      later(lieDown, between(MS.eat));
    } else {
      climb();
    }
  }

  function climb() {
    walkTo(POS.bamboo, MS.toBamboo, true, () => {
      setPose('climb');
      root.dataset.climb = 'up';
      later(() => {
        setLift('calc(var(--W) * -0.62)', MS.climbUp, 'cubic-bezier(.45,.05,.55,.95)');
        later(() => {
          root.dataset.climb = 'hang'; // 爬累了挂着发呆
          later(() => {
            root.dataset.climb = 'down';
            setLift('0px', MS.slideDown, 'cubic-bezier(.5,0,.9,.6)');
            later(() => {
              delete root.dataset.climb;
              walkTo(POS.home, MS.toBamboo, false, lieDown);
            }, MS.slideDown + 150);
          }, MS.hang);
        }, MS.climbUp);
      }, 600);
    });
  }

  function start() {
    stop();
    setLift('0px');
    delete root.dataset.climb;
    flip.style.transform = 'none';

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      place(POS.home);
      setPose('lie');
      return;
    }

    place(POS.offscreen);
    void actor.getBoundingClientRect(); // 先落到屏幕外，再开始过渡
    walkTo(POS.home, MS.enter, false, lieDown);
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    video.pause();
  }

  place(POS.offscreen);
  root.dataset.pose = 'walk';

  return { element: root, start, stop };
}
