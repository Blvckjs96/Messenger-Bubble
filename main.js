const { app, BrowserWindow, shell, Menu, session, dialog, net, ipcMain, screen, globalShortcut, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { UnreadTracker, formatBadge } = require('./lib/badge');
const { NotificationDeduper } = require('./lib/notify-dedupe');
const { snapToEdge, isInHideZone, panelBounds, ensureOnScreen, clampToArea } = require('./lib/geometry');

const CURRENT_VERSION = app.getVersion();
const GITHUB_REPO = getGithubRepo();

const BUBBLE_SIZE = 60;
const FULL_SIZE = { width: 1200, height: 800 };
const MINI_SIZE = { width: 360, height: 520 };
// If the title has not been readable for this long, stop trusting the last number
const TITLE_STALE_MS = 30000;
const SHORTCUT_CHOICES = [
  { label: 'Cmd + Shift + Space', accelerator: 'CommandOrControl+Shift+Space' },
  { label: 'Ctrl + Option + Space', accelerator: 'Control+Alt+Space' },
  { label: 'Cmd + Shift + M', accelerator: 'CommandOrControl+Shift+M' },
  { label: 'Off', accelerator: '' }
];

// Set app data path explicitly
app.setPath('userData', path.join(app.getPath('appData'), 'Messenger-Bubble'));

// One Messenger session only: a second launch focuses the running app
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  app.quit();
}

let mainWindow;
let bubbleWindow;

// 'hidden' (bubble only) | 'mini' (quick panel next to the bubble) | 'full'
let mode = 'hidden';
let isQuitting = false;
let loggedIn = false;
let mainFullScreen = false;
let bubbleTempHidden = false;
let dragStartPosition = null;
let compactCssKey = null;
let zoomBeforeMini = null;
let shortcutError = null;
let lastTitleParsedAt = Date.now();

const unread = new UnreadTracker();
const deduper = new NotificationDeduper({ windowMs: 5000 });
const nativeNotifications = new Map();

// Settings file path
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const bubbleLogPath = path.join(app.getPath('userData'), 'bubble.log');

const DEFAULT_SETTINGS = {
  sidebarVisible: true,
  hasSeenWelcome: false,
  bubbleEnabled: true,
  shortcut: 'CommandOrControl+Shift+Space',
  showBadgeCount: true,
  notificationSound: true,
  notificationsMuted: false,
  hideBubbleWhenSharing: false,
  collapseOnBlur: false,
  rememberPositions: true,
  bubblePosition: null,
  fullBounds: null,
  miniSize: null
};

function getGithubRepo() {
  try {
    const pkg = require('./package.json');
    const url = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository && pkg.repository.url);
    const match = url && url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

function bubbleLog(msg) {
  try {
    fs.appendFileSync(bubbleLogPath, `${new Date().toISOString()} - ${msg}\n`);
  } catch (e) {}
}

// Load settings
function loadSettings() {
  let stored = {};
  try {
    if (fs.existsSync(settingsPath)) {
      stored = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) {}
  // Usage-tracking fields from upstream are no longer used
  delete stored.installId;
  delete stored.lastPingDate;
  delete stored.countedAsUser;
  return { ...DEFAULT_SETTINGS, ...stored };
}

// Save settings
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {}
}

let settings = loadSettings();

let saveTimer = null;
function saveSettingsSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings(settings), 500);
}

