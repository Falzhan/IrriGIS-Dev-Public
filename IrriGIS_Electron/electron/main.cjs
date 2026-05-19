const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Keep a global reference of the window object to prevent garbage collection
let mainWindow

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

  // Handle external links - open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow OAuth redirects and API calls
    if (url.startsWith('http://localhost:3000') || 
        url.includes('/api/auth/') ||
        url.includes('google') || 
        url.includes('facebook')) {
      return { action: 'allow' }
    }
    // External URLs open in default browser
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Handle external link clicks
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow internal navigation and API calls
    if (url.startsWith('http://localhost:5173') || 
        url.startsWith('http://localhost:3000') ||
        url.includes('/api/')) {
      return
    }
    // Block external navigation, open in browser instead
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

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow()

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC handlers for renderer process communication

// Get app version
ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

// Get platform info
ipcMain.handle('app:get-platform', () => {
  return process.platform
})

// Check if running in development
ipcMain.handle('app:is-dev', () => {
  return isDev
})

// Open external URL in default browser
ipcMain.handle('shell:open-external', async (event, url) => {
  await shell.openExternal(url)
})

// Read environment variables from .env file (for production builds)
ipcMain.handle('env:get-var', (event, key, defaultValue = '') => {
  try {
    // First check process.env
    if (process.env[key]) {
      return process.env[key]
    }
    
    // Then try to read from .env file
    const envPath = isDev 
      ? path.join(__dirname, '../.env')
      : path.join(process.resourcesPath, '.env')
    
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8')
      const envLines = envContent.split('\n')
      
      for (const line of envLines) {
        const [envKey, ...envValue] = line.split('=')
        if (envKey.trim() === key) {
          return envValue.join('=').trim()
        }
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
