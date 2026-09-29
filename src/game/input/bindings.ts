import type { PlayerIntent } from '../sim/types';

export type GameAction = keyof PlayerIntent;

export const GAME_ACTIONS: readonly GameAction[] = ['forward', 'turnLeft', 'turnRight', 'fireFront', 'fireLeft', 'fireRight'];

/** Physical key codes (layout independent) bound to each gameplay action. */
export const KEY_BINDINGS: Readonly<Record<GameAction, readonly string[]>> = {
  forward: ['KeyW', 'ArrowUp'],
  turnLeft: ['KeyA', 'ArrowLeft'],
  turnRight: ['KeyD', 'ArrowRight'],
  fireFront: ['Space', 'KeyK'],
  fireLeft: ['KeyQ', 'KeyJ'],
  fireRight: ['KeyE', 'KeyL'],
};

export const PAUSE_KEYS: readonly string[] = ['KeyP', 'Escape'];

export const ACTION_LABELS: Readonly<Record<GameAction, string>> = {
  forward: 'Sail forward',
  turnLeft: 'Turn left',
  turnRight: 'Turn right',
  fireFront: 'Fire bow cannon',
  fireLeft: 'Port broadside (left)',
  fireRight: 'Starboard broadside (right)',
};

export const KEY_HINTS: Readonly<Record<GameAction, string>> = {
  forward: 'W / ↑',
  turnLeft: 'A / ←',
  turnRight: 'D / →',
  fireFront: 'Space / K',
  fireLeft: 'Q / J',
  fireRight: 'E / L',
};

const CODE_TO_ACTION = new Map<string, GameAction>();
for (const action of GAME_ACTIONS) {
  for (const code of KEY_BINDINGS[action]) CODE_TO_ACTION.set(code, action);
}

export function actionForCode(code: string): GameAction | undefined {
  return CODE_TO_ACTION.get(code);
}
