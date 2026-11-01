// Preload script runs before the web page loads
// Using contextIsolation for security
//
// It is the single source of unread/notification events for the app:
// - unread-count:    the page title, every time it changes ("(3) Messenger")
// - message-arrived: every web notification Messenger tries to show
// The main process turns these into the bubble badge, Dock badge and native notifications.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('__messengerBubble', {
  notify: (data) => ipcRenderer.send('message-arrived', {
    id: Number(data && data.id) || 0,
    title: String((data && data.title) || ''),
    body: String((data && data.body) || ''),
    tag: String((data && data.tag) || '')
  }),
  close: (id) => ipcRenderer.send('notification-close', Number(id) || 0)
});

// Replace window.Notification in the page's own world so every web notification
// goes through the main process (dedupe, mute, Do Not Disturb) instead of being shown directly.
webFrame.executeJavaScript(`(() => {
  const bridge = window.__messengerBubble;
  if (!bridge || window.__messengerBubbleInstalled) return;
  window.__messengerBubbleInstalled = true;

  const live = new Map();
  let nextId = 1;

  function fire(target, type) {
    const event = new Event(type);
    target.dispatchEvent(event);
    const handler = target['on' + type];
    if (typeof handler === 'function') handler.call(target, event);
  }

  class BubbleNotification extends EventTarget {
    constructor(title, options = {}) {
      super();
      this.title = String(title == null ? '' : title);
      this.body = String(options.body == null ? '' : options.body);
      this.tag = String(options.tag == null ? '' : options.tag);
      this.data = options.data == null ? null : options.data;
      this.icon = options.icon || '';
      this.silent = !!options.silent;
      this.onclick = null;
      this.onshow = null;
      this.onclose = null;
      this.onerror = null;
      this._id = nextId++;
      live.set(this._id, this);
      if (live.size > 100) live.delete(live.keys().next().value);
      bridge.notify({ id: this._id, title: this.title, body: this.body, tag: this.tag });
      setTimeout(() => fire(this, 'show'), 0);
    }

    close() {
      if (!live.delete(this._id)) return;
      bridge.close(this._id);
      fire(this, 'close');
    }

    static get permission() { return 'granted'; }
    static requestPermission(callback) {
      if (typeof callback === 'function') callback('granted');
      return Promise.resolve('granted');
    }
  }

  window.Notification = BubbleNotification;

  // Called by the main process when the native notification is clicked:
  // let Messenger's own click handler open the right conversation.
  window.__messengerBubbleNotificationClick = (id) => {
    const notification = live.get(id);
    if (notification) fire(notification, 'click');
  };

  if (window.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype.showNotification) {
    ServiceWorkerRegistration.prototype.showNotification = function (title, options = {}) {
      bridge.notify({ id: 0, title: String(title || ''), body: String(options.body || ''), tag: String(options.tag || '') });
      return Promise.resolve();
    };
  }
})();`).catch((err) => console.error('Messenger-Bubble: notification hook failed', err));

// Watch the page title, which carries the unread count.
let lastTitle = null;
function reportTitle() {
  const title = document.title;
  if (title === lastTitle) return;
  lastTitle = title;
  ipcRenderer.send('unread-count', title);
}

// Esc in the quick panel collapses back to the bubble (the main process ignores it in other modes)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    ipcRenderer.send('escape-pressed');
  }
}, true);

window.addEventListener('DOMContentLoaded', () => {
  reportTitle();
  new MutationObserver(reportTitle).observe(document.head || document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true
  });
  // Safety net in case the observer misses a title swap
  setInterval(reportTitle, 5000);
});
