interface CosplayerInfoProps {
  number: number;
  name: string;
  numberFontSize?: string;
  nameFontSize?: string;
}

export function CosplayerInfoDisplay({ number, name, numberFontSize, nameFontSize }: CosplayerInfoProps) {
  return (
      <div className="flex flex-col items-center gap-[0.25em] font-avengeance w-full">
          <span className="font-bold text-stroke-5 text-white stroke-4 tracking-[0.08em]" style={numberFontSize ? { fontSize: numberFontSize } : undefined}>
        #{number}
      </span>
          <span className="font-extrabold text-stroke-5 leading-[0.8em] w-full" style={nameFontSize ? { fontSize: nameFontSize } : undefined}>
        {name}
      </span>
    </div>
  );
}
