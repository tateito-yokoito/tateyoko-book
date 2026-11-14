// A BOOK photo is uploaded to the existing private photos bucket, then
// acknowledged in a draft row. Neither step creates an answer or advances
// question progress. A later RPC commits answer + media rows atomically.
export class BookAnswerPhotoDraft {
  constructor({ client, userId, projectId, questionId }) {
    if (!client || !userId || !projectId || !questionId) throw new Error('写真の下書き先を確認できません');
    Object.assign(this, { client, userId, projectId, questionId });
    this.pending = null;
  }

  async list() {
    const { data, error } = await this.client.from('book_answer_photo_drafts')
      .select('id,storage_path,sort_order,meta_json')
      .eq('book_project_id', this.projectId).eq('user_question_id', this.questionId)
      .is('committed_at', null).order('sort_order');
    if (error) throw error;
    return Promise.all((data || []).map(async row => {
      const signed = await this.client.storage.from('photos').createSignedUrl(row.storage_path, 3600);
      if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('写真を読み込めません');
      return { ...row, url: signed.data.signedUrl };
    }));
  }

  async add(file, sortOrder = 0) {
    if (!file || file.type !== 'image/jpeg' || file.size <= 0 || file.size > 25_000_000) {
      throw new Error('補正した25MB以下のJPEG写真を選んでください');
    }
    const pending = this.pending?.file === file ? this.pending : {
      file, id: crypto.randomUUID(), uploaded: false,
    };
    pending.path = `${this.userId}/${this.projectId}/draft/${pending.id}.jpg`;
    this.pending = pending;
    try {
      if (!pending.uploaded) {
        const { error } = await this.client.storage.from('photos').upload(pending.path, file, {
          contentType: 'image/jpeg', upsert: false,
        });
        // The server may have stored an object before the response was lost.
        // The random, stable ID is retained for this exact file on retry.
        if (error && String(error.statusCode || error.status) !== '409') throw error;
        pending.uploaded = true;
      }
      const { data, error } = await this.client.rpc('register_book_answer_photo_draft', {
        input_project_id: this.projectId, input_question_id: this.questionId,
        input_photo_id: pending.id, input_storage_path: pending.path,
        input_sort_order: sortOrder, input_meta: { content_type: 'image/jpeg' },
      });
      if (error || data?.status !== 'saved') throw error || new Error('写真を登録できませんでした');
      this.pending = null;
      return { id: pending.id, path: pending.path };
    } catch (error) {
      // Keep the same file and ID for an explicit retry. Never claim saved.
      throw error;
    }
  }

  async remove(photoId) {
    const { data: path, error } = await this.client.rpc('remove_book_answer_photo_draft', {
      input_photo_id: photoId,
    });
    if (error || !path) throw error || new Error('写真を外せませんでした');
    // Failure here leaves a private, unreferenced object; it cannot reappear
    // in the answer. Cleanup can be retried without changing formal progress.
    const removed = await this.client.storage.from('photos').remove([path]);
    return { removed: !removed.error, path };
  }

  async completePhotoOnly(sequenceOrder, photoIds) {
    if (!photoIds?.length || this.pending) throw new Error('写真の保存を確認してください');
    const { data, error } = await this.client.rpc('complete_book_answer_with_photos', {
      input_project_id: this.projectId, input_sequence_order: sequenceOrder,
      input_photo_ids: photoIds,
    });
    if (error || data?.status !== 'saved') throw error || new Error('回答を確定できませんでした');
    return data;
  }
}
