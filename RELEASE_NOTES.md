# Release Notes

## v1.4.0 — Messenger-Bubble (2026-11-01)

First release of the **Messenger-Bubble** fork (floating bubble by Jason, on top of Stefan Minch's messenger-mac).

### New Features
- **Floating Bubble** - Liquid Glass bubble above all apps and Spaces, drag anywhere, snaps to screen edges, fades when idle
- **Quick Panel** - Click the bubble or press Cmd+Shift+Space to open Messenger in a compact panel next to it; Esc collapses it
- **Instant & Lossless** - Messenger stays loaded in the background; hiding never loses the conversation or drafts
- **Unread Badge Sync** - Same exact count on the bubble and the Dock (1-9, 9+, or a dot when unknown)
- **Smarter Notifications** - Native, respects Focus/Do Not Disturb, drops duplicates, merges messages from the same chat
- **Bubble Menu** - Show bubble, shortcut choice, unread count, sound, mute, hide from screen sharing, collapse on focus loss, remember positions
- **Redesigned Welcome Window** - Native vibrancy material, Lucide icons, Liquid Glass button
- **Liquid Glass Bubble** - Pointer-following light on hover, press glow, liquid stretch while dragging

### Changes
- Renamed to Messenger-Bubble (bundle ID `com.jason.messenger-bubble`, data in `~/Library/Application Support/Messenger-Bubble`)
- Removed the upstream daily usage counter (no tracking at all)
- Update check points to this fork's releases (github.com/Blvckjs96/Messenger-Bubble)
- Closing the window hides it; Cmd+Q quits
- Only one instance can run, so there is only ever one Messenger session
- Builds are ad-hoc signed (not notarized) for now

---

## v1.3.0 (2025-12-27)

### New Features
- **Native Title Bar** - Standard macOS title bar for better window management
- **External Links** - Shared/forwarded links now open in your default browser instead of inside the app

### Bug Fixes
- Fixed issue where forwarded links (via l.messenger.com) were opening inside Electron

---

## v1.2.0 (2025-12-26)

### New Features
- **Auto-Update Check** - Automatically checks for new versions on startup
- **Keyboard Shortcuts** - Cmd+N for new message, Cmd+1-9 for conversations
- **Toggle Sidebar** - Cmd+Shift+S to show/hide sidebar
- **Welcome Screen** - First-launch guide showing features and shortcuts
- **Power Saving** - Background throttling to reduce CPU/battery usage

---

## v1.1.0 (2025-12-25)

### New Features
- Persistent login sessions
- Native macOS notifications

---

## v1.0.0 (2025-12-24)

- Initial release
- Basic Messenger wrapper for macOS
