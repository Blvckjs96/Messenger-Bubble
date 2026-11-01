# Messenger-Bubble

Facebook Messenger for macOS with an Android-style **floating chat bubble**. Reply from anywhere with one click, without opening a browser or switching to a big window.

Messenger-Bubble is a fork of [messenger-mac](https://github.com/stefanminch/messenger-mac) by Stefan Minch. The floating bubble is an idea by Jason, developed in this fork on top of the original app.

<img src="icon.png" width="128" alt="Messenger-Bubble">

## Download

[![Download Messenger-Bubble for Mac](https://img.shields.io/badge/Download%20for%20Mac-v1.4.0%20(DMG)-0a84ff?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/Blvckjs96/Messenger-Bubble/releases/download/v1.4.0/Messenger-Bubble-1.4.0-arm64.dmg)

**[Download Messenger-Bubble v1.4.0 (DMG)](https://github.com/Blvckjs96/Messenger-Bubble/releases/download/v1.4.0/Messenger-Bubble-1.4.0-arm64.dmg)** · Macs with Apple silicon (M1 or newer) · [All releases](https://github.com/Blvckjs96/Messenger-Bubble/releases)

No coding needed: open the DMG, drag the app into Applications, then follow [the first-launch step](#install) once.

## The bubble

- **Floating bubble**: a small Liquid Glass bubble that stays above your apps on every Space. Drag it anywhere; it sticks to the nearest side of the screen.
- **Quick panel**: click the bubble (or press `Cmd + Shift + Space` from any app) to open the real Messenger in a compact 360 × 520 panel right next to it. Press `Esc` or click the bubble again to collapse it.
- **Nothing is lost**: the panel is only hidden, never closed. Your conversation, scroll position and drafts are exactly where you left them, and reopening is instant.
- **Exact unread badge**: the bubble and the Dock show the same number as Messenger: `1`–`9`, `9+` above nine, or a dot when the exact count can't be read. It never guesses.
- **Clean notifications**: native macOS notifications that respect Focus and Do Not Disturb. Repeats are dropped, several messages from the same chat are merged, and nothing pops up while you're already looking at Messenger.
- **Screen-sharing safe**: the bubble shows only an icon and a number, never names or avatars. Turn on *Hide Bubble in Full Screen & Screen Sharing* to keep it out of screen recordings and other apps' full-screen Spaces.
- **Fades when idle**: the bubble dims to 70% when you're not using it.
- **Right-click** the bubble for Quick Panel, Full Window, Hide Bubble, Mute Notifications and Quit.
- **Drag to the bottom** of the screen to hide the bubble for now. It comes back when a message arrives, with the shortcut, or from *Bubble → Bring Bubble Back*.
- **Remembers** the bubble position and window sizes across restarts.
- **Calls**: voice and video calls open in their own window; incoming calls pop the panel open even when you're in another app.

Only one Messenger session runs: the bubble is a tiny local window that only sends commands, and the quick panel *is* the main Messenger window, shrunk and placed next to the bubble.

## Everything else from messenger-mac

- Native macOS app in your Dock, no browser required
- Persistent login between restarts
- Shared links open in your default browser
- Power saving when in the background
- Light and dark mode
- No tracking, no analytics, no data collection (the upstream usage counter was removed in this fork)

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd + Shift + Space` | Open / hide the quick panel from any app (change it in *Bubble → Quick Panel Shortcut*) |
| `Esc` | Collapse the quick panel back to the bubble |
| `Cmd + N` | New message |
| `Cmd + 1-9` | Switch to conversation 1-9 |
| `Cmd + Shift + S` | Toggle sidebar visibility |
| `Cmd + Q` | Quit (bubble included) |

## Settings

Everything lives in the **Bubble** menu:

- Show Bubble
- Quick Panel Shortcut (`Cmd + Shift + Space`, `Ctrl + Option + Space`, `Cmd + Shift + M`, or Off)
- Show Unread Count (off shows a dot instead of the number)
- Notification Sound
- Mute Notifications
- Hide Bubble in Full Screen & Screen Sharing
- Collapse Quick Panel When It Loses Focus (off by default, so you never lose a draft by clicking elsewhere)
- Remember Bubble Position & Window Size

## Install

1. Download the latest `Messenger-Bubble-x.y.z-arm64.dmg` from the [Releases page](https://github.com/Blvckjs96/Messenger-Bubble/releases) (Apple Silicon Macs).
2. Open the DMG.
3. Drag **Messenger-Bubble** into **Applications**.
4. Open it once. macOS will block it because it isn't notarized:
   - **macOS 15 and later**: click **Done**, then open **System Settings → Privacy & Security**, scroll down to *"Messenger-Bubble" was blocked…* and click **Open Anyway**, then confirm.
   - **macOS 14 and earlier**: **right-click** Messenger-Bubble in Applications, choose **Open**, then click **Open** in the dialog.

> These builds are **ad-hoc signed but not notarized by Apple** (no Apple Developer ID yet). The step above is only needed the first time. Please don't disable Gatekeeper system-wide.
>
> If macOS says the app "is damaged" (rare, usually after an unusual download), run this once, then open it normally:
> `xattr -dr com.apple.quarantine /Applications/Messenger-Bubble.app`

The bubble appears after you log in to Messenger in the full window.

## Build from source

Requires Node.js 20 or 22 (LTS) and npm.

```bash
git clone https://github.com/Blvckjs96/Messenger-Bubble.git
cd Messenger-Bubble

npm install
npm test        # unit tests for badge, notification and placement logic
npm start       # run in development
npm run build   # build the DMG and ZIP into dist/
```

Builds are ad-hoc signed by `scripts/adhoc-sign.js` (`identity: null` skips Developer ID signing). To sign and notarize with your own Apple Developer ID, remove `identity: null` and the `afterPack` hook, and configure `mac.notarize` as described in the [electron-builder docs](https://www.electron.build/code-signing).

### Development flags

These only work when running from source (`npm start`), never in a packaged app:

- `MESSENGER_BUBBLE_DEBUG=1` logs open/close timings and exposes a debug hook to an attached `--inspect` debugger.
- `MESSENGER_BUBBLE_ASSUME_LOGIN=1` shows the bubble without logging in, to work on the UI.

## How it works

| Part | File |
|------|------|
| Main process: windows, modes, shortcut, badges, notifications, menus | `main.js` |
| Messenger preload: reads the unread count from the page title, routes web notifications to the main process | `preload.js` |
| Bubble window (local HTML, never loads Messenger) | `bubble/` |
| Welcome window and Lucide icon set | `ui/` |
| Pure logic with unit tests: badge rules, notification dedupe, placement math | `lib/`, `test/` |

## Known limitations

- **Notification click** opens the quick panel and passes the click to Messenger's own handler, which usually opens that conversation. Jumping to the exact conversation is not guaranteed.
- The unread count comes from Messenger's page title. If Meta changes it, the badge falls back to a dot and logs to `~/Library/Application Support/Messenger-Bubble/bubble.log`. It will never show a wrong number.
- macOS doesn't tell apps when another app is full screen or when the screen is being shared. The privacy option instead keeps the bubble out of screen captures and other apps' full-screen Spaces.
- The bubble's Liquid Glass look is drawn with CSS. Electron can't blur the desktop behind a custom-shaped window.
- Because builds are ad-hoc signed, macOS may ask again for camera, microphone or screen-recording permission after you install a new version.
- Incoming calls are detected from Messenger's ringtone and call notifications. If Meta changes how calls ring, the panel may not open by itself (the call still rings).

## Credits

- **Original app**: [messenger-mac](https://github.com/stefanminch/messenger-mac) by **Stefan Minch** (MIT). All of the original wrapper (window, persistent login, links, shortcuts, power saving) is his work.
- **Floating bubble**: idea and development by **Jason** in this fork (bubble, quick panel, unread badge sync, notification dedupe, settings, redesign).
- **Icons**: [Lucide](https://lucide.dev) (ISC).

## FAQ

### Is this the official Messenger app?
No. It's an unofficial wrapper around messenger.com, not affiliated with Meta/Facebook.

### Does my password go anywhere else?
No. You log in directly on messenger.com inside the app. There's no server of ours and no tracking.

### Does it support voice/video calls?
Yes. Calls use Messenger's own calling on messenger.com and open in their own window:

- **Camera and microphone**: macOS asks for permission the first time you call.
- **Incoming calls**: if Messenger is collapsed to the bubble, the app opens the panel and bounces the Dock icon when it rings, so you don't miss it.
- **Screen sharing**: choose a screen or window in the macOS picker. macOS asks for *Screen & System Audio Recording* permission the first time.
- **Call window**: comes to the front, and the quick panel collapses so it doesn't cover the call.

### My login isn't persisting?
Quit with `Cmd + Q` (closing the window only hides it) so the session is saved.

## License

MIT. See [LICENSE](LICENSE). The original copyright of Stefan Minch is kept, with the fork's additions by Jason.

## Disclaimer

This project is not affiliated with, authorized, maintained, sponsored, or endorsed by Meta/Facebook or any of its affiliates or subsidiaries. This is an independent and unofficial app. Use at your own risk.
