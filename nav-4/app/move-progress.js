const labels = {
  requesting: 'Requesting move…',
  queued: 'Queued for generation…',
  preparing: 'Preparing generation…',
  generating: 'Generating move…',
  validating: 'Checking move rules…',
  testing_queued: 'Waiting for balance tests…',
  testing: 'Testing and balancing…',
  saving: 'Saving move to the library…',
  ready: 'Move saved · Waiting for library sync…',
  refreshing: 'Refreshing move library…',
  failed: 'Move creation failed…',
};
export const PROGRESS_PHASES = new Set([...Object.keys(labels), 'retrying']);
export function moveProgressText(progress) {
  const phase = progress?.phase || 'requesting';
  const attempt =
    Number.isInteger(progress?.attempt) && progress.attempt > 0 ? Math.min(3, progress.attempt) : 0;
  const suffix =
    attempt && ['generating', 'validating', 'testing_queued', 'testing', 'retrying'].includes(phase)
      ? ` · Attempt ${attempt} of 3${attempt > 1 ? ' (retry)' : ''}`
      : '';
  if (phase === 'retrying')
    return (
      ({
        validation: 'Retrying after a rules check…',
        testing: 'Retrying after balance tests…',
        incomplete: 'Retrying an incomplete response…',
      }[progress.retryReason] || 'Retrying generation…') + suffix
    );
  return (labels[phase] || labels.requesting) + suffix;
}
