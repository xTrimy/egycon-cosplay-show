import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { useCosplayer } from '../hooks/useCosplayer';
import { useIdleVideo } from '../hooks/useIdleVideo';
import { useIdleMusic } from '../hooks/useIdleMusic';
import { fadeAudio, CROSSFADE_MS, type FadableAudio } from '../utils/audio';
import { FrameOverlay } from './FrameOverlay';
import { CosplayerVideoPlayer } from './CosplayerVideoPlayer';
import { IdleVideoPlayer } from './IdleVideoPlayer';
import { CosplayerInfoDisplay } from './CosplayerInfo';
import { OperatorInput } from './OperatorInput';

interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
}

export function ShowStage() {
  const { cosplayer, loading, resolve, clear } = useCosplayer();
  const { idleVideoSrc, onIdleEnded } = useIdleVideo();
  const [stageMonitor, setStageMonitor] = useState<MonitorInfo | null>(null);
  const [mediaPaused, setMediaPaused] = useState(false);
  const [lastCosplayerInfo, setLastCosplayerInfo] = useState<{ number: number; name: string } | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const prevAudioSrcRef = useRef<string | null>(null);
  const audioTransitionGenRef = useRef(0);

  const isAudioOnly = cosplayer?.mediaType === 'audio';
  const isVideo = cosplayer?.mediaType === 'video';
  // Determined early so useEffects below can reference it
  const cosplayerVideoSrc = isVideo ? (cosplayer?.mediaPath ?? null) : null;

  // Idle music — suppressed whenever the cosplayer has their own audio/video
  const { skipTrack } = useIdleMusic(isVideo || isAudioOnly);

  // Reset pause state and persist info whenever cosplayer changes
  useEffect(() => {
    setMediaPaused(false);
    if (cosplayer) {
      setLastCosplayerInfo({ number: cosplayer.number, name: cosplayer.name });
    }
  }, [cosplayer?.number]);

  // Space bar toggles play/pause for cosplayer video and audio
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      // Don't interfere when the operator is typing in the input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (!isVideo && !isAudioOnly) return;
      e.preventDefault();
      setMediaPaused((p) => !p);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isVideo, isAudioOnly]);

  // Ctrl+Q clears the current cosplayer and returns to idle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ' && e.ctrlKey) {
        e.preventDefault();
        clear();
        setLastCosplayerInfo(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clear]);

  // Ctrl+ArrowRight skips the current background music track
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight' && e.ctrlKey) {
        e.preventDefault();
        skipTrack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [skipTrack]);

  // Drive the audio element when mediaPaused changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isAudioOnly) return;
    if (mediaPaused) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }, [mediaPaused, isAudioOnly]);

  // Determine cosplayer video src (only when mediaType is 'video')
  // (declared before the hooks above — see top of component)

  // Fetch stage monitor info once (for frame design guidance)
  useEffect(() => {
    invoke<MonitorInfo | null>('get_stage_monitor_info')
      .then((info) => setStageMonitor(info))
      .catch(() => {});
  }, []);

  // Handle audio-only cosplayer with crossfade in/out
  useEffect(() => {
    const audio = audioRef.current as FadableAudio | null;
    if (!audio) return;

    const newSrc = isAudioOnly ? (cosplayer?.mediaPath ?? null) : null;
    if (newSrc === prevAudioSrcRef.current) return;

    const hadSrc = prevAudioSrcRef.current !== null;
    prevAudioSrcRef.current = newSrc;
    const myGen = ++audioTransitionGenRef.current;

    const applyNew = () => {
      if (audioTransitionGenRef.current !== myGen) return;
      if (newSrc) {
        audio.src = newSrc;
        audio.load();
        audio.volume = 0;
        audio.play().catch(() => {});
        fadeAudio(audio, 0, 1, CROSSFADE_MS);
      }
    };

    if (hadSrc) {
      fadeAudio(audio, audio.volume, 0, CROSSFADE_MS, () => {
        if (audioTransitionGenRef.current !== myGen) return;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        applyNew();
      });
    } else {
      applyNew();
    }
  }, [isAudioOnly, cosplayer?.mediaPath]);

  // When cosplayer media ends naturally, return to idle (CosplayerVideoPlayer
  // fades its video out when src becomes null; audio crossfade handled by its useEffect)
  const handleMediaEnded = useCallback(() => {
    clear();
  }, [clear]);

  return (
    <div className="relative w-screen h-screen flex flex-col items-center justify-center overflow-hidden bg-black">
      {/* Full-screen decorative frame — top layer */}
      <FrameOverlay />

      {/* Hidden audio element for audio-only cosplayers */}
      <audio ref={audioRef} onEnded={handleMediaEnded} />

      {/* Cosplayer info overlay — persists in idle after media ends, cleared when new cosplayer submits */}
      <AnimatePresence mode="wait">
        {lastCosplayerInfo && (
          <motion.div
            key={lastCosplayerInfo.number}
            className="absolute top-[20%] left-1/2 -translate-x-1/2 z-200 flex flex-col items-center gap-[0.3em] pointer-events-none text-center w-full"
            initial={{ opacity: 0, y: 60, scale: 0.6, rotate: -4 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, y: -40, scale: 0.7, rotate: 3 }}
            transition={{
              opacity: { duration: 0.18, ease: 'easeOut' },
              y: { type: 'spring', stiffness: 500, damping: 22, mass: 0.8 },
              scale: { type: 'spring', stiffness: 450, damping: 18, mass: 0.7 },
              rotate: { type: 'spring', stiffness: 400, damping: 20 },
            }}
          >
            <CosplayerInfoDisplay number={lastCosplayerInfo.number} name={lastCosplayerInfo.name} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video area — positioned to match the transparent window in frame.png.
           Adjust left/top/w/h here if the frame design changes. */}
      <div className="absolute left-[5%] top-[37%] w-[90%] h-[34%] z-1 overflow-hidden">
   

        {/* Idle video — always running in the background with crossfade.
             Visible whenever no cosplayer video is overlaying it. */}
        <IdleVideoPlayer
          src={idleVideoSrc}
          onEnded={onIdleEnded}
        />

        {/* Cosplayer video — always mounted; CosplayerVideoPlayer crossfades on src change
             and fades out when src becomes null (cosplayer cleared). */}
        <CosplayerVideoPlayer
          src={cosplayerVideoSrc}
          paused={mediaPaused}
          onEnded={handleMediaEnded}
        />
      </div>

      {/* Operator input — bottom bar */}
      <OperatorInput
        onSubmit={resolve}
        disabled={loading}
        stageMonitor={stageMonitor}
      />
    </div>
  );
}

