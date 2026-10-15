const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fitgate', {
  status: () => ipcRenderer.invoke('status'),
  settings: patch => ipcRenderer.invoke('settings', patch),
  openWorkout: () => ipcRenderer.invoke('open-workout'),
  snooze: () => ipcRenderer.invoke('snooze'),
  previewReminder: () => ipcRenderer.invoke('preview-reminder'),
  closePreview: () => ipcRenderer.invoke('close-preview'),
  exportData: () => ipcRenderer.invoke('export-data'),
  cameraPrivacy: () => ipcRenderer.invoke('camera-privacy'),
  automationPrivacy: () => ipcRenderer.invoke('automation-privacy'),
  message: message => ipcRenderer.invoke('workout-message', message),
  storageGet: keys => ipcRenderer.invoke('storage-get', keys),
  storageSet: values => ipcRenderer.invoke('storage-set', values),
  onSuspend: callback => {
    const listener = () => callback();
    ipcRenderer.on('workout-suspended', listener);
    return () => ipcRenderer.removeListener('workout-suspended', listener);
  },
  onStatus: callback => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('status-changed', listener);
    return () => ipcRenderer.removeListener('status-changed', listener);
  }
});
