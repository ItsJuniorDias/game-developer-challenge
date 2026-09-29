/**
 * Remembers whether the window lost focus (or the tab was hidden) since the
 * player asked to start a battle. The combat screen is loaded on demand, so
 * there is a short window before the GameSession exists and installs its own
 * listeners; a focus loss there must still make the match start paused.
 */
let armed = false;
let lostReason: 'focus_lost' | 'hidden' | null = null;
let installed = false;

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('blur', () => {
    if (armed) lostReason = 'focus_lost';
  });
  document.addEventListener('visibilitychange', () => {
    if (armed && document.visibilityState === 'hidden') lostReason = 'hidden';
  });
}

export const focusTracker = {
  /** Called when the battle route opens. */
  arm(): void {
    install();
    armed = true;
    lostReason = document.visibilityState === 'hidden' ? 'hidden' : null;
  },
  /** Returns (and clears) a focus loss recorded since arm(). */
  consume(): 'focus_lost' | 'hidden' | null {
    const reason = lostReason;
    armed = false;
    lostReason = null;
    return reason;
  },
};
