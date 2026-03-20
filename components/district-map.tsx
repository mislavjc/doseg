/* eslint-disable @next/next/no-img-element */
export default function DistrictMap() {
  return (
    <div className="w-full overflow-hidden" style={{ aspectRatio: "960/620" }}>
      <img
        src="/district-map.svg"
        alt="Karta povezanosti zagrebačkih četvrti. Zeleno označava bolju povezanost, ljubičasto slabiju."
        className="h-full w-full object-contain"
      />
    </div>
  )
}