// Check for updates on the fork's GitHub releases (no usage tracking)
function checkForUpdates(silent = false) {
  if (!GITHUB_REPO) {
    if (!silent) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Updates',
        message: 'Update check is not configured.',
        detail: 'Add your GitHub repository to package.json to enable it.'
      });
    }
    return;
  }

  const request = net.request({
    method: 'GET',
    url: `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
  });

  request.setHeader('User-Agent', `Messenger-Bubble/${CURRENT_VERSION}`);

  request.on('response', (response) => {
    let data = '';
    response.on('data', (chunk) => { data += chunk; });
    response.on('end', () => {
      try {
        const release = JSON.parse(data);
        const latestVersion = release.tag_name.replace('v', '');

        if (latestVersion !== CURRENT_VERSION) {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `A new version (v${latestVersion}) is available!`,
            detail: `You have v${CURRENT_VERSION}. Would you like to download the update?`,
            buttons: ['Download', 'Later'],
            defaultId: 0
          }).then(({ response }) => {
            if (response === 0) {
              shell.openExternal(release.html_url);
            }
          });
        } else if (!silent) {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'No Updates',
            message: 'You\'re up to date!',
            detail: `Version ${CURRENT_VERSION} is the latest.`
          });
        }
      } catch (e) {}
    });
  });

  request.on('error', () => {});
  request.end();
}

// Show welcome window on first launch
let welcomeWindow = null;
function showWelcomeWindow() {
  if (welcomeWindow) {
    welcomeWindow.focus();
    return;
  }
  welcomeWindow = new BrowserWindow({
    width: 460,
    height: 720,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  welcomeWindow.loadFile(path.join(__dirname, 'ui', 'welcome.html'), {
    query: { shortcut: settings.shortcut || '' }
  });
  // Fit the window to its content before showing it
  welcomeWindow.once('ready-to-show', async () => {
    try {
      const height = await welcomeWindow.webContents.executeJavaScript('document.documentElement.scrollHeight');
      const { workArea } = screen.getDisplayMatching(welcomeWindow.getBounds());
      welcomeWindow.setContentSize(460, Math.min(Math.ceil(height), workArea.height - 40));
      welcomeWindow.center();
    } catch (e) {}
    welcomeWindow.show();
  });

  welcomeWindow.on('closed', () => {
    welcomeWindow = null;
    settings.hasSeenWelcome = true;
    saveSettings(settings);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: FULL_SIZE.width,
    height: FULL_SIZE.height,
    minWidth: 400,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Log file path
  const logFile = path.join(app.getPath('userData'), 'cookies.log');
  const log = (msg) => {
    const line = `${new Date().toISOString()} - ${msg}\n`;
    fs.appendFileSync(logFile, line);
  };

  // Convert session cookies to persistent cookies
  session.defaultSession.cookies.on('changed', (event, cookie, cause, removed) => {
    const isFacebookDomain = cookie.domain.includes('facebook.com') || cookie.domain.includes('messenger.com');
    log(`Cookie: ${cookie.name} | domain: ${cookie.domain} | session: ${cookie.session} | removed: ${removed}`);

    if (cookie.name === 'c_user' && isFacebookDomain) {
      refreshLoginState();
    }

    if (!removed && cookie.session && isFacebookDomain) {
      // Make session cookie persistent (expire in 1 year)
      const persistentCookie = {
        url: `https://${cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite || 'no_restriction',
        expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
      };
      log(`Converting to persistent: ${cookie.name}`);
      session.defaultSession.cookies.set(persistentCookie).catch(err => log(`Cookie error: ${err}`));
    }
  });

  // Load Facebook Messenger
  mainWindow.loadURL('https://www.messenger.com');

  // Apply sidebar state when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => applySidebarState(), 1000);
    // A reload drops inserted CSS, so re-apply compact mode
    compactCssKey = null;
    if (mode === 'mini') applyCompact(true);
    refreshLoginState();
  });

  mainWindow.webContents.on('did-navigate', () => refreshLoginState());

  // Power saving: throttle when window is hidden/minimized/unfocused
  mainWindow.on('blur', () => {
    mainWindow.webContents.setBackgroundThrottling(true);
    if (mode === 'mini' && settings.collapseOnBlur) {
      // Let a click on the bubble or a context menu settle first
      setTimeout(() => {
        if (mainWindow && mode === 'mini' && !mainWindow.isFocused()) hideMain();
      }, 150);
    }
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.setBackgroundThrottling(false);
    // The user is looking at Messenger now: a "count unknown" dot has been seen
    if (unread.updateFromTitle(mainWindow.webContents.getTitle())) refreshBadges();
  });

  mainWindow.on('minimize', () => {
    mainWindow.webContents.setBackgroundThrottling(true);
  });

  mainWindow.on('restore', () => {
    mainWindow.webContents.setBackgroundThrottling(false);
  });

  // Esc in the quick panel collapses back to the bubble.
  // The key still reaches Messenger so it can close its own popovers.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (mode === 'mini' && input.type === 'keyDown' && input.key === 'Escape' &&
        !input.meta && !input.control && !input.alt && !input.shift) {
      hideMain();
    }
  });

  mainWindow.on('enter-full-screen', () => {
    mainFullScreen = true;
    updateBubbleVisibility();
  });

  mainWindow.on('leave-full-screen', () => {
    mainFullScreen = false;
    updateBubbleVisibility();
  });

  mainWindow.on('resized', () => rememberWindowSize());
  mainWindow.on('moved', () => rememberWindowSize());

  // Check if URL is a Messenger/Facebook redirect link and extract real URL
  function getExternalUrl(url) {
    try {
      const parsed = new URL(url);
      // Handle l.messenger.com and l.facebook.com redirect links
      if (parsed.hostname === 'l.messenger.com' || parsed.hostname === 'l.facebook.com') {
        const realUrl = parsed.searchParams.get('u');
        if (realUrl) return realUrl;
      }
    } catch (e) {}
    return null;
  }

  // Check if URL should stay in app
  function isInternalUrl(url) {
    return url.includes('messenger.com') && !url.includes('l.messenger.com');
  }

  // Handle external links - open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const externalUrl = getExternalUrl(url);
    if (externalUrl) {
      shell.openExternal(externalUrl);
      return { action: 'deny' };
    }
    if (!isInternalUrl(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Handle navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const externalUrl = getExternalUrl(url);
    if (externalUrl) {
      event.preventDefault();
      shell.openExternal(externalUrl);
      return;
    }
    if (!isInternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Closing only hides the window so the chat, scroll position and drafts survive.
  // Cmd+Q quits for real.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideMain();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Floating bubble
// ---------------------------------------------------------------------------

function primaryWorkArea() {
  return screen.getPrimaryDisplay().workArea;
}

function defaultBubblePosition() {
  const saved = settings.rememberPositions ? settings.bubblePosition : null;
  return ensureOnScreen(saved, BUBBLE_SIZE, screen.getAllDisplays(), primaryWorkArea());
}

function createBubbleWindow() {
  const pos = defaultBubblePosition();
  bubbleWindow = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Clicking the bubble must not steal focus from the quick panel or other apps
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'bubble', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  bubbleWindow.setAlwaysOnTop(true, 'floating');
  applyBubblePrivacy();
  bubbleWindow.loadFile(path.join(__dirname, 'bubble', 'bubble.html'));
  bubbleWindow.webContents.on('did-finish-load', () => refreshBadges());

  bubbleWindow.on('closed', () => {
    bubbleWindow = null;
  });
}

// Follow the user across Spaces. With the privacy option on, the bubble stays
// out of other apps' full-screen Spaces and out of screen recordings / screen sharing.
function applyBubblePrivacy() {
  if (!bubbleWindow) return;
  bubbleWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: !settings.hideBubbleWhenSharing,
    skipTransformProcessType: true
  });
  bubbleWindow.setContentProtection(!!settings.hideBubbleWhenSharing);
}

function shouldShowBubble() {
  return settings.bubbleEnabled && loggedIn && !bubbleTempHidden && !mainFullScreen;
}

function updateBubbleVisibility() {
  if (!bubbleWindow) return;
  if (shouldShowBubble()) {
    if (!bubbleWindow.isVisible()) bubbleWindow.showInactive();
  } else if (bubbleWindow.isVisible()) {
    bubbleWindow.hide();
  }
}

// Where the quick panel should anchor: the bubble, or where the bubble would be
function bubbleAnchor() {
  if (bubbleWindow) return bubbleWindow.getBounds();
  const pos = defaultBubblePosition();
  return { ...pos, width: BUBBLE_SIZE, height: BUBBLE_SIZE };
}

function saveBubblePosition() {
  if (!bubbleWindow || !settings.rememberPositions) return;
  const [x, y] = bubbleWindow.getPosition();
  settings.bubblePosition = { x, y };
  saveSettingsSoon();
}

function bringBubbleBack() {
  bubbleTempHidden = false;
  updateBubbleVisibility();
  createMenu();
}

function hideBubbleTemporarily() {
  bubbleTempHidden = true;
  if (mode === 'mini') hideMain();
  updateBubbleVisibility();
  createMenu();
}

ipcMain.on('bubble:move', (event, pos) => {
  if (!bubbleWindow || event.sender !== bubbleWindow.webContents) return;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
  if (!dragStartPosition) dragStartPosition = bubbleWindow.getPosition();
  const x = Math.round(pos.x);
  const y = Math.round(pos.y);
  bubbleWindow.setBounds({ x, y, width: BUBBLE_SIZE, height: BUBBLE_SIZE });
  const { workArea } = screen.getDisplayNearestPoint({ x: x + BUBBLE_SIZE / 2, y: y + BUBBLE_SIZE / 2 });
  bubbleWindow.webContents.send('bubble:hide-zone', isInHideZone({ x, y, width: BUBBLE_SIZE, height: BUBBLE_SIZE }, workArea));
});

ipcMain.on('bubble:drag-end', (event) => {
  if (!bubbleWindow || event.sender !== bubbleWindow.webContents) return;
  const bounds = bubbleWindow.getBounds();
  const { workArea } = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  bubbleWindow.webContents.send('bubble:hide-zone', false);

  if (isInHideZone(bounds, workArea)) {
    // Put it back where the drag started so it reappears in a sensible place
    if (dragStartPosition) {
      bubbleWindow.setBounds({ x: dragStartPosition[0], y: dragStartPosition[1], width: BUBBLE_SIZE, height: BUBBLE_SIZE });
    }
    dragStartPosition = null;
    hideBubbleTemporarily();
    return;
  }

  dragStartPosition = null;
  bubbleWindow.setBounds(snapToEdge(bounds, workArea));
  saveBubblePosition();
  if (mode === 'mini' && mainWindow && mainWindow.isVisible()) placeMiniPanel();
});

ipcMain.on('bubble:click', (event) => {
  if (!bubbleWindow || event.sender !== bubbleWindow.webContents) return;
  timed('bubble click', () => {
    if (mode === 'mini' && mainWindow && mainWindow.isVisible()) hideMain();
    else showMini();
  });
});

ipcMain.on('bubble:context-menu', (event) => {
  if (!bubbleWindow || event.sender !== bubbleWindow.webContents) return;
  Menu.buildFromTemplate([
    { label: 'Open Quick Panel', click: () => showMini() },
    { label: 'Open Full Window', click: () => showFull() },
    { label: 'Hide Bubble', click: () => hideBubbleTemporarily() },
    { type: 'separator' },
    { label: 'Mute Notifications', type: 'checkbox', checked: settings.notificationsMuted, click: () => toggleSetting('notificationsMuted') },
    { type: 'separator' },
    { label: `Quit ${app.name}`, click: () => app.quit() }
  ]).popup({ window: bubbleWindow });
});

// ---------------------------------------------------------------------------
// Main window modes: hidden (bubble) / mini (quick panel) / full
// ---------------------------------------------------------------------------

function timed(label, fn) {
  const start = process.hrtime.bigint();
  fn();
  if (process.env.MESSENGER_BUBBLE_DEBUG) {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`[timing] ${label}: ${ms.toFixed(1)}ms`);
  }
}

