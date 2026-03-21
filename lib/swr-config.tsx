"use client"

import { SWRConfig } from "swr"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const error = new Error("Podaci nisu dostupni")
    throw error
  }
  return res.json()
}

export default function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        errorRetryCount: 2,
        dedupingInterval: 5000,
      }}
    >
      {children}
    </SWRConfig>
  )
}
