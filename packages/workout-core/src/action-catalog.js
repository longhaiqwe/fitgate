// Bind common lookup rules to a platform-specific action catalog.
export function createActionCatalog(ACTIONS) {
  function getActionsByScenario(scenarioKey) {
    if (scenarioKey === 'office_seated') {
      return ACTIONS.filter((action) => action.scenario === 'office_seated');
    }
    if (scenarioKey === 'office_standing') {
      return ACTIONS.filter((action) => action.scenario === 'office_seated' || action.scenario === 'office_standing');
    }
    // 居家办公 (home_active) 或历史遗留 'all' / 未知场景均返回全量动作
    return [...ACTIONS];
  }

  /**
   * 根据 ID 获取指定动作
   */
  function getActionById(actionId) {
    // 兼容老 ID 'seated_side_head'
    if (actionId === 'seated_side_head') {
      return ACTIONS.find((a) => a.id === 'seated_behind_neck') || ACTIONS[0];
    }
    return ACTIONS.find((action) => action.id === actionId) || ACTIONS[0];
  }

  /**
   * 根据场景随机抽取一个动作
   */
  function getRandomAction(scenarioKey) {
    const list = getActionsByScenario(scenarioKey);
    if (!list.length) return ACTIONS[0];
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }
  return { getActionsByScenario, getActionById, getRandomAction };
}
