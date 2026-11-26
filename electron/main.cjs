/* Rallyloom — Electron 主进程（CommonJS）
   深链 rallyloom://callback：系统浏览器回跳，主进程验证并完成企业授权。 */

const { app, BrowserWindow, ipcMain, session, shell } = require('electron')
const path = require('node:path')
const { appendFileSync, existsSync, statSync, writeFileSync } = require('node:fs')
const { registerWorkspaceAuth } = require('./workspace-auth.cjs')

// 隐藏的 <webview> 会播放 YouTube 背景音乐：起播不依赖窗口内的一次性手势
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-features', 'MediaSessionService')
// YouTube 会按 UA 判断播放器配置：Electron 默认 UA 会被拒（embed 报 153），
// 因此只给「办公室背景音乐」用的 webview 分区换标准 Chrome UA，主窗口保持 Electron UA。
const MEDIA_PARTITION = 'persist:rallyloom-media'
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const SNAPSHOT = process.env.RALLYLOOM_SNAPSHOT
const PROTO = 'rallyloom'

/** @type {BrowserWindow | null} */
let win = null
let receiveWorkspaceCallback
let deepLinkLogFile

/** 深链排障日志：写 userData/rallyloom-deeplink.log（可用 RALLYLOOM_DEEPLINK_LOG=0 关闭）。 */
function deepLinkLog(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log('[deep-link]', message)
  if (process.env.RALLYLOOM_DEEPLINK_LOG === '0') return
  try {
    deepLinkLogFile ??= path.join(app.getPath('userData'), 'rallyloom-deeplink.log')
    if (existsSync(deepLinkLogFile) && statSync(deepLinkLogFile).size > 256 * 1024) writeFileSync(deepLinkLogFile, '')
    appendFileSync(deepLinkLogFile, `${line}\n`)
  } catch {}
}

/** 只在收到当前登录请求的有效回跳时激活窗口。 */
function forwardDeepLink(argv, source = 'argv') {
  const url = (argv || []).find((a) => typeof a === 'string' && a.startsWith(`${PROTO}://`))
  if (!url) return
  const accepted = Boolean(win && receiveWorkspaceCallback?.(url))
  deepLinkLog(
    `source=${source} accepted=${accepted} window=${Boolean(win)} minimized=${Boolean(win?.isMinimized())}`,
  )
  if (!accepted || !win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  // Windows 会阻止后台进程抢焦点：短暂置顶把窗口抬到浏览器之上，再恢复原状
  try {
    const pinned = win.isAlwaysOnTop()
    win.setAlwaysOnTop(true)
    win.focus()
    app.focus({ steal: true })
    setTimeout(() => {
      try { if (!pinned && win && !win.isDestroyed()) win.setAlwaysOnTop(false) } catch {}
    }, 800)
  } catch {}
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // 深链二次拉起：交给已在运行的实例处理
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    deepLinkLog('second-instance')
    forwardDeepLink(argv, 'second-instance')
  })

  // macOS：协议回调经 open-url 事件送达（Windows/Linux 走 argv，见下）
  app.on('open-url', (event, url) => {
    event.preventDefault()
    forwardDeepLink([url], 'open-url')
  })

  app.whenReady().then(() => {
    // 注册深链协议（失败不阻塞主流程；打包后指向 Rallyloom.exe）
    try {
      const ok = process.defaultApp && process.argv.length >= 2
        ? app.setAsDefaultProtocolClient(PROTO, process.execPath, [path.resolve(process.argv[1])])
        : app.setAsDefaultProtocolClient(PROTO)
      deepLinkLog(`protocol-registered ok=${ok} defaultApp=${Boolean(process.defaultApp)} exec=${process.execPath}`)
    } catch (err) {
      deepLinkLog(`protocol-registration-failed ${err && err.message}`)
    }

    try {
      session.fromPartition(MEDIA_PARTITION).setUserAgent(CHROME_UA)
    } catch (err) {
      deepLinkLog(`media-session-setup-failed ${err && err.message}`)
    }

    ipcMain.handle('win:minimize', () => win && win.minimize())
    ipcMain.handle('win:toggleMaximize', () => {
      if (!win) return
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    })
    ipcMain.handle('win:close', () => win && win.close())
    receiveWorkspaceCallback = registerWorkspaceAuth(() => win, deepLinkLog)
    createWindow()

    // 冷启动即由深链拉起（argv 里带 rallyloom://callback?code=…）
    deepLinkLog('cold-start')
    forwardDeepLink(process.argv, 'cold-start')

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: Number(process.env.RALLYLOOM_W || 1440),
    height: Number(process.env.RALLYLOOM_H || 900),
    minWidth: 1180,
    minHeight: 740,
    frame: false,
    show: false,
    backgroundColor: '#f7f7f8',
    title: 'Rallyloom',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, '../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // 办公室 BGM：YouTube 曲目在 <webview> 里播放（file:// 页面里的 iframe 会被 YouTube 拒绝）
      webviewTag: true,
    },
  })

  win.once('ready-to-show', () => win && win.show())

  // 外部链接走系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (DEV_URL) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // —— 自动截图/自检（仅当设置 RALLYLOOM_SNAPSHOT 时启用）——
  if (SNAPSHOT) {
    const fs = require('node:fs')
    const errors = []
    win.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) errors.push(`[${level}] ${message}`)
    })
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const actionFile = process.env.RALLYLOOM_ACTION_FILE
          const action = actionFile
            ? require('node:fs').readFileSync(actionFile, 'utf8')
            : process.env.RALLYLOOM_ACTION
          if (action) {
            await win.webContents.executeJavaScript(action)
            await new Promise((r) => setTimeout(r, 500))
          }
          const img = await win.webContents.capturePage()
          fs.writeFileSync(SNAPSHOT, img.toPNG())
          const stats = await win.webContents.executeJavaScript(`(() => ({
            rooms: document.querySelectorAll('[data-room]').length,
            people: document.querySelectorAll('[data-person]').length,
            cards: document.querySelectorAll('[data-slot="card"], [class*="rounded-xl"]').length,
            textLen: document.body.innerText.length,
            title: document.title,
            fonts: getComputedStyle(document.body).fontFamily,
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            overflowY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
          }))()`)
          fs.writeFileSync(
            SNAPSHOT + '.json',
            JSON.stringify({ errors, stats, url: DEV_URL || 'file:dist/index.html' }, null, 2),
          )
          console.log('SNAPSHOT_OK', JSON.stringify({ errors, stats }))
        } catch (err) {
          console.error('SNAPSHOT_FAIL', err && err.message)
        } finally {
          app.quit()
        }
      }, 1600)
    })
  }
}

app.on('window-all-closed', () => {
  app.quit()
})