function rememberWindowSize() {
  if (!mainWindow || !settings.rememberPositions) return;
  if (mode === 'full' && !mainWindow.isFullScreen() && !mainWindow.isMaximized()) {
    settings.fullBounds = mainWindow.getNormalBounds();
    saveSettingsSoon();
  } else if (mode === 'mini') {
    const { width, height } = mainWindow.getBounds();
    settings.miniSize = { width, height };
    saveSettingsSoon();
  }
}

// Compact layout for the quick panel: keep the chat and the composer, drop the extras
const COMPACT_CSS = `
  [aria-label="Inbox switcher"] { display: none !important; }
`;

function applyCompact(on) {
  if (!mainWindow) return;
  const contents = mainWindow.webContents;
  if (on && !compactCssKey) {
    contents.insertCSS(COMPACT_CSS).then(key => {
      if (mode === 'mini') compactCssKey = key;
      else contents.removeInsertedCSS(key).catch(() => {});
    }).catch(() => {});
    if (zoomBeforeMini === null) {
      zoomBeforeMini = contents.getZoomFactor();
      contents.setZoomFactor(Math.min(zoomBeforeMini, 0.9));
    }
  } else if (!on) {
    if (compactCssKey) {
      contents.removeInsertedCSS(compactCssKey).catch(() => {});
      compactCssKey = null;
    }
    if (zoomBeforeMini !== null) {
      contents.setZoomFactor(zoomBeforeMini);
      zoomBeforeMini = null;
    }
  }
}

