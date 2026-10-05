import { MIN_FLASH_GAP_MS, type TimelineCue } from "./protocol";

export type BeatMap = {
  bpm: number;
  offsetMs: number;
  durationMs: number;
  beatsMs: number[];
};

const MIN_BPM = 70;
const MAX_BPM = 170;
const ONSET_GAP_MS = 280;

function mixMono(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) out[i] += data[i];
  }
  if (channels > 1) {
    const inv = 1 / channels;
    for (let i = 0; i < length; i += 1) out[i] *= inv;
  }
  return out;
}

function downsample(input: Float32Array, fromRate: number, toRate: number) {
  if (fromRate <= toRate) return { samples: input, sampleRate: fromRate };
  const step = fromRate / toRate;
  const length = Math.floor(input.length / step);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * step);
    const end = Math.min(input.length, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    samples[i] = sum / Math.max(1, end - start);
  }
  return { samples, sampleRate: toRate };
}

function highpass(samples: Float32Array) {
  const out = new Float32Array(samples.length);
  for (let i = 1; i < samples.length; i += 1) {
    out[i] = samples[i] - samples[i - 1];
  }
  return out;
}

function noveltyCurve(samples: Float32Array, hop: number) {
  const frames = Math.max(0, Math.floor((samples.length - hop) / hop));
  const energy = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const start = i * hop;
    let sum = 0;
    for (let j = 0; j < hop; j += 1) {
      const v = samples[start + j];
      sum += v * v;
    }
    energy[i] = Math.sqrt(sum / hop);
  }
  const novelty = new Float32Array(frames);
  for (let i = 1; i < frames; i += 1) {
    novelty[i] = Math.max(0, energy[i] - energy[i - 1]);
  }
  let max = 0;
  for (let i = 0; i < frames; i += 1) max = Math.max(max, novelty[i]);
  if (max > 0) {
    const inv = 1 / max;
    for (let i = 0; i < frames; i += 1) novelty[i] *= inv;
  }
  return novelty;
}

function mergeNovelty(a: Float32Array, b: Float32Array) {
  const length = Math.min(a.length, b.length);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = Math.max(a[i], b[i]);
  return out;
}

function percentile(values: Float32Array, p: number) {
  const copy = Array.from(values).sort((x, y) => x - y);
  if (copy.length === 0) return 0;
  const index = Math.min(copy.length - 1, Math.max(0, Math.round((copy.length - 1) * p)));
  return copy[index] ?? 0;
}

function pickOnsets(novelty: Float32Array, hopMs: number) {
  const threshold = Math.max(0.14, percentile(novelty, 0.86));
  const minHops = Math.max(1, Math.round(ONSET_GAP_MS / hopMs));
  const peaks: number[] = [];
  let last = -minHops;
  for (let i = 1; i < novelty.length - 1; i += 1) {
    if (novelty[i] < threshold) continue;
    if (novelty[i] < novelty[i - 1] || novelty[i] < novelty[i + 1]) continue;
    if (i - last < minHops) {
      if (novelty[i] > novelty[last]) {
        peaks[peaks.length - 1] = i * hopMs;
        last = i;
      }
      continue;
    }
    peaks.push(i * hopMs);
    last = i;
  }
  return peaks;
}

function estimateBpm(novelty: Float32Array, hopMs: number) {
  const minLag = Math.round(60_000 / MAX_BPM / hopMs);
  const maxLag = Math.round(60_000 / MIN_BPM / hopMs);
  let bestLag = minLag;
  let bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let i = 0; i + lag < novelty.length; i += 1) {
      score += novelty[i] * novelty[i + lag];
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  let bpm = 60_000 / (bestLag * hopMs);
  if (bpm < 85) {
    const doubled = bpm * 2;
    if (doubled <= MAX_BPM) bpm = doubled;
  } else if (bpm > 155) {
    const halved = bpm / 2;
    if (halved >= MIN_BPM) bpm = halved;
  }
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm * 10) / 10));
}

function estimateOffsetMs(novelty: Float32Array, hopMs: number, intervalMs: number) {
  const intervalHops = Math.max(1, Math.round(intervalMs / hopMs));
  let bestOffset = 0;
  let bestScore = -1;
  for (let offset = 0; offset < intervalHops; offset += 1) {
    let score = 0;
    let count = 0;
    for (let i = offset; i < novelty.length; i += intervalHops) {
      score += novelty[i];
      count += 1;
    }
    if (count > 0) score /= count;
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return bestOffset * hopMs;
}

function gridBeats(novelty: Float32Array, hopMs: number, intervalMs: number, offsetMs: number, durationMs: number) {
  const windowHops = Math.max(1, Math.round(80 / hopMs));
  const beats: number[] = [];
  for (let t = offsetMs; t < durationMs - 40; t += intervalMs) {
    const center = Math.round(t / hopMs);
    let peakIndex = center;
    let peak = -1;
    const from = Math.max(0, center - windowHops);
    const to = Math.min(novelty.length - 1, center + windowHops);
    for (let i = from; i <= to; i += 1) {
      if (novelty[i] > peak) {
        peak = novelty[i];
        peakIndex = i;
      }
    }
    beats.push(peak > 0.1 ? peakIndex * hopMs : t);
  }
  return beats;
}

function decimate(beats: number[], minGap: number) {
  const out: number[] = [];
  let last = -Infinity;
  for (const beat of beats) {
    if (beat - last >= minGap) {
      out.push(Math.round(beat));
      last = beat;
    }
  }
  return out;
}

export function detectBeatsFromMono(samples: Float32Array, sampleRate: number): BeatMap {
  const hop = 512;
  const hopMs = (hop / sampleRate) * 1000;
  const low = noveltyCurve(samples, hop);
  const high = noveltyCurve(highpass(samples), hop);
  const novelty = mergeNovelty(low, high);
  const bpm = estimateBpm(novelty, hopMs);
  const intervalMs = 60_000 / bpm;
  const offsetMs = estimateOffsetMs(novelty, hopMs, intervalMs);
  const durationMs = (samples.length / sampleRate) * 1000;
  const onsets = pickOnsets(novelty, hopMs);
  const expected = durationMs / intervalMs;
  const beatsMs =
    onsets.length >= Math.max(8, expected * 0.35)
      ? decimate(onsets, MIN_FLASH_GAP_MS)
      : decimate(gridBeats(novelty, hopMs, intervalMs, offsetMs, durationMs), MIN_FLASH_GAP_MS);
  return {
    bpm,
    offsetMs: Math.round(offsetMs),
    durationMs: Math.round(durationMs),
    beatsMs,
  };
}

export function detectBeats(buffer: AudioBuffer): BeatMap {
  const mixed = mixMono(buffer);
  const { samples, sampleRate } = downsample(mixed, buffer.sampleRate, 22050);
  return detectBeatsFromMono(samples, sampleRate);
}

export function beatsToCues(beatsMs: number[]): TimelineCue[] {
  return beatsMs.map((atMs) => ({ atMs, onMs: 120 }));
}
