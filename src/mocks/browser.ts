import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

const START_OPTIONS = {
  serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  onUnhandledFrame: 'bypass' as const,
  quiet: true,
};

/**
 * Starts the mock API. Runs in every build (including production) because the
 * ranking and history backends are simulated. Failure is non-fatal: the game
 * stays playable and the API panels show their error states.
 */
export async function startMocking(): Promise<boolean> {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return false;
  try {
    await worker.start(START_OPTIONS);
    return true;
  } catch (error) {
    console.warn('[mocks] Mock Service Worker could not start; ranking and history will be unavailable.', error);
    return false;
  }
}

const CONFIRMATION_TIMEOUT_MS = 2000;
const CONFIRMATION_TTL_MS = 1000;
let lastConfirmedAt = 0;
let pending: Promise<void> | null = null;

function activate(controller: ServiceWorker): Promise<void> {
  const container = navigator.serviceWorker;
  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timer);
      container.removeEventListener('message', onMessage);
    };
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: string } | null;
      if (data?.type !== 'MOCKING_ENABLED') return;
      cleanup();
      lastConfirmedAt = performance.now();
      resolve();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('The mock Service Worker did not confirm activation.'));
    }, CONFIRMATION_TIMEOUT_MS);
    container.addEventListener('message', onMessage);
    controller.postMessage('MOCK_ACTIVATE');
  });
}

/**
 * Makes sure the Service Worker will answer this page's next API request.
 *
 * MSW keeps the list of mocked pages in the worker's memory. Browsers stop idle
 * workers (e.g. while the tab sits in the background), and a restarted worker
 * would silently let requests through to the hosting server. Re-sending
 * MOCK_ACTIVATE is idempotent and restores the mapping before each request.
 */
export async function ensureMockClient(): Promise<void> {
  if (performance.now() - lastConfirmedAt < CONFIRMATION_TTL_MS) return;
  if (!pending) {
    pending = (async () => {
      let controller = navigator.serviceWorker?.controller ?? null;
      if (!controller) {
        // The worker unregistered itself (last tab closed): register it again.
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0) throw new Error('The page is not controlled by the mock Service Worker.');
        await worker.start(START_OPTIONS);
        controller = navigator.serviceWorker.controller;
        if (!controller) throw new Error('The mock Service Worker did not take control of the page.');
      }
      await activate(controller);
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}
