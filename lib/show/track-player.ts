export function createTrackPlayer() {
  let ctx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;

  function context() {
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
    }
    return ctx;
  }

  async function decode(file: File) {
    const audio = context();
    const bytes = await file.arrayBuffer();
    return audio.decodeAudioData(bytes.slice(0));
  }

  async function playAt(buffer: AudioBuffer, whenCtx: number, offsetSec = 0) {
    stop();
    const audio = context();
    await audio.resume();
    const offset = Math.min(Math.max(0, offsetSec), Math.max(0, buffer.duration - 0.01));
    source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start(Math.max(whenCtx, audio.currentTime), offset);
    return source;
  }

  function stop() {
    if (!source) return;
    try {
      source.stop();
    } catch {
      // already stopped
    }
    source.disconnect();
    source = null;
  }

  function now() {
    return context().currentTime;
  }

  async function resume() {
    await context().resume();
  }

  function close() {
    stop();
    if (ctx && ctx.state !== "closed") {
      void ctx.close();
    }
    ctx = null;
  }

  return { decode, playAt, stop, now, resume, close };
}
