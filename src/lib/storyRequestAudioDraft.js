const DATABASE = 'tateyoko-story-request-audio-v1';
const STORE = 'recordings';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export const audioDraftKey = (requestId, questionKey) => `${requestId}:${questionKey}`;
export const saveAudioDraft = (key, blob) => withStore('readwrite', store => store.put(blob, key));
export const loadAudioDraft = key => withStore('readonly', store => store.get(key));
export const removeAudioDraft = key => withStore('readwrite', store => store.delete(key));
