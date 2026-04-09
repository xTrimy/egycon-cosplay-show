import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

export function FrameOverlay() {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>('get_frame_path')
      .then((path) => {
        if (path) setFrameSrc(convertFileSrc(path, 'mediafile'));
      })
      .catch(() => {});
  }, []);

  if (!frameSrc) return null;

  return (
    <img
      className="absolute inset-0 w-full h-full object-fill pointer-events-none z-[100] select-none"
      src={frameSrc}
      alt=""
      aria-hidden="true"
    />
  );
}

