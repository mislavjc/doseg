"use client"

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-[#14141c]">
      <div className="panel text-center">
        <div className="text-[15px] font-semibold text-slate-100">
          Something went wrong
        </div>
        <div className="mt-2 text-[12px] text-slate-400">
          The map failed to load. Please try again.
        </div>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-[13px] font-medium text-slate-200 transition-colors hover:bg-white/15"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
