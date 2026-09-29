import type { HTMLAttributes, ReactNode } from 'react';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  readonly wide?: boolean;
  readonly as?: 'section' | 'div' | 'main';
}

/** Wooden framed board (panel_menu sprite as a 9-slice). */
export function Panel({ children, wide, className, as: Tag = 'section', ...rest }: PanelProps) {
  return (
    <Tag className={['panel', wide ? 'panel--wide' : '', className].filter(Boolean).join(' ')} {...rest}>
      <div className="panel__content">{children}</div>
    </Tag>
  );
}
