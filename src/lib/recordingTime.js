export const RECORDING_LIMIT_SECONDS = 10 * 60;
export const RECORDING_WARNING_SECONDS = RECORDING_LIMIT_SECONDS - 60;
export const RECORDING_LIMIT_NOTICE = "10分になったため、録音を区切りました。";

// Measure active recording time, not interval ticks (which browsers can delay).
export function createRecordingClock(now = () => performance.now()) {
  let elapsed = 0;
  let startedAt = null;
  return {
    start() { elapsed = 0; startedAt = now(); },
    pause() {
      if (startedAt !== null) elapsed += Math.max(0, now() - startedAt);
      startedAt = null;
    },
    resume() { if (startedAt === null) startedAt = now(); },
    seconds() { return Math.floor((elapsed + (startedAt === null ? 0 : Math.max(0, now() - startedAt))) / 1000); }
  };
}

export function mergeRecordingDuration(previous, duration, append) {
  return (append ? Math.max(0, Number(previous) || 0) : 0) + Math.max(0, Number(duration) || 0);
}
