import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

interface DialogProps {
  readonly open: boolean;
  /** Called on Escape / cancel. */
  readonly onCancel: () => void;
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Modal dialog built on the native <dialog> element: showModal() makes the
 * rest of the page inert and traps focus; focus returns to the opener on close.
 */
export function Dialog({ open, onCancel, labelledBy, describedBy, initialFocusRef, children, className, testId }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      const target = initialFocusRef?.current ?? dialog.querySelector<HTMLElement>('[autofocus], button, [href], input, select');
      target?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocus.current?.focus?.();
      returnFocus.current = null;
    }
  }, [open, initialFocusRef]);

  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={['dialog', className].filter(Boolean).join(' ')}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      data-testid={testId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
