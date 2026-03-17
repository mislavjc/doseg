export default function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#14141c]">
      <div className="text-center">
        <div className="loading-bar mx-auto mb-4 w-48 rounded-full" />
        <p className="text-[14px] text-slate-400">
          Izračunavam povezanost četvrti...
        </p>
        <p className="mt-1 text-[12px] text-slate-600">
          Ovo može potrajati minutu pri prvom pokretanju.
        </p>
      </div>
    </div>
  )
}
