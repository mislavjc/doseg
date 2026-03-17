"use client"

import dynamic from "next/dynamic"

const DistrictMap = dynamic(() => import("@/components/district-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] w-full rounded-xl bg-white/[0.02] sm:h-[420px]" />
  ),
})

export default function DistrictMapLazy({
  geojson,
}: {
  geojson: GeoJSON.FeatureCollection
}) {
  return <DistrictMap geojson={geojson} />
}
