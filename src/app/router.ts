import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'play' }
  | { name: 'result' }
  | { name: 'log'; tab: 'ranking' | 'history' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  switch (path) {
    case '/options':
      return { name: 'options' };
    case '/play':
      return { name: 'play' };
    case '/result':
      return { name: 'result' };
    case '/log/ranking':
      return { name: 'log', tab: 'ranking' };
    case '/log/history':
      return { name: 'log', tab: 'history' };
    default:
      return { name: 'menu' };
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'menu':
      return '#/';
    case 'options':
      return '#/options';
    case 'play':
      return '#/play';
    case 'result':
      return '#/result';
    case 'log':
      return `#/log/${route.tab}`;
  }
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function getHash(): string {
  return window.location.hash;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash);
  return parseHash(hash);
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeToHash(route);
  if (options.replace) {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}

/**
 * A refresh on the combat screen abandons the match: the app always boots on
 * the main menu instead of silently starting a new battle.
 */
export function normalizeInitialRoute(): void {
  if (parseHash(window.location.hash).name === 'play') navigate({ name: 'menu' }, { replace: true });
}
