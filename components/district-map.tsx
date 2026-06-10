import Image from "next/image"

export default function DistrictMap() {
  return (
    <div className="w-full overflow-hidden" style={{ aspectRatio: "960/620" }}>
      <Image
        src="/district-map.svg"
        alt="Karta povezanosti zagrebačkih kvartova. Zeleno označava bolju povezanost, ljubičasto slabiju."
        className="h-full w-full object-contain"
        width={960}
        height={620}
      />
    </div>
  )
}
