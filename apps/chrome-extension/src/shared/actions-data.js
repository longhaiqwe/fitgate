import { createActionCatalog } from '@fitgate/workout-core/action-catalog.js';

// 动作库与场景数据定义 (100% 摄像头高精度识别与全身律动动作精选)
// 依据工位健康指南，彻底剔除桌面遮挡、面壁背身与地面俯视死角动作，新增开合跳大动作

export const SCENARIOS = Object.freeze({
  office_seated: {
    id: 'office_seated',
    name: '办公室 · 坐姿',
    sub: '5 个动作 · 不可站起',
    icon: '🪑',
    tag: '工位坐姿',
    actionCount: 5,
    canStand: false,
    desc: '完全坐在办公椅上即可完成，摄像头正对脸颈肩，AI 100% 极佳识别（包含 5 个坐姿肩颈放松动作）。'
  },
  office_standing: {
    id: 'office_standing',
    name: '办公室 · 站立',
    sub: '10 个动作 · 可站起来',
    icon: '🚶',
    tag: '工位站姿',
    actionCount: 10,
    canStand: true,
    desc: '站在工位旁舒展胸背与腰椎，兼备坐姿肩颈放松（递进包含 5 个坐姿动作 + 5 个站姿动作，共 10 个）。'
  },
  home_active: {
    id: 'home_active',
    name: '居家办公',
    sub: '12 个动作 · 全身大动作',
    icon: '🏠',
    tag: '居家全套',
    actionCount: 12,
    canStand: true,
    desc: '居家空间宽敞自由，涵盖标准深蹲、活力开合跳以及全套工位肩颈腰背动作，强力激活全身循环（全量 12 个动作）。'
  },
  // 保留旧版 'all' 键别名，防止历史遗留配置未迁移时读取为空
  all: {
    id: 'home_active',
    name: '居家办公',
    sub: '12 个动作 · 全身大动作',
    icon: '🏠',
    tag: '居家全套',
    actionCount: 12,
    canStand: true,
    desc: '居家空间宽敞自由，涵盖标准深蹲、活力开合跳以及全套工位肩颈腰背动作，强力激活全身循环（全量 12 个动作）。'
  }
});

