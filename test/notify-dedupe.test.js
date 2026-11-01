const test = require('node:test');
const assert = require('node:assert');
const { NotificationDeduper } = require('../lib/notify-dedupe');

test('first notification for a conversation is shown', () => {
  const d = new NotificationDeduper({ windowMs: 5000 });
  assert.deepStrictEqual(d.decide('Jason', 'hi', 0), { action: 'show', count: 1 });
});

test('identical notification within the window is dropped', () => {
  const d = new NotificationDeduper({ windowMs: 5000 });
  d.decide('Jason', 'hi', 0);
  assert.deepStrictEqual(d.decide('Jason', 'hi', 1000), { action: 'drop', count: 1 });
});

test('new messages in the same conversation within the window are merged', () => {
  const d = new NotificationDeduper({ windowMs: 5000 });
  d.decide('Jason', 'hi', 0);
  assert.deepStrictEqual(d.decide('Jason', 'are you there?', 2000), { action: 'replace', count: 2 });
  assert.deepStrictEqual(d.decide('Jason', 'hello??', 6000), { action: 'replace', count: 3 });
});

test('window is measured from the last message, after which a fresh notification starts', () => {
  const d = new NotificationDeduper({ windowMs: 5000 });
  d.decide('Jason', 'hi', 0);
  assert.deepStrictEqual(d.decide('Jason', 'hi', 5001), { action: 'show', count: 1 });
});

test('different conversations are independent', () => {
  const d = new NotificationDeduper({ windowMs: 5000 });
  d.decide('Jason', 'hi', 0);
  assert.deepStrictEqual(d.decide('Anna', 'hi', 100), { action: 'show', count: 1 });
});

test('clear forgets a conversation (e.g. after it was read)', () => {
  const d = new NotificationDeduper({ windowMs: 5000 });
  d.decide('Jason', 'hi', 0);
  d.clear();
  assert.deepStrictEqual(d.decide('Jason', 'hi', 100), { action: 'show', count: 1 });
});
