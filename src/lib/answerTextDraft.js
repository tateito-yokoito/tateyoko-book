// A draft is kept on the device until its exact edit is acknowledged by the server.
// The local tombstone is deliberately retained after an offline discard.
const DRAFT_PREFIX = 'tateyoko:answer-draft:v1';

export function draftStorageKey(userId, projectId, sequenceOrder) {
  return `${DRAFT_PREFIX}:${userId}:${projectId}:${sequenceOrder}`;
}

export function readLocalAnswerDraft(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && (value.state === 'active' || value.state === 'discard_pending')
      ? value : null;
  } catch {
    return null;
  }
}

function requireStorageWrite(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

function serverError(result, fallback) {
  if (result.error) throw result.error;
  if (!result.data) throw new Error(fallback);
  return result.data;
}

export class AnswerTextDraft {
  constructor({ client, storage, userId, projectId, sequenceOrder, initialText = '',
    initialTextRevision = 0, onChange = () => {}, debounceMs = 900 }) {
    if (!client || !storage || !userId || !projectId || !Number.isInteger(sequenceOrder)) {
      throw new Error('Draft identity is incomplete');
    }
    this.client = client;
    this.storage = storage;
    this.userId = userId;
    this.projectId = projectId;
    this.sequenceOrder = sequenceOrder;
    this.key = draftStorageKey(userId, projectId, sequenceOrder);
    this.onChange = onChange;
    this.debounceMs = debounceMs;
    this.timer = null;
    this.pending = Promise.resolve();
    this.serverEditNumber = 0;
    this.conflict = null;
    this.remoteStatus = 'unknown';
    this.record = readLocalAnswerDraft(storage, this.key) || {
      state: 'active', body: initialText, baseTextRevision: initialTextRevision,
      generation: 0, editNumber: 0, deviceId: crypto.randomUUID(), dirty: false,
    };
  }

  snapshot() {
    return { ...this.record, remoteStatus: this.remoteStatus, conflict: this.conflict };
  }

  emit() { this.onChange(this.snapshot()); }

  async open() {
    const { data, error } = await this.client.from('answer_text_drafts')
      .select('book_project_id,body,base_text_revision,generation,edit_number,device_id,state,updated_at')
      .eq('user_id', this.userId).eq('sequence_order', this.sequenceOrder).maybeSingle();
    if (error) {
      this.remoteStatus = 'offline';
      this.emit();
      return this.snapshot();
    }
    const remote = data?.book_project_id && data.book_project_id !== this.projectId ? null : data;
    this.serverEditNumber = remote?.edit_number ?? 0;
    if (this.record.state === 'discard_pending') {
      this.remoteStatus = 'discard_pending';
      this.emit();
      void this.retryDiscard();
      return this.snapshot();
    }
    if (remote?.state === 'active') {
      if (this.record.dirty && (this.record.body !== remote.body
        || this.record.generation !== remote.generation)) {
        this.conflict = remote;
        this.remoteStatus = 'conflict';
      } else {
        this.record = { state: 'active', body: remote.body,
          baseTextRevision: remote.base_text_revision,
          generation: remote.generation, editNumber: remote.edit_number,
          deviceId: remote.device_id, dirty: false };
        requireStorageWrite(this.storage, this.key, this.record);
        this.remoteStatus = 'saved';
      }
    } else if (remote) {
      if (this.record.dirty) {
        if (this.record.generation !== remote.generation) {
          this.conflict = remote;
          this.remoteStatus = 'conflict';
        } else {
          this.remoteStatus = 'device_only';
          this.scheduleSync();
        }
      } else {
        this.record.generation = remote.generation;
        this.record.editNumber = 0;
        this.record.deviceId = crypto.randomUUID();
        this.storage.removeItem(this.key);
        this.remoteStatus = 'saved';
      }
    } else {
      this.remoteStatus = this.record.dirty ? 'device_only' : 'saved';
      if (this.record.dirty) this.scheduleSync();
    }
    this.emit();
    return this.snapshot();
  }

  change(body) {
    if (this.record.state !== 'active' || this.conflict) throw new Error('Resolve the draft conflict first');
    const next = { ...this.record, body, editNumber: this.record.editNumber + 1,
      dirty: true, changedAt: Date.now() };
    // Synchronous device write happens before the UI reports this edit as accepted.
    requireStorageWrite(this.storage, this.key, next);
    this.record = next;
    this.remoteStatus = 'device_only';
    this.scheduleSync();
    this.emit();
  }

  scheduleSync() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, this.debounceMs);
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const work = async () => {
      const record = { ...this.record };
      if (!record.dirty || record.state !== 'active' || this.conflict) return this.snapshot();
      try {
        const payload = serverError(await this.client.rpc('sync_answer_text_draft', {
          input_project_id: this.projectId,
          input_sequence_order: this.sequenceOrder,
          input_generation: record.generation,
          input_edit_number: record.editNumber,
          input_expected_server_edit_number: this.serverEditNumber,
          input_device_id: record.deviceId,
          input_body: record.body,
          input_base_text_revision: record.baseTextRevision,
        }), 'Draft sync failed');
        if (payload.status !== 'saved') {
          this.conflict = payload.draft || { status: payload.status };
          this.remoteStatus = 'conflict';
          this.emit();
          return this.snapshot();
        }
        this.serverEditNumber = payload.draft.edit_number;
        if (this.record.state === 'active' && this.record.editNumber === record.editNumber) {
          this.record = { ...this.record, dirty: false };
          requireStorageWrite(this.storage, this.key, this.record);
          this.remoteStatus = 'saved';
        } else if (this.record.state === 'active') {
          this.scheduleSync();
        }
      } catch (error) {
        this.remoteStatus = 'device_only';
        this.emit();
        throw error;
      }
      this.emit();
      return this.snapshot();
    };
    this.pending = this.pending.then(work, work);
    return this.pending;
  }

  async discard() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const next = { ...this.record, state: 'discard_pending', body: null,
      dirty: false, changedAt: Date.now() };
    requireStorageWrite(this.storage, this.key, next);
    this.record = next;
    this.remoteStatus = 'discard_pending';
    this.emit();
    return this.retryDiscard();
  }

  async retryDiscard() {
    const work = async () => {
      if (this.record.state !== 'discard_pending') return this.snapshot();
      try {
        const result = serverError(await this.client.rpc('discard_answer_text_draft', {
          input_project_id: this.projectId,
          input_sequence_order: this.sequenceOrder,
          input_generation: this.record.generation,
          input_device_id: this.record.deviceId,
        }), 'Discard sync failed');
        const alreadyDiscarded = result.status === 'generation_conflict'
          && result.draft?.state === 'discarded'
          && result.draft?.generation === this.record.generation + 1
          && result.draft?.device_id === this.record.deviceId;
        if (result.status === 'discarded' || alreadyDiscarded) {
          this.record.generation = result.draft.generation;
          this.record.editNumber = 0;
          this.storage.removeItem(this.key);
          this.remoteStatus = 'discarded';
        } else {
          this.conflict = result.draft || { status: result.status };
          this.remoteStatus = 'conflict';
        }
      } catch {
        // Keep the tombstone so a stale server draft never reappears on this device.
        this.remoteStatus = 'discard_pending';
      }
      this.emit();
      return this.snapshot();
    };
    this.pending = this.pending.then(work, work);
    return this.pending;
  }

  async resolveConflict(choice) {
    if (!this.conflict || !['local', 'remote'].includes(choice)) {
      throw new Error('There is no draft choice to resolve');
    }
    const remote = this.conflict;
    if (remote.kind === 'answer') {
      const result = serverError(await this.client.rpc('rebase_conflicted_answer_text_draft', {
        input_project_id: this.projectId,
        input_sequence_order: this.sequenceOrder,
        input_generation: this.record.generation,
        input_edit_number: this.record.editNumber,
        input_device_id: this.record.deviceId,
        input_answer_revision: remote.answerRevision,
        input_choice: choice,
      }), 'Answer conflict resolution failed');
      if (result.status !== 'saved') {
        throw new Error('確定した文章が再び更新されました。画面を開き直して確認してください。');
      }
      this.record = { state: 'active', body: result.draft.body,
        baseTextRevision: result.draft.base_text_revision,
        generation: result.draft.generation, editNumber: result.draft.edit_number,
        deviceId: result.draft.device_id, dirty: false };
      requireStorageWrite(this.storage, this.key, this.record);
      this.serverEditNumber = result.draft.edit_number;
      this.conflict = null;
      this.remoteStatus = 'saved';
      this.emit();
      return this.snapshot();
    }
    if (this.record.state === 'discard_pending' && choice === 'local') {
      const result = serverError(await this.client.rpc('discard_conflicted_answer_text_draft', {
        input_project_id: this.projectId,
        input_sequence_order: this.sequenceOrder,
        input_generation: remote.generation,
        input_remote_edit_number: remote.edit_number,
        input_device_id: this.record.deviceId,
      }), 'Discard conflict resolution failed');
      if (result.status !== 'discarded') {
        this.conflict = result.draft || result;
        this.remoteStatus = 'conflict';
        this.emit();
        return this.snapshot();
      }
      this.storage.removeItem(this.key);
      this.record = { ...this.record, generation: result.draft.generation,
        editNumber: 0, dirty: false };
      this.conflict = null;
      this.remoteStatus = 'discarded';
      this.emit();
      return this.snapshot();
    }
    if (choice === 'remote' && remote.state === 'discarded') {
      this.storage.removeItem(this.key);
      this.record = { ...this.record, state: 'discard_pending', body: null,
        generation: remote.generation, editNumber: 0, dirty: false };
      this.conflict = null;
      this.remoteStatus = 'discarded';
      this.emit();
      return this.snapshot();
    }
    if (choice === 'remote' && typeof remote.body !== 'string') {
      throw new Error('Refresh the answer before resolving this conflict');
    }
    const body = choice === 'local' ? this.record.body : remote.body;
    const deviceId = crypto.randomUUID();
    const result = serverError(await this.client.rpc('resolve_answer_text_draft_conflict', {
      input_project_id: this.projectId,
      input_sequence_order: this.sequenceOrder,
      input_generation: remote.generation,
      input_remote_edit_number: remote.edit_number,
      input_device_id: deviceId,
      input_body: body,
      input_base_text_revision: remote.base_text_revision,
    }), 'Draft resolution failed');
    if (result.status !== 'saved') {
      this.conflict = result.draft || result;
      this.remoteStatus = 'conflict';
      this.emit();
      return this.snapshot();
    }
    this.record = { state: 'active', body,
      baseTextRevision: result.draft.base_text_revision,
      generation: result.draft.generation,
      editNumber: result.draft.edit_number,
      deviceId, dirty: false };
    requireStorageWrite(this.storage, this.key, this.record);
    this.serverEditNumber = result.draft.edit_number;
    this.conflict = null;
    this.remoteStatus = 'saved';
    this.emit();
    return this.snapshot();
  }

  async save(reason = 'edit') {
    await this.flush();
    if (this.record.state !== 'active' || this.record.dirty || this.conflict) {
      throw new Error('下書きの同期を確認してから保存してください');
    }
    const savedEdit = this.record.editNumber;
    const savedBody = this.record.body;
    const result = serverError(await this.client.rpc('save_answer_text', {
      input_project_id: this.projectId,
      input_sequence_order: this.sequenceOrder,
      input_device_id: this.record.deviceId,
      input_generation: this.record.generation,
      input_edit_number: savedEdit,
      input_base_text_revision: this.record.baseTextRevision,
      input_body: savedBody,
      input_reason: reason,
    }), 'Answer save failed');
    if (result.status !== 'saved') {
      if (result.status === 'answer_conflict') {
        const { data, error } = await this.client.from('answers')
          .select('transcript_edited,transcript_readable,transcript_clean,transcript_raw,snippet,text_revision')
          .eq('user_id', this.userId).eq('sequence_order', this.sequenceOrder).maybeSingle();
        if (error) throw error;
        this.conflict = {
          kind: 'answer', body: data?.transcript_edited || data?.transcript_readable
            || data?.transcript_clean || data?.transcript_raw || data?.snippet || '',
          answerRevision: Number(data?.text_revision || 0),
        };
      } else {
        const { data, error } = await this.client.from('answer_text_drafts')
          .select('body,base_text_revision,generation,edit_number,device_id,state')
          .eq('user_id', this.userId).eq('sequence_order', this.sequenceOrder).maybeSingle();
        if (error) throw error;
        this.conflict = data || result;
      }
      this.remoteStatus = 'conflict';
      this.emit();
      throw new Error('保存中に別の変更が見つかりました');
    }
    if (this.record.editNumber === savedEdit) {
      this.storage.removeItem(this.key);
      this.record = { ...this.record, state: 'active', body: savedBody,
        dirty: false, generation: result.generation, editNumber: 0,
        baseTextRevision: result.text_revision };
      this.remoteStatus = 'saved';
    } else {
      this.record = { ...this.record, generation: result.generation,
        editNumber: 1, baseTextRevision: result.text_revision, dirty: true };
      requireStorageWrite(this.storage, this.key, this.record);
      this.serverEditNumber = 0;
      this.scheduleSync();
    }
    this.emit();
    return result;
  }

  dispose() { if (this.timer) clearTimeout(this.timer); }
}
