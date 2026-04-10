import { useEffect, useRef, useCallback } from 'react';
import { fadeOpacity, VIDEO_CROSSFADE_MS, MAX_IDLE_SECONDS, type FadableElement } from '../utils/audio';

interface IdleVideoPlayerProps {
  src: string | null;
  onEnded?: () => void;
}

/**
 * Two-video crossfade player for idle background videos.
 *
 * - Keeps two <video> elements stacked and alternates between them.
 * - The incoming video starts loading silently; the crossfade only begins after
 *   `canplay` fires, eliminating black-screen flashes from buffering.
 * - Uses `timeupdate` to trigger the next-video callback VIDEO_CROSSFADE_MS
 *   seconds before the end of the current video, so the transition is already
 *   underway when the outgoing video reaches its last frame.
 */
export function IdleVideoPlayer({ src, onEnded }: IdleVideoPlayerProps) {
  const refA = useRef<HTMLVideoElement>(null);
  const refB = useRef<HTMLVideoElement>(null);
  const activeSlotRef = useRef<'a' | 'b'>('a');
  const prevSrcRef = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  const getActive = useCallback(
    () => (activeSlotRef.current === 'a' ? refA.current : refB.current),
    [],
  );
  const getInactive = useCallback(
    () => (activeSlotRef.current === 'a' ? refB.current : refA.current),
    [],
  );

  useEffect(() => {
    if (src === prevSrcRef.current) return;
    prevSrcRef.current = src;

    const outgoing = getActive();
    const incoming = getInactive();
    if (!incoming) return;

    if (!src) {
      if (outgoing) {
        const from = parseFloat(outgoing.style.opacity || '0');
        fadeOpacity(outgoing as FadableElement, from, 0, VIDEO_CROSSFADE_MS, () => {
          outgoing.pause();
          outgoing.removeAttribute('src');
          outgoing.load();
        });
      }
      return;
    }

    let cancelled = false;
    let endCheckListener: (() => void) | null = null;

    // Load the incoming video invisibly so canplay fires when data is ready
    incoming.src = src;
    incoming.load();
    incoming.style.opacity = '0';

    const startCrossfade = () => {
      incoming.removeEventListener('canplay', startCrossfade);
      if (cancelled) return;

      activeSlotRef.current = activeSlotRef.current === 'a' ? 'b' : 'a';
      incoming.play().catch(() => {});
      fadeOpacity(incoming as FadableElement, 0, 1, VIDEO_CROSSFADE_MS);

      if (outgoing) {
        outgoing.loop = false; // stop any looping now that the replacement is ready
        const from = parseFloat(outgoing.style.opacity || '0');
        fadeOpacity(outgoing as FadableElement, from, 0, VIDEO_CROSSFADE_MS, () => {
          outgoing.pause();
          outgoing.removeAttribute('src');
          outgoing.load();
        });
      }

      // Loop short videos so they fill MAX_IDLE_SECONDS.
      // duration may be Infinity (common for WebM) at canplay time, so also
      // listen for durationchange which fires once the real value is known.
      const applyLoopIfShort = () => {
        if (isFinite(incoming.duration) && incoming.duration < MAX_IDLE_SECONDS) {
          incoming.loop = true;
        }
      };
      applyLoopIfShort();
      const handleDurationChange = () => { applyLoopIfShort(); };
      incoming.addEventListener('durationchange', handleDurationChange);

      // Fire onEnded once MAX_IDLE_SECONDS of wall-clock playtime has elapsed
      // (VIDEO_CROSSFADE_MS early so the crossfade overlaps the tail).
      const playStartMs = performance.now();
      const triggerMs = (MAX_IDLE_SECONDS - VIDEO_CROSSFADE_MS / 1000) * 1000;

      let triggered = false;
      const trigger = () => {
        if (triggered) return;
        triggered = true;
        incoming.removeEventListener('timeupdate', checkEnd);
        incoming.removeEventListener('ended', handleEnded);
        incoming.removeEventListener('durationchange', handleDurationChange);
        onEndedRef.current?.();
      };

      // Wall-clock check via timeupdate — handles looping short videos.
      const checkEnd = () => {
        if (triggered) return;
        if (performance.now() - playStartMs >= triggerMs) trigger();
      };

      // Separate ended handler — always triggers when the video finishes
      // naturally, regardless of duration value (works for WebM Infinity too).
      const handleEnded = () => trigger();

      endCheckListener = checkEnd;
      incoming.addEventListener('timeupdate', checkEnd);
      incoming.addEventListener('ended', handleEnded);
    };

    incoming.addEventListener('canplay', startCrossfade);

    return () => {
      cancelled = true;
      incoming.loop = false;
      incoming.removeEventListener('canplay', startCrossfade);
      if (endCheckListener) {
        incoming.removeEventListener('timeupdate', endCheckListener);
        incoming.removeEventListener('ended', endCheckListener);
      }
    };
  }, [src, getActive, getInactive]);

  return (
    <div className="absolute inset-0">
      <video
        ref={refA}
        className="absolute w-full h-full object-fill"
        style={{ opacity: 0 }}
        autoPlay
        playsInline
        muted
      />
      <video
        ref={refB}
        className="absolute w-full h-full object-fill"
        style={{ opacity: 0 }}
        autoPlay
        playsInline
        muted
      />
    </div>
  );
}

