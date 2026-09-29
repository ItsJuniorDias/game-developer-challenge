import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

/**
 * Starts the mock API. Runs in every build (including production) because the
 * ranking and history backends are simulated. Failure is non-fatal: the game
 * stays playable and the API panels show their error states.
 */
export async function startMocking(): Promise<boolean> {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return false;
  try {
    await worker.start({
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
      onUnhandledFrame: 'bypass',
      quiet: true,
    });
    return true;
  } catch (error) {
    console.warn('[mocks] Mock Service Worker could not start; ranking and history will be unavailable.', error);
    return false;
  }
}
