// electron/main.cjs - Main process for IrriGIS Electron app
const { app, BrowserWindow, shell, ipcMain, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// --- SINGLE INSTANCE LOCK ---
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Second instance launched by OS for a deep link — quit so the primary handles it
  app.quit()
  return
} else {
  // Primary instance — listen for deep links from secondary instances (Windows/Linux)
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      // Chrome may pass either the custom protocol URL or the localhost redirect
      // URL as a CLI argument depending on how Windows resolves the deep link.
      const deepLink = commandLine.find(arg =>
        arg.startsWith('irrigis://') ||
        // Match http://localhost:<PORT>/oauth/callback?token=...
        /^https?:\/\/localhost:(\d+)\/oauth\/callback/.test(arg)
      )
      if (deepLink) {
        try {
          const u = new URL(deepLink)
          let token = u.searchParams.get('token') || ''
          let user  = u.searchParams.get('user')  || ''
          // When the URL came from Chrome's "Open IrriGIS Admin?" dialog, the
          // query string may be empty; fall back to the fragment query which
          // Chrome stores when it can't consume the full URL inline.
          if (!token && u.hash) {
            try {
              const frag = new URLSearchParams(u.hash.slice(1))
              token = frag.get('token') || token
              user  = frag.get('user')  || user
            } catch (_) {}
          }
          if (u.pathname.includes('/oauth/callback') && !mainWindow.isDestroyed() && token) {
            console.log('[main] Sending oauth-callback IPC, token:', token.substring(0,20)+'..., user:', user)
            mainWindow.webContents.send('oauth-callback', {
              token: token,
              user:  user,
              error: ''
            })
          } else {
            console.log('[main] Not sending IPC - conditions:', { hasToken: !!token, destroyed: mainWindow.isDestroyed(), pathMatch: u.pathname.includes('/oauth/callback') })
          }
        } catch (err) {
          console.warn('[OAuth] second-instance deep link parse error:', err.message)
        }
      } else {
        console.log('[main] No deep link found in command line')
      }
    }
  })
}

// macOS deep linking
app.on('open-url', (event, url) => {
  event.preventDefault()
  console.log('[main] macOS open-url:', url)
  try {
    const u = new URL(url)
    if (u.pathname.includes('/oauth/callback') && mainWindow && !mainWindow.isDestroyed()) {
      const token = u.searchParams.get('token') || ''
      const user = u.searchParams.get('user') || ''
      console.log('[main] macOS sending oauth-callback IPC, token:', token.substring(0,20)+'...')
      mainWindow.webContents.send('oauth-callback', {
        token: token,
        user:  user,
        error: u.searchParams.get('error') || ''
      })
    }
  } catch (_) {}
})
// -----------------------------

// Keep a global reference of the window object to prevent garbage collection
let mainWindow
let oauthCallbackPort = 0

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'IrriGIS Admin',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: !isDev,
      allowRunningInsecureContent: false
    },
    show: false, // Don't show until ready
    backgroundColor: '#1a1a2e'
  })

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // Open DevTools in development
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // In production, load from the dist folder
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()

    // Maximize window on first launch
    if (!mainWindow.isMaximized()) {
      mainWindow.maximize()
    }
  })

  // Handle links opened via window.open() or target="_blank"
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Force all popups to open in the system default browser so the
    // React app is never torn down by OAuth pages loading inside Electron
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Handle top-level navigations (e.g. clicking <a> tags)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url) return

    // Allow navigation only to our own React app
    const isInternal = url.startsWith('http://localhost:5173') || url.startsWith('file://')
    if (isInternal) return

    // Allow the irrigis:// protocol to flow through to protocol.handle below
    if (url.startsWith('irrigis://')) return

    // Everything else (Google, Render backend, API calls) opens in the
    // user's default browser — Electron app stays on the login screen
    event.preventDefault()
    shell.openExternal(url)
  })

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle window state
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', 'maximized')
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', 'unmaximized')
  })
}

