import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { registerIpcHandlers, removeIpcHandlers } from './ipc-handlers.js';

const WINDOW_CONFIG = {
  width: 1000,
  height: 700,
  minWidth: 600,
  minHeight: 400,
} as const;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...WINDOW_CONFIG,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
  });

  registerIpcHandlers(window);

  const htmlPath = join(__dirname, '..', 'renderer', 'index.html');
  window.loadFile(htmlPath);

  window.on('closed', () => {
    removeIpcHandlers();
  });

  return window;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
