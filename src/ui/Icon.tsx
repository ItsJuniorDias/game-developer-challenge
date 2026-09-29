import { iconSprite, type IconName } from './assets';

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly className?: string;
}

/** Decorative sprite icon; the accessible name always comes from the parent. */
export function Icon({ name, size = 24, className }: IconProps) {
  const { src, srcSet } = iconSprite(name);
  return <img className={className} src={src} srcSet={srcSet} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}
