export const PCM_WORKLET_SRC = `
class PcmDownsampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._inSampleRate = sampleRate;
    this._outSampleRate = options?.processorOptions?.outSampleRate ?? 16000;
    this._ratio = this._inSampleRate / this._outSampleRate;
    this._buf = [];
    this._chunkSize = Math.round(this._outSampleRate * 0.2);
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
    const inLen = this._buf.length;
    const outLen = Math.floor(inLen / this._ratio);
    if (outLen >= this._chunkSize) {
      const out = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const idx = Math.floor(i * this._ratio);
        let s = this._buf[idx] || 0;
        if (s > 1) s = 1; if (s < -1) s = -1;
        out[i] = (s * 32767) | 0;
      }
      this._buf = this._buf.slice(Math.floor(outLen * this._ratio));
      this.port.postMessage(out.buffer, [out.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-downsampler', PcmDownsampler);
`;

export function pcmWorkletUrl(): string {
  const blob = new Blob([PCM_WORKLET_SRC], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

export function int16ToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    bin += String.fromCharCode.apply(
      null,
      slice as unknown as number[],
    );
  }
  return btoa(bin);
}
