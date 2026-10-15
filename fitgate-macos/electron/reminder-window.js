// Cover the complete display, including its menu bar and Dock.
export function reminderBounds(bounds) {
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}
export function reminderWindowOptions(bounds) {
  return {
    ...reminderBounds(bounds),
    frame: false, transparent: false, backgroundColor: '#f7f8fa',
    hasShadow: false, roundedCorners: false, resizable: false, movable: false,
    maximizable: false, minimizable: false, fullscreenable: false,
    enableLargerThanScreen: true, acceptFirstMouse: true,
    alwaysOnTop: true, skipTaskbar: true, title: 'FitGate · 活动提醒'
  };
}

