import { useEffect, useRef, type ReactNode } from 'react';
import logoUrl from '../../assets/logo_jungle_gaming.svg?url';

interface ScreenProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

/**
 * Full-page menu layout over the scene backdrop. Moves focus to the main
 * heading on mount so keyboard and screen reader users land on the new screen.
 */
export function Screen({ title, children, footer }: ScreenProps) {
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = `${title} · Pirate Battle`;
  }, [title]);
  useEffect(() => {
    const heading = mainRef.current?.querySelector<HTMLElement>('h1, h2');
    heading?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="screen">
      <main ref={mainRef} className="screen__main">
        {children}
      </main>
      <footer className="screen__footer">
        {footer}
        <img className="screen__logo" src={logoUrl} alt="Jungle Gaming" width={124} height={36} />
      </footer>
    </div>
  );
}
