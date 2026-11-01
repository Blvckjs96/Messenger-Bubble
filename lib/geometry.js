// Pure window-placement math for the bubble and the mini panel.
// All rectangles are { x, y, width, height } in screen points.

const SNAP_THRESHOLD = 48;
const HIDE_ZONE = 20;
const PANEL_GAP = 8;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function clampToArea(bounds, area) {
  return {
    ...bounds,
    x: clamp(bounds.x, area.x, area.x + area.width - bounds.width),
    y: clamp(bounds.y, area.y, area.y + area.height - bounds.height)
  };
}

// Keep the bubble on screen and stick it to the left/right edge when released near it.
function snapToEdge(bounds, workArea, threshold = SNAP_THRESHOLD) {
  const b = clampToArea(bounds, workArea);
  const left = workArea.x;
  const right = workArea.x + workArea.width - b.width;
  if (b.x - left <= threshold) b.x = left;
  else if (right - b.x <= threshold) b.x = right;
  return b;
}

// Dragging the bubble to the bottom edge of the screen hides it temporarily.
// Measured from the bubble's bottom edge, since macOS may stop the window right above the Dock.
function isInHideZone(bounds, workArea) {
  return bounds.y + bounds.height >= workArea.y + workArea.height - HIDE_ZONE;
}

// Place the mini panel next to the bubble, on the side with more room, inside the same display.
function panelBounds(bubble, workArea, size) {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  const bubbleCenterX = bubble.x + bubble.width / 2;
  const onRightHalf = bubbleCenterX > workArea.x + workArea.width / 2;
  const x = onRightHalf ? bubble.x - PANEL_GAP - width : bubble.x + bubble.width + PANEL_GAP;
  return clampToArea({ x, y: bubble.y, width, height }, workArea);
}

function contains(area, x, y) {
  return x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height;
}

// Returns a saved bubble position if it is still on a connected display,
// otherwise the default spot: right edge, vertically centered on the primary display.
function ensureOnScreen(saved, size, displays, primaryWorkArea) {
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const cx = saved.x + size / 2;
    const cy = saved.y + size / 2;
    if (displays.some(d => contains(d.workArea, cx, cy))) {
      return { x: saved.x, y: saved.y };
    }
  }
  return {
    x: primaryWorkArea.x + primaryWorkArea.width - size,
    y: primaryWorkArea.y + Math.round((primaryWorkArea.height - size) / 2)
  };
}

module.exports = { snapToEdge, isInHideZone, panelBounds, ensureOnScreen, clampToArea };
