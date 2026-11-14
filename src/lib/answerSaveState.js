// UI-neutral save acknowledgement shared by BOOK and seasonal answer screens.
export function canCompleteSavedAnswer({ hasContent, saveState, pendingMedia = 0, dirty = false, busy = false }) {
  return Boolean(hasContent) && saveState === 'saved' && !pendingMedia && !dirty && !busy;
}

// BOOK's local draft survives offline, but only the remote revision is saved.
export function bookTextSaveState(snapshot) {
  if (!snapshot) return 'idle';
  if (snapshot.conflict || snapshot.remoteStatus === 'conflict') return 'conflict';
  if (snapshot.syncPhase === 'failed' || snapshot.remoteStatus === 'offline') return 'failed';
  if (snapshot.syncPhase === 'saving' || snapshot.dirty) return 'saving';
  return snapshot.remoteStatus === 'saved' ? 'saved' : 'idle';
}
