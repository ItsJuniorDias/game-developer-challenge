import { retrySubmission, useSubmissionState } from '../../api/matchSubmission';
import { GameButton } from '../../ui/GameButton';

export function SubmissionStatus({ matchId, saved }: { readonly matchId: string; readonly saved: boolean }) {
  const { state, error } = useSubmissionState(matchId, saved);
  const text: Record<typeof state, string> = {
    saved: 'Battle recorded in the Captain’s Log.',
    sending: 'Recording battle…',
    pending: 'Waiting to record battle…',
    failed: 'Could not record the battle yet. It is saved on this device and will be retried.',
    rejected: 'The server rejected this record.',
    unknown: 'Record status unknown.',
  };
  const isProblem = state === 'failed' || state === 'rejected';
  return (
    <div className={['submission', `submission--${state}`].join(' ')} data-testid="submission-status" data-state={state}>
      <p role={isProblem ? 'alert' : 'status'} aria-live="polite">
        {text[state]}
        {isProblem && error ? <span className="submission__error"> ({error})</span> : null}
      </p>
      {isProblem ? (
        <GameButton variant="secondary" size="small" onClick={() => retrySubmission(matchId)} data-testid="submission-retry">
          Retry
        </GameButton>
      ) : null}
    </div>
  );
}
