export default function DistrictMap() {
  return (
    <div className="w-full overflow-hidden" style={{ aspectRatio: "960/620" }}>
      <object
        data="/district-map.svg"
        type="image/svg+xml"
        className="pointer-events-auto h-full w-full"
        aria-label="Karta povezanosti zagrebačkih četvrti"
      >
        <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
          Karta povezanosti
        </div>
      </object>
    </div>
  )
}
