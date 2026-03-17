export default function DistrictMap() {
  return (
    <div className="h-[350px] w-full overflow-hidden rounded-xl ring-1 ring-black/10 dark:ring-white/6 sm:h-[420px]">
      <object
        data="/district-map.svg"
        type="image/svg+xml"
        className="h-full w-full"
        aria-label="Karta povezanosti zagrebačkih četvrti"
      >
        <div className="flex h-full w-full items-center justify-center bg-slate-900/90 text-sm text-slate-400">
          Karta povezanosti
        </div>
      </object>
    </div>
  )
}
