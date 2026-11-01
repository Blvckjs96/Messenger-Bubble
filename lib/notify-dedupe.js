// Decides whether a web notification should become a native one.
// - same conversation + same text within the window -> drop (duplicate)
// - same conversation, new text within the window   -> replace (merge into one)
// - otherwise                                        -> show
class NotificationDeduper {
  constructor({ windowMs = 5000 } = {}) {
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  decide(key, body, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry || now - entry.last > this.windowMs) {
      this.entries.set(key, { last: now, bodies: new Set([body]), count: 1 });
      return { action: 'show', count: 1 };
    }
    entry.last = now;
    if (entry.bodies.has(body)) {
      return { action: 'drop', count: entry.count };
    }
    entry.bodies.add(body);
    entry.count += 1;
    return { action: 'replace', count: entry.count };
  }

  clear() {
    this.entries.clear();
  }
}

module.exports = { NotificationDeduper };