export const ACTIONS = Object.freeze([
  // ================= 办公室 · 坐姿 (不可站起来，5 个动作，镜头完全可见) =================
  {
    id: 'seated_behind_neck',
    scenario: 'office_seated',
    name: '坐姿侧头舒展',
    subtitle: '坐姿开肩与颈侧拉伸',
    image: 'actions/03_背后交扣侧头.jpg',
    type: 'bilateral', // 双侧轮换动作
    perSideSeconds: 30,
    totalSeconds: 60,
    targetArea: '缓解长时间伏案、低头看屏幕引起的肩颈紧张与习惯性耸肩。',
    steps: [
      '端坐在办公椅上，挺直后背，双肩自然下沉。',
      '双手移到背后十指交扣，压住双肩，避免耸肩。',
      '头部平缓倒向一侧，感受对侧颈部拉伸。',
      '保持平稳呼吸 30 秒，回正后换另一侧。'
    ],
    checkAndStop: '拉伸感集中在对侧颈部。若感到手臂发麻、刺痛或头晕，立即停止并回正。',
    tips: '保持双肩自然下沉，平稳呼吸，避免用力拉扯头部。'
  },
  {
    id: 'seated_ear_shoulder',
    scenario: 'office_seated',
    name: '耳朵找肩膀',
    subtitle: '坐姿颈侧斜角肌拉伸',
    image: 'actions/04_耳朵找肩膀.jpg',
    type: 'bilateral',
    perSideSeconds: 30,
    totalSeconds: 60,
    targetArea: '缓解多屏办公或习惯偏头看屏幕导致的单侧颈肌紧张。',
    steps: [
      '端坐在办公椅上，背部挺直，双肩放松下沉。',
      '头部平缓向一侧倾斜，耳朵靠近同侧肩膀。',
      '同侧手轻轻搭在头顶对侧引导方向，另一侧手臂自然下垂。',
      '保持平稳呼吸 30 秒，缓慢回正后换另一侧。'
    ],
    checkAndStop: '颈部侧面有适度拉伸感，双肩保持水平。若感到手指发麻或头晕，立即停止。',
    tips: '手搭在头顶仅提供方向引导，切勿发力下拽。'
  },
  {
    id: 'seated_look_armpit',
    scenario: 'office_seated',
    name: '低头看腋窝',
    subtitle: '坐姿肩胛提肌放松',
    image: 'actions/05_低头看腋窝.jpg',
    type: 'bilateral',
    perSideSeconds: 30,
    totalSeconds: 60,
    targetArea: '缓解长时间低头看屏幕引起的后颈与肩胛内上角紧张，改善转头受限。',
    steps: [
      '坐在椅子上，背部挺直，双肩下沉。',
      '头部向一侧水平转动约 45 度，微收下巴，看向同侧腋窝方向。',
      '同侧手掌轻轻扶在后脑勺外侧，稳定姿态。',
      '保持平稳呼吸 30 秒，平缓抬头回正后换另一侧。'
    ],
    checkAndStop: '拉伸感自后脑勺斜下方延伸至肩胛骨上方。若颈椎有卡压锐痛或手麻，立即停止。',
    tips: '先水平转头，再低头看腋窝，动作保持平缓。'
  },
  {
    id: 'seated_press_collarbone',
    scenario: 'office_seated',
    name: '手按锁骨看斜上方',
    subtitle: '坐姿胸锁乳突肌舒展',
    image: 'actions/06_手按锁骨.jpg',
    type: 'bilateral',
    perSideSeconds: 30,
    totalSeconds: 60,
    targetArea: '缓解低头伏案、头颈前伸引起的颈前肌群短缩。',
    steps: [
      '坐在椅子上，挺直背部，双肩下沉。',
      '双手按在胸骨与锁骨交界处，轻微向下固定皮肤。',
      '头部转向一侧，面部转向对侧上方。',
      '感受颈部前侧平稳拉伸，保持 30 秒后换另一侧。'
    ],
    checkAndStop: '拉伸感位于颈部前侧。若后颈出现卡压刺痛或眩晕，立即回正。',
    tips: '双手按稳锁骨固定位置，不要过度后仰折颈。'
  },
  {
    id: 'seated_hold_head_down',
    scenario: 'office_seated',
    name: '托住后脑低头',
    subtitle: '坐姿枕下肌群放松',
    image: 'actions/07_托后脑低头.jpg',
    type: 'hold', // 单次保持动作
    durationSeconds: 30,
    totalSeconds: 30,
    targetArea: '缓解长时间低头或平视屏幕引起的枕下肌群持续收缩与头部发胀。',
    steps: [
      '端坐在椅子上，背部挺直，不要弓背。',
      '双手十指交扣，托在后脑勺枕骨下方。',
      '微收下巴，顺着头部重力平缓低头。',
      '背部保持直立，平稳呼吸 30 秒。'
    ],
    checkAndStop: '后脑勺下方与上颈椎交界处有适度拉伸感。若后颈刺痛或双手用力按压，立即停止。',
    tips: '仅微收下巴低头，严禁用手臂向下用力压头。'
  },

  // ================= 办公室 · 站立 (可站起来，5 个动作，镜头完全可见) =================
  {
    id: 'standing_raise_hands',
    scenario: 'office_standing',
    name: '举手翻掌',
    subtitle: '站姿胸廓与上背舒展',
    image: 'actions/01_举手翻掌.jpg',
    type: 'hold',
    durationSeconds: 30,
    totalSeconds: 30,
    targetArea: '改善久坐伏案引起的双臂内旋与含胸姿态，展开胸廓。',
    steps: [
      '在工位旁站立，双脚与肩同宽站稳。',
      '双手十指交扣举过头顶，翻转掌心朝向天花板。',
      '手臂向上伸展，肩膀适度后展，腹部微收，避免塌腰。',
      '保持平稳呼吸 30 秒。'
    ],
    checkAndStop: '腋下与胸侧有舒展感。若肩关节前方出现刺痛或手麻，适当调低手臂高度或停止。',
    tips: '保持躯干直立，不要为了抬高手臂而过度挺肚子。'
  },
  {
    id: 'standing_arms_rotate',
    scenario: 'office_standing',
    name: '胳膊向后旋',
    subtitle: '站姿背部肌群激活',
    image: 'actions/02_胳膊后旋.jpg',
    type: 'hold',
    durationSeconds: 30,
    totalSeconds: 30,
    targetArea: '改善久坐含胸与肩前倾，激活上背肌群，改善背部姿态。',
    steps: [
      '在工位旁站立，挺胸收腹，双脚与肩同宽。',
      '双臂向两侧平举展开，与肩同高。',
      '双手握空拳，带动整条手臂向后旋转，带动肩部后展。',
      '感受双侧肩胛骨向脊柱收拢下沉，保持 30 秒。'
    ],
    checkAndStop: '肩胛骨之间有肌肉收紧感。避免耸肩或颈部前伸；若肩关节前方扯痛，减小旋转幅度。',
    tips: '双臂保持水平展开，注意不要耸肩。'
  },
  {
    id: 'standing_waist_stretch',
    scenario: 'office_standing',
    name: '扶腰后伸',
    subtitle: '站姿腰椎后伸减压',
    image: 'actions/09_扶腰后伸.jpg',
    type: 'rep_hold', // 节奏循环动作
    reps: 8,
    repSeconds: 5,
    restSeconds: 2,
    totalSeconds: 56,
    targetArea: '缓解长时间屈曲久坐带来的腰椎压力，平衡椎间盘负荷。',
    steps: [
      '双脚与肩同宽站立，膝关节微屈不锁死。',
      '双手叉腰，四指与手掌托在后腰骨盆上缘。',
      '以双手为支撑点，上身平缓向后仰伸，保持 5 秒。',
      '平缓回正站直，重复 8 次。'
    ],
    checkAndStop: '腰部平稳舒展。严禁快速晃动或强行后折；若出现尖锐刺痛或下肢麻木，立即停止。',
    tips: '双手牢固托住后腰，动作平缓温和。'
  },
  {
    id: 'standing_swallow_fly',
    scenario: 'office_standing',
    name: '站姿小燕飞',
    subtitle: '站姿后侧链综合舒展',
    image: 'actions/10_站姿小燕飞.jpg',
    type: 'rep_hold',
    reps: 8,
    repSeconds: 4,
    restSeconds: 2,
    totalSeconds: 48,
    targetArea: '激活背部与髋后侧肌群，改善前倾含胸，安全舒展脊柱。',
    steps: [
      '双脚与肩同宽站立踩稳，身体可微侧对镜头。',
      '双肩向后展开，双臂向身后斜下方伸展，掌心朝后。',
      '骨盆微前移，胸腔适度抬起，身体微向后延伸。',
      '保持 3 到 5 秒后平缓回正，重复 8 次。'
    ],
    checkAndStop: '背部与臀部有适度收缩感，胸前舒展。避免憋气或过度后仰；若腰部不适立即停止。',
    tips: '侧身面对镜头更利于检测，动作幅度适度，保持自然呼吸。'
  },
  {
    id: 'standing_cross_leg_side_bend',
    scenario: 'office_standing',
    name: '交叉腿叉腰侧屈',
    subtitle: '站姿单侧腰部拉伸',
    image: 'actions/14_交叉腿叉腰侧屈.jpg',
    type: 'bilateral',
    perSideSeconds: 25,
    totalSeconds: 50,
    targetArea: '缓解习惯性翘二郎腿或身体倾斜造成的单侧腰部肌群紧张。',
    steps: [
      '站立，一手叉腰，对侧腿交叉跨至斜后方，脚尖着地站稳。',
      '另一侧手屈肘轻放于耳侧。',
      '上身在侧向平面向叉腰侧侧屈，感受侧腰拉伸。',
      '保持 25 秒，平缓回正后换另一侧。'
    ],
    checkAndStop: '侧腰有适度拉伸感。身体不要前倾或后转；若腰部刺痛或下肢发麻，立即停止。',
    tips: '身体保持在纯侧面方向屈曲，不要扭转躯干。'
  },

  // ================= 居家办公 · 大动作 (全身运动，3 个大动作，镜头完全可见) =================
  {
    id: 'home_squats',
    scenario: 'home_active',
    name: '标准深蹲',
    subtitle: '下肢复合动作与循环激活',
    image: 'actions/15_标准深蹲.jpg',
    type: 'pose_counter', // AI 视觉姿态识别计数
    targetReps: 10,
    targetArea: '调动下肢大肌群与核心肌群，打破久坐静止状态，促进血液循环。',
    steps: [
      '站在镜头前 1.5 至 2.5 米处，确保双腿完全入镜。',
      '双脚略宽于肩，脚尖自然朝外，背部挺直。',
      '屈髋屈膝下蹲，膝盖朝向脚尖方向，蹲至有效深度。',
      '全脚掌蹬地站直，完成一次，重复 10 次。'
    ],
    checkAndStop: '下蹲时膝盖与脚尖方向一致，脚跟不离地。若膝关节刺痛，立即停止。',
    tips: '全脚掌踩实地面，躯干保持稳定。'
  },
  {
    id: 'home_jumping_jacks',
    scenario: 'home_active',
    name: '活力开合跳',
    subtitle: '全身有氧律动',
    image: 'actions/16_活力开合跳.jpg', // 并拢就位与跳跃张开两段式图解
    type: 'pose_counter', // AI 视觉开合跳计数
    targetReps: 15,
    targetArea: '调动全身大肌群，提升心率，缓解久坐困倦。',
    steps: [
      '退至镜头前 1.5 至 2 米处，双脚并拢站立，双臂自然下垂。',
      '跳起时双脚向两侧张开，同时双臂向外上方高举过头。',
      '再次跳起双脚并拢，双臂落下还原，计为 1 次。',
      '保持均匀呼吸与轻快节奏，连续完成 15 次。'
    ],
    checkAndStop: '落地时前脚掌先着地并屈膝缓冲。若膝或踝关节不适，可改为无跳跃的侧向点地开合。',
    tips: '保持节奏均匀，轻柔落地缓冲。'
  }
]);

export const { getActionsByScenario, getActionById, getRandomAction } = createActionCatalog(ACTIONS);
