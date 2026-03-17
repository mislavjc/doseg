export default function DistrictMap() {
  return (
    <div className="w-full aspect-960/620 overflow-hidden">
      <object
        data="/district-map.svg"
        type="image/svg+xml"
        className="h-full w-full pointer-events-auto"
        aria-label="Karta povezanosti zagrebačkih četvrti"
      >
        <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
          Karta povezanosti
        </div>
      </object>
    </div>
  )
}
