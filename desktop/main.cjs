const { app, BaseWindow, WebContentsView, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const { URL } = require('node:url');

const WEB_URL = process.env.LIVESHARE_WEB_URL || 'http://localhost:3000';
const DEFAULT_URL = 'https://example.com';
let win;
let browserView;
let suppressNavigationBroadcast = false;

function validHttpUrl(value) {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}
function sendToControl(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }
function resizeBrowser() {
  if (!win || !browserView) return;
  const [width, height] = win.getContentSize();
  browserView.setBounds({ x: 0, y: 74, width, height: Math.max(1, height - 74) });
}
async function injectScrollBridge() {
  if (!browserView || browserView.webContents.isDestroyed()) return;
  try { await browserView.webContents.executeJavaScript(`(()=>{if(window.__liveshareInstalled)return;window.__liveshareInstalled=true;let last=0;addEventListener('scroll',()=>{const now=Date.now();if(now-last<120)return;last=now;window.postMessage({__liveshare:'scroll',x:scrollX,y:scrollY},'*')},{passive:true})})()`); } catch {}
}
function navigateBrowser(url, remote = false) {
  if (!validHttpUrl(url) || !browserView) return false;
  suppressNavigationBroadcast = remote;
  browserView.webContents.loadURL(url).catch(() => { suppressNavigationBroadcast = false; });
  return true;
}

function createWindow(roomId) {
  win = new BaseWindow({ width: 1400, height: 900, minWidth: 900, minHeight: 600, title: 'LiveShare' });
  const control = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  browserView = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true } });
  win.contentView.addChildView(control); win.contentView.addChildView(browserView);
  control.setBounds({ x: 0, y: 0, width: 1400, height: 74 }); resizeBrowser(); win.on('resize', resizeBrowser);

  const handlePopup = ({ url }) => { if (validHttpUrl(url)) shell.openExternal(url); return { action: 'deny' }; };
  control.webContents.setWindowOpenHandler(handlePopup); browserView.webContents.setWindowOpenHandler(handlePopup);
  browserView.webContents.on('will-navigate', (event, url) => { if (!validHttpUrl(url)) event.preventDefault(); });
  browserView.webContents.on('did-start-navigation', (_e, url, _inPlace, mainFrame) => { if (mainFrame && validHttpUrl(url)) sendToControl('browser:navigation-start', { url }); });
  browserView.webContents.on('did-navigate', (_e, url) => {
    if (!validHttpUrl(url)) return;
    const remote = suppressNavigationBroadcast;
    sendToControl('browser:navigation', { url, remote });
    if (!remote) sendToControl('browser:local-navigation', { url });
    suppressNavigationBroadcast = false;
    injectScrollBridge();
  });
  browserView.webContents.on('did-finish-load', injectScrollBridge);
  win.on('closed', () => { try { browserView.webContents.close(); } catch {} try { control.webContents.close(); } catch {} browserView = null; win = null; });
  control.webContents.loadURL(`${WEB_URL.replace(/\/$/, '')}/room/${encodeURIComponent(roomId)}?desktop=1`);
  browserView.webContents.loadURL(DEFAULT_URL);
}

ipcMain.handle('browser:navigate', (_e, url) => navigateBrowser(url, true));
ipcMain.handle('browser:go-back', () => browserView?.webContents.canGoBack() && browserView.webContents.goBack());
ipcMain.handle('browser:go-forward', () => browserView?.webContents.canGoForward() && browserView.webContents.goForward());
ipcMain.handle('browser:reload', () => browserView?.webContents.reload());
ipcMain.handle('browser:get-url', () => browserView?.webContents.getURL() || DEFAULT_URL);
ipcMain.handle('browser:scroll-to', (_e, p) => { const x=Number(p?.x), y=Number(p?.y); if(!Number.isFinite(x)||!Number.isFinite(y))return false; return browserView?.webContents.executeJavaScript(`scrollTo(${Math.max(0,x)},${Math.max(0,y)})`).then(()=>true).catch(()=>false); });
ipcMain.handle('browser:open-external', (_e, url) => validHttpUrl(url) ? shell.openExternal(url) : false);

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(['clipboard-read', 'clipboard-sanitized-write'].includes(permission)));
  const roomId = process.argv.find(a => a.startsWith('--room='))?.slice(7) || `desktop-${Date.now().toString(36)}`;
  createWindow(roomId);
  app.on('activate', () => { if (!win) createWindow(roomId); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
