# Product

## Register

product

## Users
Mac users who chat on Facebook Messenger throughout the workday while their attention is on other apps (code editors, browsers, design tools). They want to see that a message arrived, answer it in a few seconds, and get back to work without hunting for a browser tab or a full Messenger window. They often share their screen in meetings.

## Product Purpose
Messenger-Bubble is an unofficial macOS wrapper for messenger.com (a fork of Stefan Minch's messenger-mac) that adds an Android-style floating chat bubble. The bubble shows an exact unread count, opens a compact quick panel next to itself in under 300 ms, and collapses back without losing drafts. Success means the user replies from anywhere with one click or one shortcut, and never sees a wrong badge or a duplicate notification.

## Brand Personality
Native, quiet, precise. It should feel like something Apple shipped with macOS: system font, system materials (Liquid Glass for the bubble), light and dark mode, one accent colour. It never competes with the app the user is actually working in.

## Anti-references
- Loud, colourful chat-app chrome that copies Meta's gradient branding.
- Floating widgets that look like ads or browser-extension overlays (heavy shadows, bouncing, pulsing attention-grabbers).
- Web-page-looking welcome screens with marketing gradients, emoji as icons, or card grids.
- Anything that shows message content or avatars on the bubble (it must be safe while screen sharing).

## Design Principles
1. Disappear into the desktop: the bubble is small, translucent when idle, and never steals focus.
2. Truth over guesses: a dot is better than a wrong number; every state shown must be real.
3. Native first: follow macOS conventions (materials, SF type, keycaps, light/dark) over custom flair.
4. Fast and reversible: every open/close is instant and nothing is lost when something is hidden.
5. Privacy by default: no tracking, no message content in persistent UI.

## Accessibility & Inclusion
WCAG 2.2 AA contrast for all text. Respect `prefers-reduced-motion` (no scale/fade animation, instant state changes) and `prefers-reduced-transparency` (solid materials instead of glass). Unread state never relies on colour alone (number or dot shape). Works in both light and dark appearance.
