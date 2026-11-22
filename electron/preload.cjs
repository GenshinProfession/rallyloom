const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rallyloom', {
  window: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
  },
  workspace: {
    binding: () => ipcRenderer.invoke('workspace:binding'),
    discover: (address) => ipcRenderer.invoke('workspace:discover', address),
    signIn: () => ipcRenderer.invoke('workspace:signin'),
    callback: (url) => ipcRenderer.invoke('workspace:callback', url),
    resume: () => ipcRenderer.invoke('workspace:resume'),
    manageMember: (memberId, action) => ipcRenderer.invoke('workspace:manageMember', memberId, action),
    saveRoleSettings: (values) => ipcRenderer.invoke('workspace:saveRoleSettings', values),
    saveOfficeLayout: (layout) => ipcRenderer.invoke('workspace:saveOfficeLayout', layout),
    saveRoomSlot: (roomId, enabled) => ipcRenderer.invoke('workspace:saveRoomSlot', roomId, enabled),
    oa: (method, path, body, tenant) => ipcRenderer.invoke('workspace:oa', method, path, body, tenant),
    slot: (roomId) => ipcRenderer.invoke('workspace:slot', roomId),
    cancel: () => ipcRenderer.invoke('workspace:cancel'),
    logout: () => ipcRenderer.invoke('workspace:logout'),
    forget: () => ipcRenderer.invoke('workspace:forget'),
  },
})
