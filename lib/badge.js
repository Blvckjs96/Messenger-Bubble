// Unread count helpers shared by the bubble, the Dock badge and notifications.
// The page title is the single source of truth: "(3) Messenger" means 3 unread.

// Returns the unread count, 0 for a plain "Messenger" title, or null when the
// title cannot be trusted (flashing "X messaged you" titles, error pages, ...).
function parseUnreadFromTitle(title) {
  if (typeof title !== 'string' || !title.trim()) return null;
  const match = title.match(/^\s*\((\d+)\+?\)/);
  if (match) return parseInt(match[1], 10);
  if (/messenger/i.test(title) && !/^https?:/i.test(title)) return 0;
  return null;
}

// 0 -> hidden, 1-9 -> exact, >9 -> "9+", unknown -> dot. Never guesses a number.
function formatBadge(value, { showCount = true } = {}) {
  if (value === 0) return '';
  if (value === null || value === undefined || !showCount) return '•';
  return value > 9 ? '9+' : String(value);
}

class UnreadTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.count = 0;
    this.unknown = false;
  }

  // Returns true when the title was understood.
  updateFromTitle(title) {
    const parsed = parseUnreadFromTitle(title);
    if (parsed === null) return false;
    this.count = parsed;
    this.unknown = false;
    return true;
  }

  // A message arrived but the title still reports nothing: show a dot instead
  // of a made-up number until the title tells us otherwise.
  markPossibleUnread() {
    if (this.count === 0) this.unknown = true;
  }

  // The title has been unreadable for too long (e.g. Meta changed the page):
  // keep signalling "something unread" but stop showing a number we can't verify.
  degrade() {
    if (this.count > 0) {
      this.count = 0;
      this.unknown = true;
    }
  }

  // Number of unread, 0 for none, null for "there is something, count unknown".
  badgeValue() {
    if (this.count > 0) return this.count;
    return this.unknown ? null : 0;
  }
}

module.exports = { parseUnreadFromTitle, formatBadge, UnreadTracker };
