// Platform conventions for shortcut labels and modifier keys (macOS ⌘, Windows/Linux Ctrl).
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform) || navigator.userAgent.includes('Mac OS');
export const mod = (e: KeyboardEvent | MouseEvent) => (isMac ? e.metaKey : e.ctrlKey);
export const kbd = (keys: string) => (isMac
  ? keys.replace(/Mod\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥')
  : keys.replace(/Mod\+/g, 'Ctrl+').replace(/Shift\+/g, 'Maj+').replace(/Alt\+/g, 'Alt+'));
export const platformClass = () => (isMac ? 'mac' : /Win/.test(navigator.platform) ? 'win' : 'linux');
