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

    // Load the incoming video invisibly so canplay fires when data is ready
    incoming.src = src;
    incoming.load();
    incoming.style.opacity = '0';

    // Fire onEnded VIDEO_CROSSFADE_MS before the video ends — OR when the video
    // reaches MAX_IDLE_SECONDS — whichever comes first.
    let earlyTriggered = false;
    const tryEarlyEnd = () => {
      if (earlyTriggered || !isFinite(incoming.duration)) return;
      const remaining = incoming.duration - incoming.currentTime;
      const cappedRemaining = Math.min(incoming.duration, MAX_IDLE_SECONDS) - incoming.currentTime;
      if (remaining <= VIDEO_CROSSFADE_MS / 1000 || cappedRemaining <= VIDEO_CROSSFADE_MS / 1000) {
        earlyTriggered = true;
        incoming.removeEventListener('timeupdate', tryEarlyEnd);
        incoming.removeEventListener('ended', tryEarlyEnd);
        onEndedRef.current?.();
      }
    };
    incoming.addEventListener('timeupdate', tryEarlyEnd);
    // Fallback for clips shorter than VIDEO_CROSSFADE_MS
    incoming.addEventListener('ended', tryEarlyEnd);

    const startCrossfade = () => {
      incoming.removeEventListener('canplay', startCrossfade);
      if (cancelled) return;

      activeSlotRef.current = activeSlotRef.current === 'a' ? 'b' : 'a';
      incoming.play().catch(() => {});
      fadeOpacity(incoming as FadableElement, 0, 1, VIDEO_CROSSFADE_MS);

      if (outgoing) {
        const from = parseFloat(outgoing.style.opacity || '0');
        fadeOpacity(outgoing as FadableElement, from, 0, VIDEO_CROSSFADE_MS, () => {
          outgoing.pause();
          outgoing.removeAttribute('src');
          outgoing.load();
        });
      }
    };

    incoming.addEventListener('canplay', startCrossfade);

    return () => {
      cancelled = true;
      incoming.removeEventListener('canplay', startCrossfade);
      incoming.removeEventListener('timeupdate', tryEarlyEnd);
      incoming.removeEventListener('ended', tryEarlyEnd);
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

