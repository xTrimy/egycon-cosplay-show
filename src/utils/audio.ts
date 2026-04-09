/**
 * Attaches a fade-id to each audio element so concurrent fades on the same
 * element automatically cancel each other — no external cancellation token needed.
 */
export type FadableAudio = HTMLAudioElement & { _fadeId?: number };
export type FadableElement = HTMLElement & { _opacityFadeId?: number };

export const CROSSFADE_MS = 3000;
export const VIDEO_CROSSFADE_MS = 1000;
// Idle videos longer than this will be cut off early (crossfade starts at MAX_IDLE_SECONDS)
export const MAX_IDLE_SECONDS = 120; // 2 minutes

/**
 * Linearly ramps `el.volume` from `from` to `to` over `durationMs`.
 * If another fade starts on the same element before this one finishes,
 * this fade stops silently (onDone is NOT called).
 */
export function fadeAudio(
  el: FadableAudio,
  from: number,
  to: number,
  durationMs: number,
  onDone?: () => void,
): void {
  const id = (el._fadeId = (el._fadeId ?? 0) + 1);
  const start = performance.now();
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  el.volume = clamp(from);

  const tick = () => {
    if (el._fadeId !== id) return; // superseded by a newer fade
    const t = Math.min((performance.now() - start) / durationMs, 1);
    el.volume = clamp(from + (to - from) * t);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      el.volume = clamp(to);
      onDone?.();
    }
  };
  requestAnimationFrame(tick);
}

/**
 * Linearly ramps `el.style.opacity` from `from` to `to` over `durationMs`.
 * Concurrent fades on the same element auto-cancel via `_opacityFadeId`.
 */
export function fadeOpacity(
  el: FadableElement,
  from: number,
  to: number,
  durationMs: number,
  onDone?: () => void,
): void {
  const id = (el._opacityFadeId = (el._opacityFadeId ?? 0) + 1);
  const start = performance.now();
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  el.style.opacity = String(clamp(from));

  const tick = () => {
    if (el._opacityFadeId !== id) return;
    const t = Math.min((performance.now() - start) / durationMs, 1);
    el.style.opacity = String(clamp(from + (to - from) * t));
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      el.style.opacity = String(clamp(to));
      onDone?.();
    }
  };
  requestAnimationFrame(tick);
}
