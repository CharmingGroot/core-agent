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
    show: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1a1a2e',
  });

  registerIpcHandlers(window);

  const htmlPath = join(__dirname, '..', 'renderer', 'index.html');
  void window.loadFile(htmlPath);

  window.webContents.openDevTools();

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
}).catch((error) => {
  console.error('[main] Failed to initialize app:', error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
