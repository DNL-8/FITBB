export interface RestAlertPreferences {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const STORAGE_KEY = 'hunterfit_rest_alert_prefs_v1';

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new Ctor();
  }
  return sharedAudioContext;
}

export function loadRestAlertPreferences(): RestAlertPreferences {
  if (typeof window === 'undefined') {
    return { soundEnabled: true, vibrationEnabled: true };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { soundEnabled: true, vibrationEnabled: true };
    const parsed = JSON.parse(raw) as Partial<RestAlertPreferences>;
    return {
      soundEnabled: parsed.soundEnabled !== false,
      vibrationEnabled: parsed.vibrationEnabled !== false,
    };
  } catch {
    return { soundEnabled: true, vibrationEnabled: true };
  }
}

export function saveRestAlertPreferences(prefs: RestAlertPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export async function unlockRestAudio(): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.01);
  } catch {
    // Ignore Web Audio errors on restricted devices
  }
}

function playTone(
  ctx: AudioContext,
  frequencyHz: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain: number,
  type: OscillatorType = 'triangle'
): void {
  const start = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequencyHz, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(start + durationSec + 0.02);
}

export function triggerHapticPattern(pattern: number[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function triggerRestCompleteAlert(prefs: RestAlertPreferences): void {
  if (prefs.vibrationEnabled) {
    triggerHapticPattern([180, 90, 180, 90, 280]);
  }
  if (!prefs.soundEnabled) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        playTone(ctx, 523.25, 0.0, 0.16, 0.18, 'triangle');
        playTone(ctx, 659.25, 0.14, 0.18, 0.2, 'triangle');
        playTone(ctx, 783.99, 0.28, 0.28, 0.22, 'triangle');
      });
      return;
    }
    playTone(ctx, 523.25, 0.0, 0.16, 0.18, 'triangle');
    playTone(ctx, 659.25, 0.14, 0.18, 0.2, 'triangle');
    playTone(ctx, 783.99, 0.28, 0.28, 0.22, 'triangle');
  } catch {
    // Graceful fallback
  }
}

export function triggerPrFanfareAlert(prefs: RestAlertPreferences): void {
  if (prefs.vibrationEnabled) {
    triggerHapticPattern([120, 60, 220]);
  }
  if (!prefs.soundEnabled) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        playTone(ctx, 587.33, 0.0, 0.12, 0.16, 'sine');
        playTone(ctx, 880.0, 0.1, 0.22, 0.2, 'triangle');
      });
      return;
    }
    playTone(ctx, 587.33, 0.0, 0.12, 0.16, 'sine');
    playTone(ctx, 880.0, 0.1, 0.22, 0.2, 'triangle');
  } catch {
    // Graceful fallback
  }
}
