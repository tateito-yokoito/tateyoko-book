// One adapter per Person and signed-in account. No owner/user substitution.
export function createFamilyPhotoSaver(api, projectId) {
  const pending = new WeakMap();
  return async file => {
    let state = pending.get(file);
    if (!state) { state = {}; pending.set(file, state); }
    if (state.done) return;
    if (state.inflight) return state.inflight;
    state.inflight = (async () => {
      state.upload ||= await api.reserve(projectId, file, 'photo');
      await api.commitPhoto(state.upload);
      state.done = true;
    })();
    try { await state.inflight; } finally { state.inflight = null; }
  };
}
