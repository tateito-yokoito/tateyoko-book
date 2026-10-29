// Development-only synthetic recording. Never import this from the public
// purchase path unless the local preview switch is enabled.
export async function loadGuestTrialDemoAudio() {
  const raw = await fetch('/site/trial-demo-voice.wav').then(response => {
    if (!response.ok) throw new Error('テスト音声を読み込めませんでした');
    return response.arrayBuffer();
  });
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(raw);
    const source = context.createBufferSource();
    source.buffer = decoded;
    const destination = context.createMediaStreamDestination();
    source.connect(destination);
    const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
    const pieces = [];
    recorder.ondataavailable = event => { if (event.data.size) pieces.push(event.data); };
    const audio = new Promise(resolve => {
      recorder.onstop = () => resolve(new Blob(pieces, { type: 'audio/webm' }));
    });
    recorder.start();
    source.start();
    source.onended = () => setTimeout(() => recorder.stop(), 200);
    return await audio;
  } finally {
    await context.close();
  }
}
