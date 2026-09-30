import { useState } from 'react';

const LOW_HEALTH_RATIO = 0.3;

/**
 * Decorative screen-edge feedback: a red flash each time the player's hull is
 * hit, and a slow pulse while health is low. Hidden from assistive technology
 * (the HUD meter and the live region already report health).
 */
export function DamageVignette({ health, maxHealth }: { readonly health: number; readonly maxHealth: number }) {
  const [previous, setPrevious] = useState(health);
  const [hits, setHits] = useState(0);
  if (health !== previous) {
    // Adjusting state while rendering: a drop in health restarts the flash.
    setPrevious(health);
    if (health < previous) setHits((count) => count + 1);
  }
  const low = health > 0 && maxHealth > 0 && health / maxHealth <= LOW_HEALTH_RATIO;
  return (
    <div className={['damage-vignette', low ? 'damage-vignette--low' : ''].join(' ')} aria-hidden="true" data-testid="damage-vignette">
      {hits > 0 ? <div key={hits} className="damage-vignette__flash" /> : null}
    </div>
  );
}
