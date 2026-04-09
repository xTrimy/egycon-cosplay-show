import { useEffect, useRef, useCallback } from 'react';
import { fadeOpacity, VIDEO_CROSSFADE_MS, type FadableElement } from '../utils/audio';

interface CosplayerVideoPlayerProps {
  src: string | null;
  paused?: boolean;
  onEnded?: () => void;
}

/**
 * Two-video crossfade player for cosplayer videos.
 *
 * Two persistent <video> elements alternate as active/inactive slots.
 * When src changes the outgoing video keeps playing at its current
 * position (with audio intact) while the incoming video loads silently.
 * The crossfade only starts once `canplay` fires on the incoming video,
 * preventing black frames from buffering delays.
 *
 * When src becomes null the active video is faded out and unloaded.
 */
export function CosplayerVideoPlayer({ src, paused, onEnded }: CosplayerVideoPlayerProps) {
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

  // Handle src changes: keep old video playing while loading new one, then crossfade
  useEffect(() => {
    if (src === prevSrcRef.current) return;
    prevSrcRef.current = src;

    const outgoing = getActive();

    if (!src) {
      // No cosplayer — fade out current video
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
    const incoming = getInactive();
    if (!incoming) return;

    // Load new video invisibly; crossfade starts only when data is ready
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
    };
  }, [src, getActive, getInactive]);

  // Pause / resume the active slot
  useEffect(() => {
    const active = getActive();
    if (!active || !active.src) return;
    if (paused) {
      active.pause();
    } else {
      active.play().catch(() => {});
    }
  }, [paused, getActive]);

  // Only the active slot fires onEnded — guard against the fading-out slot
  const handleEndedA = useCallback(() => {
    if (activeSlotRef.current === 'a') onEndedRef.current?.();
  }, []);
  const handleEndedB = useCallback(() => {
    if (activeSlotRef.current === 'b') onEndedRef.current?.();
  }, []);

  return (
    <div className="absolute inset-0">
      <video
        ref={refA}
        className="absolute w-full h-full object-fill"
        style={{ opacity: 0 }}
        playsInline
        onEnded={handleEndedA}
      />
      <video
        ref={refB}
        className="absolute w-full h-full object-fill"
        style={{ opacity: 0 }}
        playsInline
        onEnded={handleEndedB}
      />
    </div>
  );
}