function placeMiniPanel() {
  const anchor = bubbleAnchor();
  const { workArea } = screen.getDisplayNearestPoint({ x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 });
  const size = (settings.rememberPositions && settings.miniSize) || MINI_SIZE;
  mainWindow.setBounds(panelBounds(anchor, workArea, size));
}

function showMini() {
  if (!mainWindow) return;
  // Logging in needs the full page
  if (!loggedIn || mainWindow.isFullScreen()) return showFull();
  bringBubbleBackIfHidden();
  if (mode === 'full' && mainWindow.isVisible()) rememberWindowSize();
  mode = 'mini';
  mainWindow.setMinimumSize(300, 400);
  // Show on whichever Space the user is on, above normal windows like the bubble
  mainWindow.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true });
  mainWindow.setAlwaysOnTop(true, 'floating');
  placeMiniPanel();
  applyCompact(true);
  mainWindow.show();
  mainWindow.focus();
  app.focus({ steal: true });
}

function fullWindowBounds() {
  const saved = settings.rememberPositions ? settings.fullBounds : null;
  if (saved) {
    const display = screen.getDisplayMatching(saved);
    return clampToArea({ ...saved, width: Math.min(saved.width, display.workArea.width), height: Math.min(saved.height, display.workArea.height) }, display.workArea);
  }
  const anchor = bubbleAnchor();
  const { workArea } = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
  const width = Math.min(FULL_SIZE.width, workArea.width);
  const height = Math.min(FULL_SIZE.height, workArea.height);
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height
  };
}

