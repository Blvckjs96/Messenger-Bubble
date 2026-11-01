// Bubble renderer: drag, click, right-click, idle fade, badge display, and the
// Liquid Glass reactions (pointer light, press, liquid stretch while dragging).
// It never talks to Messenger directly; it only sends commands to the main process.

const DRAG_THRESHOLD = 4;
const IDLE_DELAY = 3000;
const MAX_STRETCH = 0.08;
const STRETCH_PER_PX = 0.006;

const bubbleEl = document.getElementById('bubble');
const badgeEl = document.getElementById('badge');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let pointer = null;
let pendingMove = null;
let idleTimer = null;
let stretchFrame = null;
let stretch = 0;

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), IDLE_DELAY);
}

function wake() {
  document.body.classList.remove('idle');
  scheduleIdle();
}

// Pointer light: where the cursor sits on the glass, in % of the disc
function trackLight(e) {
  const rect = bubbleEl.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  bubbleEl.style.setProperty('--mx', `${Math.max(0, Math.min(100, x)).toFixed(1)}%`);
  bubbleEl.style.setProperty('--my', `${Math.max(0, Math.min(100, y)).toFixed(1)}%`);
}

// Liquid stretch: the disc elongates along the drag direction, proportional to speed,
// and relaxes back to a circle as soon as the movement stops.
function setStretch(dx, dy) {
  if (reduceMotion.matches) return;
  const speed = Math.hypot(dx, dy);
  if (speed < 0.5) return;
  stretch = Math.min(MAX_STRETCH, Math.max(stretch, speed * STRETCH_PER_PX));
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  bubbleEl.style.setProperty('--angle', `${angle.toFixed(1)}deg`);
  bubbleEl.style.setProperty('--stretch', stretch.toFixed(3));
  if (!stretchFrame) stretchFrame = requestAnimationFrame(relaxStretch);
}

function relaxStretch() {
  stretch *= 0.82;
  if (stretch < 0.002) {
    stretch = 0;
    stretchFrame = null;
    bubbleEl.style.setProperty('--stretch', '0');
    return;
  }
  bubbleEl.style.setProperty('--stretch', stretch.toFixed(3));
  stretchFrame = requestAnimationFrame(relaxStretch);
}

bubbleEl.addEventListener('pointerenter', (e) => {
  document.body.classList.add('hover');
  trackLight(e);
});

bubbleEl.addEventListener('pointerleave', () => {
  if (!pointer) document.body.classList.remove('hover');
});

bubbleEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  bubbleEl.setPointerCapture(e.pointerId);
  document.body.classList.add('pressed');
  trackLight(e);
  pointer = {
    startX: e.screenX,
    startY: e.screenY,
    lastX: e.screenX,
    lastY: e.screenY,
    winX: window.screenX,
    winY: window.screenY,
    dragging: false
  };
});

bubbleEl.addEventListener('pointermove', (e) => {
  if (!pointer) {
    trackLight(e);
    return;
  }
  const dx = e.screenX - pointer.startX;
  const dy = e.screenY - pointer.startY;
  if (!pointer.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
  if (!pointer.dragging) {
    pointer.dragging = true;
    document.body.classList.remove('pressed');
    document.body.classList.add('dragging');
  }
  setStretch(e.screenX - pointer.lastX, e.screenY - pointer.lastY);
  pointer.lastX = e.screenX;
  pointer.lastY = e.screenY;
  const scheduled = pendingMove !== null;
  pendingMove = { x: pointer.winX + dx, y: pointer.winY + dy };
  if (!scheduled) {
    requestAnimationFrame(() => {
      window.bubble.move(pendingMove);
      pendingMove = null;
    });
  }
});

function endPointer() {
  pointer = null;
  document.body.classList.remove('pressed', 'dragging');
  if (!bubbleEl.matches(':hover')) document.body.classList.remove('hover');
}

bubbleEl.addEventListener('pointerup', (e) => {
  if (!pointer || e.button !== 0) return;
  const wasDragging = pointer.dragging;
  endPointer();
  if (wasDragging) window.bubble.dragEnd();
  else window.bubble.click();
});

bubbleEl.addEventListener('pointercancel', () => {
  if (pointer && pointer.dragging) window.bubble.dragEnd();
  endPointer();
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.bubble.contextMenu();
});

document.addEventListener('mouseenter', wake);
document.addEventListener('mousemove', wake);
document.addEventListener('mouseleave', scheduleIdle);

window.bubble.onBadge((text) => {
  badgeEl.hidden = !text;
  badgeEl.classList.toggle('dot', text === '•');
  badgeEl.textContent = text === '•' ? '' : text;
  badgeEl.setAttribute('aria-label', text === '•' ? 'Unread messages' : `${text} unread`);
  if (text) wake();
});

window.bubble.onHideZone((inZone) => {
  document.body.classList.toggle('hide-zone', inZone);
});

scheduleIdle();
