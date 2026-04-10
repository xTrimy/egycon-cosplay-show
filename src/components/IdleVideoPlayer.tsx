import { useEffect, useRef, useCallback } from 'react';
import { fadeOpacity, VIDEO_CROSSFADE_MS, MAX_IDLE_SECONDS, type FadableElement } from '../utils/audio';

interface IdleVideoPlayerProps {
  src: string | null;
  nextSrc?: string | null;
  playToken?: number;
  onEnded?: () => void;
}

/**
 * Two-video crossfade player for idle background videos.
 *
 * - Keeps two <video> elements stacked and alternates between them.
 * - Keeps the next idle clip preloaded in the inactive slot while the current
 *   clip is playing, so the crossfade can start on time.
 * - Uses a wall-clock timer to start the queued crossfade
 *   VIDEO_CROSSFADE_MS before MAX_IDLE_SECONDS.
 */
export function IdleVideoPlayer({ src, nextSrc = null, playToken = 0, onEnded }: IdleVideoPlayerProps) {
  const refA = useRef<HTMLVideoElement>(null);
  const refB = useRef<HTMLVideoElement>(null);
  const activeSlotRef = useRef<'a' | 'b'>('a');
  const activePlayKeyRef = useRef<string | null>(null);
  const queuedPlayKeyRef = useRef<string | null>(null);
  const queuedReadyKeyRef = useRef<string | null>(null);
  const triggerTimeoutRef = useRef<number | null>(null);
  const activeDurationCleanupRef = useRef<(() => void) | null>(null);
  const activeEndedCleanupRef = useRef<(() => void) | null>(null);
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

  const clearVideo = useCallback((video: HTMLVideoElement) => {
    video.pause();
    video.loop = false;
    video.removeAttribute('src');
    delete video.dataset.playKey;
    video.load();
    video.style.opacity = '0';
  }, []);

  const clearActiveTracking = useCallback(() => {
    if (triggerTimeoutRef.current !== null) {
      window.clearTimeout(triggerTimeoutRef.current);
      triggerTimeoutRef.current = null;
    }
    activeDurationCleanupRef.current?.();
    activeDurationCleanupRef.current = null;
    activeEndedCleanupRef.current?.();
    activeEndedCleanupRef.current = null;
  }, []);

  const startQueuedTransition = useCallback(() => {
    const outgoing = getActive();
    const incoming = getInactive();
    const queuedKey = queuedReadyKeyRef.current;

    if (!outgoing || !incoming || !queuedKey || incoming.dataset.playKey !== queuedKey) {
      return false;
    }

    clearActiveTracking();
    queuedReadyKeyRef.current = null;
    activeSlotRef.current = activeSlotRef.current === 'a' ? 'b' : 'a';
    activePlayKeyRef.current = queuedKey;

    incoming.currentTime = 0;
    incoming.play().catch(() => {});
    fadeOpacity(incoming as FadableElement, parseFloat(incoming.style.opacity || '0'), 1, VIDEO_CROSSFADE_MS);

    const syncLoopMode = () => {
      incoming.loop = !(isFinite(incoming.duration) && incoming.duration >= MAX_IDLE_SECONDS);
    };
    syncLoopMode();
    const handleDurationChange = () => {
      syncLoopMode();
    };
    incoming.addEventListener('durationchange', handleDurationChange);
    activeDurationCleanupRef.current = () => {
      incoming.removeEventListener('durationchange', handleDurationChange);
    };

    const currentPlayKey = queuedKey;
    const handleEnded = () => {
      if (activePlayKeyRef.current !== currentPlayKey) return;
      if (!startQueuedTransition()) {
        onEndedRef.current?.();
      }
    };
    incoming.addEventListener('ended', handleEnded);
    activeEndedCleanupRef.current = () => {
      incoming.removeEventListener('ended', handleEnded);
    };

    const triggerMs = Math.max((MAX_IDLE_SECONDS - VIDEO_CROSSFADE_MS / 1000) * 1000, 0);
    triggerTimeoutRef.current = window.setTimeout(() => {
      if (activePlayKeyRef.current !== currentPlayKey) return;
      if (!startQueuedTransition()) {
        onEndedRef.current?.();
      }
    }, triggerMs);

    outgoing.loop = false;
    fadeOpacity(outgoing as FadableElement, parseFloat(outgoing.style.opacity || '0'), 0, VIDEO_CROSSFADE_MS, () => {
      clearVideo(outgoing);
      onEndedRef.current?.();
    });

    return true;
  }, [clearActiveTracking, clearVideo, getActive, getInactive]);

  useEffect(() => {
    const playKey = `${src}::${playToken}`;
    if (playKey === activePlayKeyRef.current) return;

    const active = getActive();
    const inactive = getInactive();

    if (!src) {
      clearActiveTracking();
      activePlayKeyRef.current = null;
      queuedPlayKeyRef.current = null;
      queuedReadyKeyRef.current = null;
      if (active) {
        fadeOpacity(active as FadableElement, parseFloat(active.style.opacity || '0'), 0, VIDEO_CROSSFADE_MS, () => {
          clearVideo(active);
        });
      }
      if (inactive) {
        clearVideo(inactive);
      }
      return;
    }

    const target = inactive?.dataset.playKey === playKey ? inactive : active;
    const outgoing = target === active ? null : active;
    if (!target) return;

    let cancelled = false;

    const activateTarget = () => {
      if (cancelled) return;

      clearActiveTracking();
      activePlayKeyRef.current = playKey;
      if (target === inactive) {
        activeSlotRef.current = activeSlotRef.current === 'a' ? 'b' : 'a';
      }

      target.currentTime = 0;
      target.play().catch(() => {});
      fadeOpacity(target as FadableElement, parseFloat(target.style.opacity || '0'), 1, VIDEO_CROSSFADE_MS);

      const syncLoopMode = () => {
        target.loop = !(isFinite(target.duration) && target.duration >= MAX_IDLE_SECONDS);
      };
      syncLoopMode();
      const handleDurationChange = () => {
        syncLoopMode();
      };
      target.addEventListener('durationchange', handleDurationChange);
      activeDurationCleanupRef.current = () => {
        target.removeEventListener('durationchange', handleDurationChange);
      };

      const currentPlayKey = playKey;
      const handleEnded = () => {
        if (activePlayKeyRef.current !== currentPlayKey) return;
        if (!startQueuedTransition()) {
          onEndedRef.current?.();
        }
      };
      target.addEventListener('ended', handleEnded);
      activeEndedCleanupRef.current = () => {
        target.removeEventListener('ended', handleEnded);
      };

      const triggerMs = Math.max((MAX_IDLE_SECONDS - VIDEO_CROSSFADE_MS / 1000) * 1000, 0);
      triggerTimeoutRef.current = window.setTimeout(() => {
        if (activePlayKeyRef.current !== currentPlayKey) return;
        if (!startQueuedTransition()) {
          onEndedRef.current?.();
        }
      }, triggerMs);

      if (outgoing) {
        outgoing.loop = false;
        fadeOpacity(outgoing as FadableElement, parseFloat(outgoing.style.opacity || '0'), 0, VIDEO_CROSSFADE_MS, () => {
          clearVideo(outgoing);
        });
      }
    };

    if (target.dataset.playKey === playKey && target.readyState >= 2) {
      activateTarget();
      return;
    }

    target.style.opacity = '0';
    target.dataset.playKey = playKey;
    target.src = src;
    target.load();

    const handleCanPlay = () => {
      target.removeEventListener('canplay', handleCanPlay);
      activateTarget();
    };
    target.addEventListener('canplay', handleCanPlay);

    return () => {
      cancelled = true;
      target.removeEventListener('canplay', handleCanPlay);
    };
  }, [clearActiveTracking, clearVideo, getActive, getInactive, src, playToken, startQueuedTransition]);

  useEffect(() => {
    const nextPlayKey = nextSrc === null ? null : `${nextSrc}::${playToken + 1}`;
    if (nextPlayKey === queuedPlayKeyRef.current) return;

    queuedPlayKeyRef.current = nextPlayKey;
    queuedReadyKeyRef.current = null;

    const preload = getInactive();
    if (!preload) return;

    if (!nextSrc || !nextPlayKey || activePlayKeyRef.current === nextPlayKey) {
      if (preload.style.opacity === '0') {
        clearVideo(preload);
      }
      return;
    }

    let cancelled = false;
    const markReady = () => {
      if (cancelled) return;
      if (preload.dataset.playKey === nextPlayKey) {
        queuedReadyKeyRef.current = nextPlayKey;
      }
    };

    preload.pause();
    preload.style.opacity = '0';
    preload.loop = true;
    preload.dataset.playKey = nextPlayKey;
    preload.src = nextSrc;
    preload.load();

    if (preload.readyState >= 2) {
      markReady();
      return;
    }

    preload.addEventListener('canplay', markReady);
    return () => {
      cancelled = true;
      preload.removeEventListener('canplay', markReady);
    };
  }, [clearVideo, getInactive, nextSrc, playToken]);

  useEffect(() => () => {
    clearActiveTracking();
  }, [clearActiveTracking]);

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

