import { RoundButton } from '../../ui/RoundButton';

interface PaginationProps {
  readonly page: number;
  readonly totalPages: number;
  readonly onChange: (page: number) => void;
  readonly label: string;
  readonly busy: boolean;
}

export function Pagination({ page, totalPages, onChange, label, busy }: PaginationProps) {
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <RoundButton icon="turn_left" label="Previous page" size={44} unavailable={page <= 1} onClick={() => onChange(page - 1)} data-testid="page-prev" />
      <p className="pagination__label" aria-live="polite" data-testid="page-label">
        Page {page} of {totalPages}
        {busy ? <span className="visually-hidden"> (loading)</span> : null}
      </p>
      <RoundButton icon="turn_right" label="Next page" size={44} unavailable={page >= totalPages} onClick={() => onChange(page + 1)} data-testid="page-next" />
    </nav>
  );
}
