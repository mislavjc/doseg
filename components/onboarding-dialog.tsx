"use client"

import { Dialog } from "@base-ui/react/dialog"
import { m, AnimatePresence } from "motion/react"

const ease = [0.23, 1, 0.32, 1] as const

const rings = [
  { color: "#22c55e", opacity: 0.5, r: 18 },
  { color: "#0891b2", opacity: 0.4, r: 32 },
  { color: "#2563eb", opacity: 0.35, r: 46 },
  { color: "#9333ea", opacity: 0.25, r: 60 },
]

const gridLines = [40, 60, 80, 100, 120]

function IsochroneIllustration() {
  return (
    <div className="flex items-center justify-center py-6">
      <svg width="160" height="160" viewBox="0 0 160 160" fill="none">
        {gridLines.map((v) => (
          <g key={v}>
            <line x1="20" y1={v} x2="140" y2={v} stroke="rgba(255,255,255,0.03)" />
            <line x1={v} y1="20" x2={v} y2="140" stroke="rgba(255,255,255,0.03)" />
          </g>
        ))}
        {rings.map((ring, i) => (
          <m.circle
            key={ring.r}
            cx="80"
            cy="80"
            r={ring.r}
            fill="none"
            stroke={ring.color}
            strokeWidth="1.5"
            strokeOpacity={ring.opacity}
            initial={{ r: 0, opacity: 0 }}
            animate={{ r: ring.r, opacity: 1 }}
            transition={{ delay: 0.25 + i * 0.12, duration: 0.45, ease }}
          />
        ))}
        <m.circle
          cx="80" cy="80" r="12" fill="rgba(34,197,94,0.1)"
          initial={{ r: 0 }} animate={{ r: 12 }}
          transition={{ delay: 0.2, duration: 0.4, ease }}
        />
        <m.circle
          cx="80" cy="80" r="4" fill="white" stroke="#22c55e" strokeWidth="2"
          initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.3, ease }}
        />
      </svg>
    </div>
  )
}

function StepRow({ n, children, delay }: { n: string; children: React.ReactNode; delay: number }) {
  return (
    <m.div
      className="flex items-start gap-3"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease }}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-semibold text-slate-400">
        {n}
      </span>
      <span className="text-[13px] leading-snug text-slate-400">{children}</span>
    </m.div>
  )
}

function OnboardingContent() {
  return (
    <>
      <div className="rounded-t-[10px] bg-white/[0.02]">
        <IsochroneIllustration />
      </div>

      <div className="px-5 pt-4 pb-4">
        <Dialog.Title className="text-center text-[15px] font-semibold text-white">
          Dokle seže Zagreb?
        </Dialog.Title>
        <Dialog.Description className="mt-1.5 text-center text-[13px] leading-snug text-slate-400">
          Doseg pokazuje koliko daleko možeš stići javnim prijevozom iz bilo
          koje točke u gradu — prema stvarnom voznom redu ZET-a.
        </Dialog.Description>

        <div className="mt-4 flex flex-col gap-2.5">
          <StepRow n="1" delay={0.55}>
            <span className="text-slate-300">Klikni polazište</span> na karti
          </StepRow>
          <StepRow n="2" delay={0.63}>
            Obojene linije pokažu doseg u{" "}
            <span className="text-emerald-400">15</span>,{" "}
            <span className="text-cyan-400">30</span> i{" "}
            <span className="text-blue-400">45 min</span>
          </StepRow>
          <StepRow n="3" delay={0.71}>
            <span className="text-slate-300">Klikni odredište</span> za detalje rute
          </StepRow>
        </div>
        <p className="mt-3 text-center text-[11px] leading-snug text-slate-500">
          Rute koriste tramvaje i buseve prema ZET voznom redu.
          <br />
          Uključi <span className="text-amber-400/80">+ BAJS</span> za opciju gradskog bicikla.
        </p>
      </div>

      <div className="px-5 pb-4">
        <Dialog.Close className="w-full rounded-lg bg-emerald-500/15 py-2.5 text-[13px] font-medium text-emerald-400 transition-[background-color,transform] duration-160 ease-out hover:bg-emerald-500/25 active:scale-[0.97]">
          Istraži kartu
        </Dialog.Close>
      </div>
    </>
  )
}

function DialogPortalContent() {
  return (
    <Dialog.Portal keepMounted>
      <Dialog.Backdrop
        render={
          <m.div
            className="fixed inset-0 z-50 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease }}
          />
        }
      />
      <Dialog.Popup
        render={
          <m.div
            className="panel fixed top-1/2 left-1/2 z-50 w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-0 will-change-transform"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: 0.97,
              transition: { duration: 0.15, ease },
            }}
            transition={{ duration: 0.25, ease }}
          />
        }
      >
        <OnboardingContent />
      </Dialog.Popup>
    </Dialog.Portal>
  )
}

export function OnboardingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <AnimatePresence>
        {open && <DialogPortalContent />}
      </AnimatePresence>
    </Dialog.Root>
  )
}
