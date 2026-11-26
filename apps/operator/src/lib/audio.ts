// Chimes made in code (WebAudio, no audio files), adapted from ../TouchPadel lib/audio.ts.
// Browsers only allow sound after one tap on the page: armAudio() must run inside a click
// handler there. Electron allows it without a gesture, so arming succeeds on mount and the
// "Turn on sound" button never shows.
import { useCallback, useEffect, useState } from 'react';

export type ChimeKind = 'arrive' | 'overdue';

interface Note {
  freq: number;
  /** Seconds after the start. */
  at: number;
  dur: number;
  gain: number;
}

const PATTERNS: Record<ChimeKind, Note[]> = {
  // E5 then G5: something new.
  arrive: [
    { freq: 659.25, at: 0, dur: 0.18, gain: 0.25 },
    { freq: 783.99, at: 0.17, dur: 0.18, gain: 0.25 },
  ],
  // C5 three times, louder: still waiting.
  overdue: [
    { freq: 523.25, at: 0, dur: 0.14, gain: 0.45 },
    { freq: 523.25, at: 0.2, dur: 0.14, gain: 0.45 },
    { freq: 523.25, at: 0.4, dur: 0.14, gain: 0.45 },
  ],
};

let ctx: AudioContext | null = null;
let armed = false;
const listeners = new Set<(armed: boolean) => void>();

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function setArmed(v: boolean) {
  if (armed === v) return;
  armed = v;
  for (const l of listeners) l(v);
}

function playNotes(ac: AudioContext, notes: readonly Note[]) {
  const t0 = ac.currentTime + 0.01;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.freq;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(n.gain, t0 + n.at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}

/** Play a chime. Does nothing until sound is armed or when audio is unavailable. */
export function chime(kind: ChimeKind): void {
  if (!armed) return;
  const ac = getCtx();
  if (!ac || ac.state !== 'running') return;
  try {
    playNotes(ac, PATTERNS[kind]);
  } catch {
    /* sound is best effort */
  }
}

/** Create or resume the audio context. In a browser, call it from a click handler. */
export async function armAudio(): Promise<boolean> {
  const ac = getCtx();
  if (!ac) return false;
  try {
    if (ac.state !== 'running') await ac.resume();
  } catch {
    /* checked below */
  }
  if (ac.state !== 'running') return false;
  setArmed(true);
  return true;
}

/** Whether sound is on, and a click handler that turns it on. Tries once on mount (Electron). */
export function useAudioArming(): { armed: boolean; arm: () => void } {
  const [state, set] = useState(armed);
  useEffect(() => {
    listeners.add(set);
    set(armed);
    if (!armed) void armAudio();
    return () => {
      listeners.delete(set);
    };
  }, []);
  const arm = useCallback(() => void armAudio(), []);
  return { armed: state, arm };
}