function showFull() {
  if (!mainWindow) return;
  const wasFull = mode === 'full';
  mode = 'full';
  applyCompact(false);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true });
  mainWindow.setMinimumSize(400, 600);
  if (!wasFull && !mainWindow.isFullScreen()) mainWindow.setBounds(fullWindowBounds());
  mainWindow.show();
  mainWindow.focus();
  app.focus({ steal: true });
}

// Hide, never destroy: Messenger stays loaded, so reopening is instant and drafts survive
function hideMain() {
  if (!mainWindow) return;
  if (mainWindow.isFullScreen()) {
    mainWindow.once('leave-full-screen', () => hideMain());
    mainWindow.setFullScreen(false);
    return;
  }
  rememberWindowSize();
  mainWindow.hide();
  if (mode === 'mini') applyCompact(false);
  mode = 'hidden';
}

function bringBubbleBackIfHidden() {
  if (bubbleTempHidden) bringBubbleBack();
}

function toggleFromShortcut() {
  if (!mainWindow) return;
  timed('shortcut', () => {
    if (mainWindow.isVisible() && mainWindow.isFocused()) hideMain();
    else if (mode === 'full' && mainWindow.isVisible()) showFull();
    else showMini();
  });
}

function registerShortcut() {
  globalShortcut.unregisterAll();
  shortcutError = null;
  if (!settings.shortcut) return;
  let ok = false;
  try {
    ok = globalShortcut.register(settings.shortcut, toggleFromShortcut);
  } catch (e) {}
  if (!ok) {
    shortcutError = settings.shortcut;
    bubbleLog(`Could not register global shortcut ${settings.shortcut} (used by another app?)`);
  }
}

// ---------------------------------------------------------------------------
// Login state, unread count and notifications
// ---------------------------------------------------------------------------

