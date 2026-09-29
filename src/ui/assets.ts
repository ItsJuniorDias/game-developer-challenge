/**
 * UI sprite URLs (1x + 2x) resolved by Vite from the provided asset pack.
 */
const DEFAULT = import.meta.glob<string>('../../assets/png/default/ui/*/*.png', { query: '?url', import: 'default', eager: true });
const RETINA = import.meta.glob<string>('../../assets/png/retina/ui/*/*.png', { query: '?url', import: 'default', eager: true });

export type UiFamily = 'menu' | 'controls' | 'hud';

export function uiSprite(family: UiFamily, name: string): { src: string; srcSet: string } {
  const src = DEFAULT[`../../assets/png/default/ui/${family}/${name}.png`] ?? '';
  const retina = RETINA[`../../assets/png/retina/ui/${family}/${name}.png`];
  return { src, srcSet: retina ? `${src} 1x, ${retina} 2x` : `${src} 1x` };
}

export type IconName =
  | 'close'
  | 'fire_front'
  | 'fire_left'
  | 'fire_right'
  | 'forward'
  | 'home'
  | 'minus'
  | 'pause'
  | 'play'
  | 'plus'
  | 'restart'
  | 'settings'
  | 'turn_left'
  | 'turn_right'
  | 'heart'
  | 'score'
  | 'time';

const HUD_ICONS: ReadonlySet<IconName> = new Set(['heart', 'score', 'time']);

export function iconSprite(name: IconName): { src: string; srcSet: string } {
  return uiSprite(HUD_ICONS.has(name) ? 'hud' : 'controls', `icon_${name}`);
}