// ---- OAuth callback local HTTP server ----
// Google redirects back to http://localhost:<OAUTH_CALLBACK_PORT>/oauth/callback?token=...
// The server extracts the token/user and sends IPC directly to the Electron main window.
function startOAuthCallbackServer(win) {
  // Default to 18765 so the app works perfectly without a .env file in production
  let port = 18765

  try {
    // Use environment-aware paths for packaged apps
    const envPath = isDev
      ? path.join(__dirname, '..', '.env')
      : path.join(process.resourcesPath, '.env')

    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8')
      for (const line of envContent.split('\n')) {
        const match = line.match(/^OAUTH_CALLBACK_PORT\s*=\s*(\d+)/)
        if (match) { port = parseInt(match[1], 10); break }
      }
      console.log('[OAuth] Loaded .env from', envPath, 'callback port:', port)
    } else {
      console.log('[OAuth] No .env found, using default callback port:', port)
    }
  } catch (error) {
    console.error('[OAuth] Failed to read .env:', error.message)
  }

  if (isNaN(port) || port <= 0) {
    console.log('[OAuth] Callback server disabled (port:', port, ')')
    return null
  }
  oauthCallbackPort = port

  // Load and cache the callback HTML — placeholders __ERR__, __TOKEN__, __USER__ are
  // replaced per-request with the OAuth data so every state (success / inactive / error)
  // renders correctly inside Chrome without the bridge-page trick.
  let html = ''
  try {
    html = fs.readFileSync(path.join(__dirname, 'oauth-callback.html'), 'utf-8')
  } catch (e) { console.warn('[OAuth] oauth-callback.html not found:', e.message) }

  // Fallback HTML that covers all 3 states (used if file is missing at build time)
  if (!html) {
    html =
      '<!DOCTYPE html><html lang="en"><head>' +
      '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>IrriGIS — Authentication</title>' +
      '<style>' +
      '*{box-sizing:border-box;margin:0;padding:0}' +
      'html,body{height:100%;font-family:sans-serif;background:#F0F7F7;display:flex;align-items:center;justify-content:center}' +
      '.card{background:#fff;border-radius:24px;padding:48px 40px;text-align:center;box-shadow:0 20px 40px rgba(90,140,140,.1);max-width:420px;width:100%}' +
      '.done .icon{font-size:48px;margin-bottom:16px}.done h1{font-size:22px;margin-bottom:8px}' +
      '.done p{font-size:14px;color:#4A6464}.done .prog{height:3px;background:#EBF4F4;border-radius:100px;margin:28px 0 8px;overflow:hidden}' +
      '.done .prog-bar{height:100%;background:#5A8C8C;animation:shrink 2s linear .5s both}' +
      '@keyframes shrink{from{width:100%}to{width:0%}}' +
      '.wait{font-size:12px;color:#7A9C9C}' +
      '.err .badge{display:inline-block;margin-top:12px;padding:4px 12px;border-radius:100px;font-size:12px;color:#C0544A;background:#FAEAE9;border:1px solid #F5C0BC}' +
      '.warn .badge{display:inline-block;margin-top:12px;padding:4px 12px;border-radius:100px;font-size:12px;color:#A07830;background:#FDF5E8;border:1px solid #E8C87A}' +
      '.btn{margin-top:24px;padding:10px 22px;border-radius:10px;font-size:14px;border:none;cursor:pointer}' +
      '.btn.pri{background:#5A8C8C;color:#fff}' +
      '.btn.ghost{background:#EBF4F4;color:#3E6464}' +
      '.fn{margin-top:32px;font-size:11px;color:#7A9C9C;letter-spacing:.06em}' +
      '</style></head><body>' +
      '<div class="card"><div id="root"></div></div>' +
      '<script>var ERR=__ERR__,TOK=__TOKEN__,USR=__USER__;' +
      'if(!TOK&&!ERR){var p=new URLSearchParams(location.search);TOK=p.get("token")||"";USR=p.get("user")||"";ERR=p.get("error")||""}' +
      // If no error param but user says is_active=false, synthesize an error
      'if(!ERR&&USR){try{var u=JSON.parse(USR);if(u&&u.is_active===false)ERR="user not active"}catch(e){}}' +
      'if(!TOK&&!ERR){document.getElementById("root").innerHTML=\'<p style="color:#7A9C9C">Waiting for authentication…</p>\';var p2=new URLSearchParams(location.search);TOK=p2.get("token")||"";USR=p2.get("user")||"";ERR=p2.get("error")||"";if(!TOK&&!ERR&&((new Date())-+new Date)>5000)ERR="No authentication data received."}' +
      'if(ERR){' +
        'var r=document.getElementById("root");var e=ERR.toLowerCase();' +
        'if(e.indexOf("not active")>-1||e.indexOf("inactive")>-1||e.indexOf("is_active")>-1)' +
          'r.innerHTML=\'<p style="font-size:38px;margin-bottom:16px">⚠️</p><h1 style="font-size:22px;margin-bottom:8px;color:#A07830">Account inactive</h1>' +
          '<p style="font-size:14px;color:#4A6464;margin-bottom:12px">Your account is pending activation. Contact your NIA administrator.</p>' +
          '<span class="badge">is_active · false</span> ' +
          '<button class="btn ghost" onclick="window.close()" style="margin-top:24px">Close</button>\';' +
        'else if(e.indexOf("access denied")>-1||e.indexOf("not authorized")>-1)' +
          'r.innerHTML=\'<p style="font-size:38px;margin-bottom:16px">⛔</p><h1 style="font-size:22px;margin-bottom:8px;color:#C0544A">Access denied</h1>' +
          '<p style="font-size:14px;color:#4A6464;margin-bottom:12px">This account is not authorized for IrriGIS Admin.</p>' +
          '<span class="badge">'+ERR.replace(/"/g,"&quot;").substring(0,40)+'</span> ' +
          '<button class="btn pri" onclick="window.close()" style="margin-top:24px">Try again</button>\';' +
        'else' +
          'r.innerHTML=\'<p style="font-size:38px;margin-bottom:16px">❌</p><h1 style="font-size:22px;margin-bottom:8px">Authentication failed</h1>' +
          '<p style="font-size:14px;color:#4A6464;margin-bottom:12px">'+ERR.replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;").substring(0,120)+'</p>' +
          '<button class="btn pri" onclick="window.close()" style="margin-top:24px">Close</button>\';' +
      '}' +
      'else if(TOK){' +
        'document.getElementById("root").innerHTML=\'<div class="done"><div class="icon">✅</div><h1>You\'re signed in</h1><p>Close this tab — IrriGIS Admin is ready.</p></div>' +
        '<div class="prog"><div class="prog-bar"></div></div><p class="wait">Closing this tab…</p>\';' +
        'try{window.opener.postMessage({irrigationOAuth:true,token:TOK,user:USR},"*")}catch(er){}' +
        'window.open("irrigis://oauth/callback?token="+encodeURIComponent(TOK)+"&user="+encodeURIComponent(USR),"_blank");' +
        'setTimeout(function(){try{window.close()}catch(_){}},2600)}' +
      '</script></body></html>'
  }

  console.log('[OAuth] Callback server on http://127.0.0.1:' + port)

  // HTML-safe encoding (escapes & < > " ' for attribute contexts)
  const escapeHtml = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/oauth/callback')) {
      const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`)
      const token = reqUrl.searchParams.get('token') || ''
      const user  = reqUrl.searchParams.get('user')  || ''
      const error = reqUrl.searchParams.get('error') || ''

      console.log('[OAuth] Callback server received:', { token: token.substring(0,20)+'...', user: user.substring(0,30)+'...', error })

      // Direct IPC relay — no deep link, no bridge page, no Chrome blocking
      if (win && !win.isDestroyed() && token) {
        win.webContents.send('oauth-callback', { token, user, error })
        console.log('[OAuth] Sent IPC to main window')
        win.focus()
        if (win.isMinimized()) win.restore()
      }

      // Inject OAuth data into cached HTML via placeholder replacement
      // escapeHtml prevents XSS / attribute-break if user strings contain < > &
      const page = html
        .replace(/__ERR__/g,   escapeHtml(error))
        .replace(/__USER__/g,  escapeHtml(user))
        .replace(/__TOKEN__/g, escapeHtml(token))

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      res.end(page)
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  })
  server.on('error', err => console.error('[OAuth] Callback server error:', err.message))
  server.listen(port, '127.0.0.1', () => {})
  return server
}

// ---- Custom protocol handler for irrigis://oauth/callback ----
// protocol.handle fires when the OS delivers a navigated irrigis:// URL
// (or the callback bridge page redirects to it) — this is independent of
// will-navigate because navigations can be cancelled after protocol fires.
function setupOAuthProtocol() {
  if (protocol && protocol.handle) {
    try {
      protocol.handle('irrigis://', (req) => {
        try {
          const u = new URL(req.url)
          console.log('[main] Protocol handler received:', req.url)
          if (u.pathname === '/oauth/callback' && mainWindow && !mainWindow.isDestroyed()) {
            const token = u.searchParams.get('token') || ''
            const user = u.searchParams.get('user') || ''
            console.log('[main] Protocol sending oauth-callback IPC, token:', token.substring(0,20)+'...')
            mainWindow.webContents.send('oauth-callback', {
              token: token,
              user:  user,
              error: u.searchParams.get('error') || ''
            })
          } else {
            console.log('[main] Protocol handler not matching - path:', u.pathname, 'hasMain:', !!mainWindow)
          }
        } catch (_) { /* malformed */ }
        return new Response('', { status: 200 })
      })
      console.log('[OAuth] irrigis:// protocol handler registered')
    } catch (err) {
      console.warn('[OAuth] Failed to register irrigis:// protocol:', err.message)
    }
  }
}

// ---- app lifecycle ----
app.whenReady().then(() => {
  // Register irrigis:// as the default client for this protocol (OS-level, single registration)
  if (!isDev) {
    try { app.setAsDefaultProtocolClient('irrigis') } catch { /* already registered */ }
  }

  setupOAuthProtocol()

  // Start local OAuth callback server
  createWindow()
  const cbServer = startOAuthCallbackServer(mainWindow)
  if (cbServer) {
    console.log('[OAuth] Local callback server ready on port', oauthCallbackPort)
  }

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---- IPC handlers for renderer process communication ----

// Get app version
ipcMain.handle('app:get-version', () => app.getVersion())

// Get platform info
ipcMain.handle('app:get-platform', () => process.platform)

// Check if running in development
ipcMain.handle('app:is-dev', () => isDev)

// Open external URL in default browser
ipcMain.handle('shell:open-external', async (event, url) => {
  await shell.openExternal(url)
})

// Read environment variables from .env file (for production builds)
ipcMain.handle('env:get-var', (event, key, defaultValue = '') => {
  try {
    // First check process.env
    if (process.env[key]) return process.env[key]
    // Then try to read from .env file
    const envPath = isDev
      ? path.join(__dirname, '../.env')
      : path.join(process.resourcesPath, '.env')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8')
      for (const line of envContent.split('\n')) {
        const [envKey, ...envValue] = line.split('=')
        if (envKey.trim() === key) return envValue.join('=').trim()
      }
    }
    return defaultValue
  } catch (error) {
    console.error('Error reading env var:', error)
    return defaultValue
  }
})

// Security: Prevent new window creation from renderer
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault()
    shell.openExternal(navigationUrl)
  })
})
