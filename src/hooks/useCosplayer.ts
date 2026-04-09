import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { CosplayerInfo } from '../types';

interface UseCosplayerResult {
  cosplayer: CosplayerInfo | null;
  loading: boolean;
  error: string | null;
  resolve: (numberStr: string) => Promise<void>;
  clear: () => void;
}

export function useCosplayer(): UseCosplayerResult {
  const [cosplayer, setCosplayer] = useState<CosplayerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(async (numberStr: string) => {
    const trimmed = numberStr.trim();
    if (!trimmed) return;

    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num <= 0) {
      setError('Invalid cosplayer number');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const raw = await invoke<CosplayerInfo>('get_cosplayer_info', { number: num });
      const resolved: CosplayerInfo = {
        ...raw,
        mediaPath: raw.mediaPath ? convertFileSrc(raw.mediaPath, 'mediafile') : null,
      };
      setCosplayer(resolved);
    } catch (err) {
      setError(String(err));
      setCosplayer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setCosplayer(null);
    setError(null);
  }, []);

  return { cosplayer, loading, error, resolve, clear };
}
