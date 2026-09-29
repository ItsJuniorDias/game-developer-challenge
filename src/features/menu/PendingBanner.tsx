import { retryAllSubmissions } from '../../api/matchSubmission';
import { usePendingMatches } from '../../api/pendingMatches';
import { GameButton } from '../../ui/GameButton';

/** Shows battles waiting to be recorded, with a manual retry. */
export function PendingBanner() {
  const pending = usePendingMatches();
  if (pending.length === 0) return null;
  const failed = pending.filter((p) => p.status !== 'pending');
  const message =
    failed.length > 0
      ? `${pending.length} battle${pending.length > 1 ? 's' : ''} not recorded yet. ${failed[0]?.lastError ?? ''}`
      : `Recording ${pending.length} battle${pending.length > 1 ? 's' : ''}…`;
  return (
    <div className="pending-banner" role="status" data-testid="pending-banner">
      <p>{message}</p>
      {failed.length > 0 ? (
        <GameButton variant="secondary" size="small" onClick={retryAllSubmissions}>
          Retry now
        </GameButton>
      ) : null}
    </div>
  );
}
