interface CosplayerInfoProps {
  number: number;
  name: string;
}

export function CosplayerInfoDisplay({ number, name }: CosplayerInfoProps) {
  return (
      <div className="flex flex-col items-center gap-[0.25em] font-avengeance w-full">
          <span className="text-[clamp(5rem,6vw,3rem)]  font-bold text-stroke-5 text-white stroke-4 tracking-[0.08em]">
        #{number}
      </span>
          <span className="text-[clamp(3rem,6vw,3rem)] font-extrabold text-stroke-5 leading-[0.65em] w-full">
        {name}
      </span>
    </div>
  );
}
