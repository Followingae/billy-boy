// The only bridge between Billy's pages and the app. Pages get these calls and nothing else.
const { contextBridge, ipcRenderer } = require('electron')

const on = (channel) => (fn) => {
  const h = (_e, v) => fn(v)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

contextBridge.exposeInMainWorld('billy', {
  // billy window
  hit: (over) => ipcRenderer.send('hit', over),
  dragStart: (p) => ipcRenderer.send('drag-start', p),
  dragMove: (p) => ipcRenderer.send('drag-move', p),
  dragEnd: () => ipcRenderer.send('drag-end'),
  toggleTuck: () => ipcRenderer.send('toggle-tuck'),
  menu: (uid) => ipcRenderer.send('menu', uid),
  setIcon: (dataUrl) => ipcRenderer.send('set-icon', dataUrl),
  pin: (uid) => ipcRenderer.send('pin', uid),
  openCard: (uid) => ipcRenderer.send('open-card', uid),
  closeCard: () => ipcRenderer.send('close-card'),
  openRoom: (section) => ipcRenderer.send('open-room', section),
  volume: (cmd) => ipcRenderer.invoke('volume', cmd),
  onState: on('state'), onDock: on('dock'), onNear: on('near'), onCardOpen: on('card-open'), onNudge: on('nudge'), onDemoOpen: on('demo-open'),

  // card
  onCard: on('card'),
  cardSize: (h) => ipcRenderer.send('card-size', h),
  openUrl: (u) => ipcRenderer.send('open-url', u),
  openPath: (p) => ipcRenderer.send('open-path', p),
  act: (uid, id) => ipcRenderer.invoke('act', uid, id),

  // room
  roomState: () => ipcRenderer.invoke('room-state'),
  onRoomState: on('room-state'), onRoomSection: on('room-section'),
  faceAdd: (type, kind) => ipcRenderer.invoke('face-add', type, kind),
  faceRemove: (uid) => ipcRenderer.invoke('face-remove', uid),
  faceUpdate: (uid, patch) => ipcRenderer.invoke('face-update', uid, patch),
  faceOrder: (uids) => ipcRenderer.invoke('face-order', uids),
  fieldsGet: (uid) => ipcRenderer.invoke('fields-get', uid),
  fieldsSave: (uid, v) => ipcRenderer.invoke('fields-save', uid, v),
  faceConnect: (uid) => ipcRenderer.invoke('face-connect', uid),
  faceTest: (uid) => ipcRenderer.invoke('face-test', uid),
  settingsSet: (p) => ipcRenderer.invoke('settings-set', p),
  pickFile: () => ipcRenderer.invoke('pick-file'),
  installKit: (uid, t) => ipcRenderer.invoke('install-kit', uid, t),
  outreachGet: (uid) => ipcRenderer.invoke('outreach-setup-get', uid),
  outreachSave: (uid, v) => ipcRenderer.invoke('outreach-setup-save', uid, v),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openFolder: (p) => ipcRenderer.send('open-folder', p),
  copyText: (t) => ipcRenderer.send('copy-text', t),
  openPlugins: () => ipcRenderer.send('open-plugins'),
  reloadPlugins: () => ipcRenderer.send('reload-plugins'),
  roomClose: () => ipcRenderer.send('room-close'),
  roomMin: () => ipcRenderer.send('room-min'),
})