async function refreshLoginState() {
  let nowLoggedIn = false;
  try {
    const cookies = await session.defaultSession.cookies.get({ name: 'c_user' });
    nowLoggedIn = cookies.some(c => c.domain.includes('messenger.com') || c.domain.includes('facebook.com'));
  } catch (e) {}
  if (mainWindow) {
    const url = mainWindow.webContents.getURL();
    if (/\/login|\/checkpoint/.test(url)) nowLoggedIn = false;
  }
  // Development only: exercise the bubble without signing in
  if (!app.isPackaged && process.env.MESSENGER_BUBBLE_ASSUME_LOGIN === '1') nowLoggedIn = true;
  if (nowLoggedIn === loggedIn) return;
  loggedIn = nowLoggedIn;
  if (!loggedIn) {
    // Logged out: no bubble, no badge, no stale notifications
    unread.reset();
    deduper.clear();
    closeAllNativeNotifications();
    if (mode === 'mini') showFull();
  }
  updateBubbleVisibility();
  refreshBadges();
}

function refreshBadges() {
  const value = loggedIn ? unread.badgeValue() : 0;
  const text = formatBadge(value, { showCount: settings.showBadgeCount });
  if (app.dock) app.dock.setBadge(text);
  if (bubbleWindow) bubbleWindow.webContents.send('bubble:badge', text);
}

function fromMainWindow(event) {
  return mainWindow && event.sender === mainWindow.webContents;
}

ipcMain.on('escape-pressed', (event) => {
  if (fromMainWindow(event) && mode === 'mini') hideMain();
});

ipcMain.on('unread-count', (event, title) => {
  if (!fromMainWindow(event)) return;
  // Titles during a (re)load or an offline error page are not trustworthy: keep the old badge
  if (mainWindow.webContents.isLoading()) return;
  if (unread.updateFromTitle(title)) {
    lastTitleParsedAt = Date.now();
    if (unread.badgeValue() === 0) {
      deduper.clear();
      closeAllNativeNotifications();
    }
  } else if (Date.now() - lastTitleParsedAt > TITLE_STALE_MS) {
    // Messenger's title format may have changed: show a dot, never a stale number
    bubbleLog(`Unread count unreadable from title: ${JSON.stringify(String(title).slice(0, 80))}`);
    unread.degrade();
  }
  refreshBadges();
});

function mainWindowIsActive() {
  return mainWindow && mainWindow.isVisible() && mainWindow.isFocused();
}

ipcMain.on('message-arrived', (event, data) => {
  if (!fromMainWindow(event) || !data) return;

  // The title normally follows within a moment; if it doesn't, show a dot instead of a number
  setTimeout(() => {
    if (!mainWindowIsActive() && unread.badgeValue() === 0) {
      unread.markPossibleUnread();
      refreshBadges();
    }
  }, 3000);

  bringBubbleBackIfHidden();

  if (settings.notificationsMuted || !Notification.isSupported()) return;
  // The user is already looking at Messenger
  if (mainWindowIsActive()) return;

  const key = data.tag || data.title;
  const decision = deduper.decide(key, data.body);
  if (decision.action === 'drop') return;

  const previous = nativeNotifications.get(key);
  if (previous) previous.notification.close();

  const notification = new Notification({
    title: data.title || app.name,
    body: decision.count > 1 ? `${decision.count} new messages · ${data.body}` : data.body,
    silent: !settings.notificationSound
  });
  notification.on('click', () => {
    showMini();
    // Let Messenger's own handler open the conversation
    if (data.id && mainWindow) {
      mainWindow.webContents.executeJavaScript(
        `window.__messengerBubbleNotificationClick && window.__messengerBubbleNotificationClick(${Number(data.id)})`
      ).catch(() => {});
    }
  });
  notification.on('close', () => {
    const current = nativeNotifications.get(key);
    if (current && current.notification === notification) nativeNotifications.delete(key);
  });
  nativeNotifications.set(key, { notification, id: data.id });
  notification.show();
});

ipcMain.on('notification-close', (event, id) => {
  if (!fromMainWindow(event) || !id) return;
  for (const [key, entry] of nativeNotifications) {
    if (entry.id === id) {
      entry.notification.close();
      nativeNotifications.delete(key);
    }
  }
});

function closeAllNativeNotifications() {
  for (const entry of nativeNotifications.values()) entry.notification.close();
  nativeNotifications.clear();
}

// ---------------------------------------------------------------------------
// Settings toggles
// ---------------------------------------------------------------------------

