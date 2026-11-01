const test = require('node:test');
const assert = require('node:assert');
const { snapToEdge, isInHideZone, panelBounds, ensureOnScreen } = require('../lib/geometry');

const workArea = { x: 0, y: 25, width: 1440, height: 850 };
const SIZE = 60;

test('snapToEdge sticks to the nearest side edge when released near it', () => {
  const left = snapToEdge({ x: 30, y: 300, width: SIZE, height: SIZE }, workArea);
  assert.deepStrictEqual(left, { x: 0, y: 300, width: SIZE, height: SIZE });
  const right = snapToEdge({ x: 1350, y: 300, width: SIZE, height: SIZE }, workArea);
  assert.deepStrictEqual(right, { x: 1380, y: 300, width: SIZE, height: SIZE });
});

test('snapToEdge leaves the bubble where it is when far from the edges', () => {
  const b = snapToEdge({ x: 600, y: 300, width: SIZE, height: SIZE }, workArea);
  assert.deepStrictEqual(b, { x: 600, y: 300, width: SIZE, height: SIZE });
});

test('snapToEdge keeps the bubble inside the work area', () => {
  const b = snapToEdge({ x: -40, y: -10, width: SIZE, height: SIZE }, workArea);
  assert.deepStrictEqual(b, { x: 0, y: 25, width: SIZE, height: SIZE });
  const c = snapToEdge({ x: 1500, y: 2000, width: SIZE, height: SIZE }, workArea);
  assert.deepStrictEqual(c, { x: 1380, y: 815, width: SIZE, height: SIZE });
});

test('isInHideZone is true when the bubble is dragged to the bottom of the screen', () => {
  assert.strictEqual(isInHideZone({ x: 600, y: 850, width: SIZE, height: SIZE }, workArea), true);
  assert.strictEqual(isInHideZone({ x: 600, y: 700, width: SIZE, height: SIZE }, workArea), false);
});

test('isInHideZone triggers even when the window cannot go below the work area', () => {
  // Bottom edge resting exactly on the work area bottom (e.g. stopped by the Dock)
  assert.strictEqual(isInHideZone({ x: 600, y: 25 + 850 - SIZE, width: SIZE, height: SIZE }, workArea), true);
  assert.strictEqual(isInHideZone({ x: 600, y: 25 + 850 - SIZE - 30, width: SIZE, height: SIZE }, workArea), false);
});

test('panelBounds opens to the left of a bubble on the right half', () => {
  const bubble = { x: 1380, y: 300, width: SIZE, height: SIZE };
  const p = panelBounds(bubble, workArea, { width: 360, height: 520 });
  assert.deepStrictEqual(p, { x: 1380 - 8 - 360, y: 300, width: 360, height: 520 });
});

test('panelBounds opens to the right of a bubble on the left half', () => {
  const bubble = { x: 0, y: 300, width: SIZE, height: SIZE };
  const p = panelBounds(bubble, workArea, { width: 360, height: 520 });
  assert.deepStrictEqual(p, { x: 68, y: 300, width: 360, height: 520 });
});

test('panelBounds is clamped inside the same work area', () => {
  const bubble = { x: 1380, y: 800, width: SIZE, height: SIZE };
  const p = panelBounds(bubble, workArea, { width: 360, height: 520 });
  assert.strictEqual(p.y, 25 + 850 - 520);
  const small = { x: 0, y: 0, width: 300, height: 400 };
  const q = panelBounds({ x: 0, y: 0, width: SIZE, height: SIZE }, small, { width: 360, height: 520 });
  assert.deepStrictEqual(q, { x: 0, y: 0, width: 300, height: 400 });
});

test('ensureOnScreen keeps a saved position that is on a connected display', () => {
  const displays = [{ workArea }];
  const pos = ensureOnScreen({ x: 100, y: 100 }, SIZE, displays, workArea);
  assert.deepStrictEqual(pos, { x: 100, y: 100 });
});

test('ensureOnScreen moves a bubble from a disconnected display back to the primary one', () => {
  const displays = [{ workArea }];
  const pos = ensureOnScreen({ x: 3000, y: 100 }, SIZE, displays, workArea);
  assert.deepStrictEqual(pos, { x: 1380, y: 25 + Math.round((850 - SIZE) / 2) });
  const none = ensureOnScreen(null, SIZE, displays, workArea);
  assert.deepStrictEqual(none, pos);
});
