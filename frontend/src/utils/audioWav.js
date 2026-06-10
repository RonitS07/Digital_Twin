/** Encode mono Float32 samples as a 16-bit PCM WAV blob (Groq-compatible). */
export function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/** Decode recorded chunks to WAV for reliable server-side STT. */
export async function chunksToWavBlob(chunks, mimeType = 'audio/webm') {
  const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
  if (blob.size < 500) return null;

  const ctx = new AudioContext();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);

    const targetRate = 16000;
    let samples = channel;
    if (audioBuffer.sampleRate !== targetRate) {
      const ratio = audioBuffer.sampleRate / targetRate;
      const len = Math.floor(channel.length / ratio);
      samples = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        samples[i] = channel[Math.floor(i * ratio)];
      }
    }

    return encodeWav(samples, targetRate);
  } catch {
    return null;
  } finally {
    ctx.close().catch(() => {});
  }
}
