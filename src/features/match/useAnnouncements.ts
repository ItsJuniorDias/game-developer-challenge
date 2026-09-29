import { useEffect, useRef, useState } from 'react';
import type { HudState } from '../../game/session/hudStore';

const SCORE_THROTTLE_MS = 2500;

/**
 * Turns HUD changes into short screen reader announcements (aria-live).
 * Only milestones are announced, never every frame or every second.
 */
export function useAnnouncements(hud: HudState | null): string {
  const [message, setMessage] = useState('');
  const previous = useRef<HudState | null>(null);
  const lastScoreAnnouncement = useRef(0);

  useEffect(() => {
    const prev = previous.current;
    previous.current = hud;
    if (!hud || !prev) return;
    let next: string | null = null;
    if (prev.phase !== hud.phase) {
      if (hud.phase === 'running' && prev.phase === 'loading') next = `Battle started. ${hud.timeLeft} seconds on the clock.`;
      else if (hud.phase === 'running' && prev.phase === 'paused') next = 'Game resumed.';
      else if (hud.phase === 'paused') next = 'Game paused.';
      else if (hud.phase === 'ended') next = `Battle over. ${hud.endReason === 'defeated' ? 'Your ship sank.' : 'Time is up.'} Final score ${hud.score}.`;
    } else if (hud.timeLeft !== prev.timeLeft && (hud.timeLeft === 30 || hud.timeLeft === 10)) {
      next = `${hud.timeLeft} seconds left.`;
    } else if (hud.health < prev.health && hud.health > 0 && hud.health / hud.maxHealth <= 0.3 && prev.health / prev.maxHealth > 0.3) {
      next = 'Hull critical!';
    } else if (hud.score !== prev.score) {
      const now = performance.now();
      if (now - lastScoreAnnouncement.current > SCORE_THROTTLE_MS) {
        lastScoreAnnouncement.current = now;
        next = `Score ${hud.score}.`;
      }
    }
    if (next) setMessage(next);
  }, [hud]);

  return message;
}
