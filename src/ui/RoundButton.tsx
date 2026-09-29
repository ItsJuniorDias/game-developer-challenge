import type { ButtonHTMLAttributes } from 'react';
import type { IconName } from './assets';
import { Icon } from './Icon';

interface RoundButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly icon: IconName;
  /** Accessible name (required: the button only shows an icon). */
  readonly label: string;
  readonly size?: number;
  /** Disabled for users but still focusable (aria-disabled), so keyboard focus is never lost. */
  readonly unavailable?: boolean;
}

export function RoundButton({ icon, label, size = 48, unavailable = false, className, type = 'button', style, onClick, ...rest }: RoundButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={unavailable || undefined}
      onClick={(event) => {
        if (unavailable) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
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
