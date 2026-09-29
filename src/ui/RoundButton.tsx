import type { ButtonHTMLAttributes } from 'react';
import type { IconName } from './assets';
import { Icon } from './Icon';

interface RoundButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly icon: IconName;
  /** Accessible name (required: the button only shows an icon). */
  readonly label: string;
  readonly size?: number;
}

export function RoundButton({ icon, label, size = 48, className, type = 'button', style, ...rest }: RoundButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={['round-button', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </button>
  );
}
