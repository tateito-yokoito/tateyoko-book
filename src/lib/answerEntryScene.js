// Show the answer choice before requesting microphone access.
export function answerEntryScene(action, micChecked = false) {
  if (action === "question") return 1;
  if (action === "record") return micChecked ? 3 : "recording_mic_check";
  throw new Error(`Unknown answer entry action: ${action}`);
}