function toggleSetting(name) {
  settings[name] = !settings[name];
  saveSettings(settings);
  if (name === 'bubbleEnabled') {
    bubbleTempHidden = false;
    updateBubbleVisibility();
  }
  if (name === 'hideBubbleWhenSharing') applyBubblePrivacy();
  if (name === 'showBadgeCount') refreshBadges();
  if (name === 'rememberPositions' && !settings.rememberPositions) {
    settings.bubblePosition = null;
    settings.fullBounds = null;
    settings.miniSize = null;
    saveSettings(settings);
  }
  if (name === 'rememberPositions' && settings.rememberPositions) saveBubblePosition();
  createMenu();
}

function setShortcut(accelerator) {
  settings.shortcut = accelerator;
  saveSettings(settings);
  registerShortcut();
  createMenu();
}

// Toggle left sidebar visibility
function toggleLeftSidebar() {
  if (!mainWindow) return;
  settings.sidebarVisible = !settings.sidebarVisible;
  saveSettings(settings);
  applySidebarState();
}

// Apply sidebar visibility state
function applySidebarState() {
  if (!mainWindow) return;
  const visible = settings.sidebarVisible;
  mainWindow.webContents.executeJavaScript(`
    (function() {
      const sidebar = document.querySelector('[aria-label="Inbox switcher"]');
      if (sidebar) {
        sidebar.style.display = ${visible} ? '' : 'none';
      }
    })();
  `).catch(() => {});
}

// Create new message
function createNewMessage() {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript(`
    (function() {
      // Find and click the new message/compose button
      const newMessageBtn = document.querySelector('[aria-label="New message"]') ||
                           document.querySelector('[aria-label="Start a new message"]') ||
                           document.querySelector('[aria-label="Compose"]');
      if (newMessageBtn) {
        newMessageBtn.click();
      }
    })();
  `).catch(() => {});
}

