import type { ShipKind } from '../sim/types';

/**
 * Ship sprites come in 6 colours x 4 damage tiers (ship_1..ship_24):
 * index = colour + 6 * tier, tier 3 being the wreck.
 */
export const SHIP_COLOR: Readonly<Record<ShipKind, number>> = {
  player: 2, // black sails, skull
  chaser: 3, // red sails
  shooter: 5, // blue sails
};

export function damageTier(health: number, maxHealth: number): 0 | 1 | 2 {
  const ratio = maxHealth > 0 ? health / maxHealth : 0;
  if (ratio > 2 / 3) return 0;
  if (ratio > 1 / 3) return 1;
  return 2;
}

export function shipFrame(kind: ShipKind, tier: 0 | 1 | 2 | 3): string {
  return `ship_${SHIP_COLOR[kind] + tier * 6}`;
}
