const test = require('node:test');
const assert = require('node:assert');
const { parseUnreadFromTitle, formatBadge, UnreadTracker } = require('../lib/badge');

test('parseUnreadFromTitle reads the (n) prefix', () => {
  assert.strictEqual(parseUnreadFromTitle('(3) Messenger'), 3);
  assert.strictEqual(parseUnreadFromTitle('(12) Messenger'), 12);
  assert.strictEqual(parseUnreadFromTitle('(1) Jason | Messenger'), 1);
});

test('parseUnreadFromTitle returns 0 for a plain Messenger title', () => {
  assert.strictEqual(parseUnreadFromTitle('Messenger'), 0);
  assert.strictEqual(parseUnreadFromTitle('Jason | Messenger'), 0);
});

test('parseUnreadFromTitle returns null when the title cannot be trusted', () => {
  assert.strictEqual(parseUnreadFromTitle('Jason messaged you'), null);
  assert.strictEqual(parseUnreadFromTitle(''), null);
  assert.strictEqual(parseUnreadFromTitle(undefined), null);
  assert.strictEqual(parseUnreadFromTitle('https://www.messenger.com/'), null);
});

test('formatBadge follows the 0 / 1-9 / 9+ / dot rules', () => {
  assert.strictEqual(formatBadge(0), '');
  assert.strictEqual(formatBadge(1), '1');
  assert.strictEqual(formatBadge(9), '9');
  assert.strictEqual(formatBadge(10), '9+');
  assert.strictEqual(formatBadge(250), '9+');
  assert.strictEqual(formatBadge(null), '•');
  assert.strictEqual(formatBadge(2, { showCount: false }), '•');
  assert.strictEqual(formatBadge(0, { showCount: false }), '');
});

test('UnreadTracker keeps the last known count on untrusted titles', () => {
  const t = new UnreadTracker();
  assert.strictEqual(t.badgeValue(), 0);
  assert.strictEqual(t.updateFromTitle('(2) Messenger'), true);
  assert.strictEqual(t.badgeValue(), 2);
  assert.strictEqual(t.updateFromTitle('Jason messaged you'), false);
  assert.strictEqual(t.badgeValue(), 2);
  t.updateFromTitle('Messenger');
  assert.strictEqual(t.badgeValue(), 0);
});

test('UnreadTracker falls back to unknown (dot) when a message arrived but the count stayed 0', () => {
  const t = new UnreadTracker();
  t.markPossibleUnread();
  assert.strictEqual(t.badgeValue(), null);
  // A real count replaces the dot
  t.updateFromTitle('(1) Messenger');
  assert.strictEqual(t.badgeValue(), 1);
  // Reading clears everything
  t.updateFromTitle('Messenger');
  assert.strictEqual(t.badgeValue(), 0);
});

test('UnreadTracker.markPossibleUnread does nothing when a count is already known', () => {
  const t = new UnreadTracker();
  t.updateFromTitle('(4) Messenger');
  t.markPossibleUnread();
  assert.strictEqual(t.badgeValue(), 4);
});

test('UnreadTracker.degrade turns a stale number into a dot instead of keeping a possibly wrong count', () => {
  const t = new UnreadTracker();
  t.updateFromTitle('(3) Messenger');
  t.degrade();
  assert.strictEqual(t.badgeValue(), null);
  const empty = new UnreadTracker();
  empty.degrade();
  assert.strictEqual(empty.badgeValue(), 0);
});

test('UnreadTracker.reset clears state (logout)', () => {
  const t = new UnreadTracker();
  t.updateFromTitle('(4) Messenger');
  t.reset();
  assert.strictEqual(t.badgeValue(), 0);
});
