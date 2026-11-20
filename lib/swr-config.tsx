"use client"

import { SWRConfig } from "swr"

import { responseJson } from "./json"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {throw new Error("Podaci nisu dostupni")}
  return responseJson<unknown>(res)
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