// Switch to nth conversation
function switchToConversation(n) {
  if (!mainWindow) return;
  mainWindow.webContents.executeJavaScript(`
    (function() {
      // Find all conversation rows and click the link inside
      const rows = document.querySelectorAll('[role="row"]');
      const conversationLinks = [];

      rows.forEach(row => {
        const link = row.querySelector('a[role="link"][href*="/t/"]');
        if (link) {
          conversationLinks.push(link);
        }
      });

      if (conversationLinks[${n}]) {
        conversationLinks[${n}].click();
      }
    })();
  `).catch(() => {});
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Option+I' }
      ]
    },
    {
      label: 'Conversations',
      submenu: [
        { label: 'New Message', accelerator: 'CmdOrCtrl+N', click: () => createNewMessage() },
        { type: 'separator' },
        { label: 'Conversation 1', accelerator: 'CmdOrCtrl+1', click: () => switchToConversation(0) },
        { label: 'Conversation 2', accelerator: 'CmdOrCtrl+2', click: () => switchToConversation(1) },
        { label: 'Conversation 3', accelerator: 'CmdOrCtrl+3', click: () => switchToConversation(2) },
        { label: 'Conversation 4', accelerator: 'CmdOrCtrl+4', click: () => switchToConversation(3) },
        { label: 'Conversation 5', accelerator: 'CmdOrCtrl+5', click: () => switchToConversation(4) },
        { label: 'Conversation 6', accelerator: 'CmdOrCtrl+6', click: () => switchToConversation(5) },
        { label: 'Conversation 7', accelerator: 'CmdOrCtrl+7', click: () => switchToConversation(6) },
        { label: 'Conversation 8', accelerator: 'CmdOrCtrl+8', click: () => switchToConversation(7) },
        { label: 'Conversation 9', accelerator: 'CmdOrCtrl+9', click: () => switchToConversation(8) }
      ]
    },
    {
      label: 'Bubble',
      submenu: [
        { label: 'Open Quick Panel', click: () => showMini() },
        { label: 'Open Full Window', click: () => showFull() },
        { label: 'Bring Bubble Back', enabled: bubbleTempHidden, click: () => bringBubbleBack() },
        { type: 'separator' },
        { label: 'Show Bubble', type: 'checkbox', checked: settings.bubbleEnabled, click: () => toggleSetting('bubbleEnabled') },
        {
          label: shortcutError ? 'Quick Panel Shortcut (in use by another app)' : 'Quick Panel Shortcut',
          submenu: SHORTCUT_CHOICES.map(choice => ({
            label: choice.label,
            type: 'radio',
            checked: settings.shortcut === choice.accelerator,
            click: () => setShortcut(choice.accelerator)
          }))
        },
        { label: 'Show Unread Count', type: 'checkbox', checked: settings.showBadgeCount, click: () => toggleSetting('showBadgeCount') },
        { label: 'Notification Sound', type: 'checkbox', checked: settings.notificationSound, click: () => toggleSetting('notificationSound') },
        { label: 'Mute Notifications', type: 'checkbox', checked: settings.notificationsMuted, click: () => toggleSetting('notificationsMuted') },
        { label: 'Hide Bubble in Full Screen & Screen Sharing', type: 'checkbox', checked: settings.hideBubbleWhenSharing, click: () => toggleSetting('hideBubbleWhenSharing') },
        { label: 'Collapse Quick Panel When It Loses Focus', type: 'checkbox', checked: settings.collapseOnBlur, click: () => toggleSetting('collapseOnBlur') },
        { label: 'Remember Bubble Position & Window Size', type: 'checkbox', checked: settings.rememberPositions, click: () => toggleSetting('rememberPositions') }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+Shift+S', click: () => toggleLeftSidebar() },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => showWelcomeWindow() },
        { type: 'separator' },
        { label: 'Check for Updates...', click: () => checkForUpdates(false) }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Keep the bubble on a connected display when monitors change
function handleDisplayChange() {
  if (!bubbleWindow) return;
  const [x, y] = bubbleWindow.getPosition();
  const pos = ensureOnScreen({ x, y }, BUBBLE_SIZE, screen.getAllDisplays(), primaryWorkArea());
  if (pos.x !== x || pos.y !== y) {
    bubbleWindow.setBounds({ ...pos, width: BUBBLE_SIZE, height: BUBBLE_SIZE });
    saveBubblePosition();
  }
  if (mode === 'mini' && mainWindow && mainWindow.isVisible()) placeMiniPanel();
}

// Development only: lets a debugger attached with --inspect drive and inspect the bubble
if (!app.isPackaged && process.env.MESSENGER_BUBBLE_DEBUG) {
  global.__bubbleDebug = {
    electron: require('electron'),
    state: () => ({ mode, loggedIn, bubbleTempHidden, mainFullScreen, unread: unread.badgeValue(), shortcutError,
      notifications: [...nativeNotifications.entries()].map(([key, e]) => ({ key, body: e.notification.body })) }),
    showMini, showFull, hideMain, toggleFromShortcut
  };
}

app.on('second-instance', () => {
  if (mode === 'hidden') showMini();
  else if (mainWindow) mainWindow.show();
});

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;
  // Packaged builds get icon.icns from electron-builder; `npm start` would show Electron's icon
  if (app.dock && !app.isPackaged) app.dock.setIcon(path.join(__dirname, 'icon.png'));
  createMenu();
  createWindow();
  createBubbleWindow();
  registerShortcut();
  createMenu();

  screen.on('display-removed', handleDisplayChange);
  screen.on('display-added', handleDisplayChange);
  screen.on('display-metrics-changed', handleDisplayChange);

  // Signed in with the bubble on: start as a bubble, Messenger loads in the background.
  // Otherwise show the full window (e.g. to log in).
  await refreshLoginState();
  if (!(loggedIn && settings.bubbleEnabled)) showFull();

  // Show welcome window on first launch
  if (!settings.hasSeenWelcome) {
    setTimeout(() => showWelcomeWindow(), 1500);
  }

  // Check for updates silently on startup
  setTimeout(() => checkForUpdates(true), 5000);

  // Clicking the Dock icon opens the full window
  app.on('activate', () => {
    if (mainWindow) showFull();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Flush cookies before quitting
app.on('before-quit', async () => {
  isQuitting = true;
  rememberWindowSize();
  saveBubblePosition();
  clearTimeout(saveTimer);
  saveSettings(settings);
  await session.defaultSession.cookies.flushStore();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
