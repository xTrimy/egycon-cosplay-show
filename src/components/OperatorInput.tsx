import { useState, useRef } from 'react';

interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
}

interface OperatorInputProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  stageMonitor?: MonitorInfo | null;
}

export function OperatorInput({ onSubmit, disabled, stageMonitor }: OperatorInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setValue('');
      }
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-200 flex items-center justify-center gap-3 px-8 py-[0.6em] backdrop-blur-[6px] border-t border-white/8">
  
      <input
        ref={inputRef}
        className="bg-white/8 border border-white/18 rounded-md text-white text-base px-3 py-[0.35em] w-55 outline-none transition-colors duration-200 caret-yellow-400 placeholder:text-white/30 focus:border-yellow-400/60 focus:bg-white/12 disabled:opacity-40 disabled:cursor-not-allowed"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Enter number and press Enter"
        autoFocus
      />
      {stageMonitor && (
        <span
          className="text-[0.42rem] text-white/10 whitespace-nowrap tracking-[0.04em] ml-2 tabular-nums"
          title={`Monitor: ${stageMonitor.name}`}
        >
          Frame canvas: {stageMonitor.width}&times;{stageMonitor.height}px
        </span>
      )}
    </div>
  );
}

