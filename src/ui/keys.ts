// Command card hotkeys go by key position, not letter (KeyboardEvent.code), so the grid sits under the left hand on
// any layout: Q W E R / A S D F / Z X C V on QWERTY are Q W F P / A R S T / Z X C V on Colemak.

/** The card's keys, row by row: tabs, then two rows of slots. */
export const GRID_KEYS = [
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
] as const;

export type GridKey = (typeof GRID_KEYS)[number][number];

/** What each key prints on this keyboard. Starts as QWERTY; the browser's layout map replaces it where supported. */
const labels = new Map<string, string>(GRID_KEYS.flat().map((code) => [code, code.slice(3)]));
const listeners: (() => void)[] = [];

interface KeyboardLayoutApi {
  getLayoutMap(): Promise<Map<string, string>>;
}
const kb = (navigator as Navigator & { keyboard?: KeyboardLayoutApi }).keyboard;
kb?.getLayoutMap()
  .then((map) => {
    for (const code of labels.keys()) {
      const ch = map.get(code);
      if (ch) labels.set(code, ch.toUpperCase());
    }
    for (const f of listeners) f();
  })
  .catch(() => {});

/** The letter printed on the key at this position. */
export function keyLabel(code: string): string {
  return labels.get(code) ?? code;
}

/** Called once the real layout is known (Chrome and Edge; elsewhere labels stay QWERTY). */
export function onKeyLabels(f: () => void): void {
  listeners.push(f);
}
