import { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  src: string | null;
  onEnded?: () => void;
  onCanPlay?: () => void;
  hidden?: boolean;
  paused?: boolean;
}

export function VideoPlayer({ src, onEnded, onCanPlay, hidden, paused }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevSrcRef = useRef<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (src !== prevSrcRef.current) {
      prevSrcRef.current = src;
      if (src) {
        video.src = src;
        video.load();
        video.play().catch(() => {
          // Autoplay may be blocked in some environments — silently ignore
        });
      } else {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    }
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.src) return;
    if (paused) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [paused]);

  return (
    <video
      ref={videoRef}
      className={`absolute w-full h-full object-fill ${hidden ? ' hidden' : ''}`}
      onEnded={onEnded}
      onCanPlay={onCanPlay}
      autoPlay
      playsInline
    />
  );
}
