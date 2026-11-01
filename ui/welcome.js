// Shows the current global shortcut as keycaps and closes on Get Started / Return / Esc.

const KEY_SYMBOLS = {
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
  Space: 'Space'
};

const shortcut = new URLSearchParams(location.search).get('shortcut') || '';
const keysEl = document.getElementById('shortcut-keys');

if (shortcut) {
  for (const part of shortcut.split('+')) {
    const kbd = document.createElement('kbd');
    kbd.textContent = KEY_SYMBOLS[part] || part;
    keysEl.appendChild(kbd);
  }
} else {
  keysEl.className = 'hint';
  keysEl.textContent = 'Off';
}

document.getElementById('start').addEventListener('click', () => window.close());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Enter') window.close();
});

// Liquid Glass light follows the pointer across the button
const startButton = document.getElementById('start');
startButton.addEventListener('pointermove', (e) => {
  const rect = startButton.getBoundingClientRect();
  startButton.style.setProperty('--mx', `${(((e.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
  startButton.style.setProperty('--my', `${(((e.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
});
