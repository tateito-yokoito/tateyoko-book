const DATABASE = 'tateyoko-answer-recording-drafts';
const STORE = 'recordings';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('この端末では録音の一時保存を利用できません。'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, action) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function saveAnswerRecordingDraft(draft) {
  if (!draft?.id || !draft.userId || !draft.projectId || !draft.segments?.length
    || draft.segments.some(segment => !segment.blob?.size)) {
    throw new Error('録音の一時保存データを確認できません。');
  }
  await transact('readwrite', store => store.put(draft));
}

export async function listAnswerRecordingDrafts(userId, projectId) {
  if (!userId || !projectId) return [];
  const all = await transact('readonly', store => store.getAll());
  return (all || []).filter(item => item.userId === userId && item.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteAnswerRecordingDraft(id) {
  if (!id) return;
  await transact('readwrite', store => store.delete(id));
}
