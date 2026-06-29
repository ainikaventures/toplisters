/** Small country flag (flagcdn). iso2 lowercase, incl. gb-eng/gb-sct/gb-wls. */
export function Flag({ iso2, className }: { iso2: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${iso2}.png`}
      srcSet={`https://flagcdn.com/w80/${iso2}.png 2x`}
      alt=""
      width={22}
      height={16}
      loading="lazy"
      className={className ?? "h-4 w-[22px] shrink-0 rounded-[2px] object-cover ring-1 ring-foreground/10"}
    />
  );
}
