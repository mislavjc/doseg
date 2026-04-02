"use client"

import { Dialog } from "@base-ui/react/dialog"
import { m, AnimatePresence } from "motion/react"

const ease = [0.23, 1, 0.32, 1] as const

/** Same ramp as `ISOCHRONE_LINE_COLORS` / walk-area layers in `transit-map.tsx` */
const ISOCHRONE_BANDS = [
  { r: 54, color: "#7b68b8" },
  { r: 41, color: "#2d7ec4" },
  { r: 29, color: "#16949e" },
  { r: 16, color: "#1a7a52" },
] as const

const gridLines = [40, 60, 80, 100, 120]

const gridStroke = "rgba(15, 23, 42, 0.07)"

/** Slightly irregular closed path that mimics smoothed walk-area polygons. */
function blobPath(
  cx: number,
  cy: number,
  baseR: number,
  phase: number
): string {
  const segments = 40
  const parts: string[] = []
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const wobble =
      1 +
      0.1 * Math.sin(t * 3 + phase) +
      0.06 * Math.cos(t * 5 + phase * 1.3) +
      0.04 * Math.sin(t * 7 + phase * 0.7)
    const r = baseR * wobble
    const x = cx + Math.cos(t) * r
    const y = cy + Math.sin(t) * r
    parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  parts.push("Z")
  return parts.join(" ")
}

/** Pre-computed blob paths for each band (all inputs are constants). */
const BLOB_PATHS = ISOCHRONE_BANDS.map((band) => blobPath(80, 80, band.r, 0.65))

function IsochroneIllustration() {
  return (
    <div className="flex items-center justify-center py-6">
      <svg
        width="160"
        height="160"
        viewBox="0 0 160 160"
        fill="none"
        role="img"
        aria-labelledby="onboarding-iso-label"
      >
        <title id="onboarding-iso-label">Ilustracija dosega u minutama</title>
        {gridLines.map((v) => (
          <g key={v}>
            <line x1="20" y1={v} x2="140" y2={v} stroke={gridStroke} />
            <line x1={v} y1="20" x2={v} y2="140" stroke={gridStroke} />
          </g>
        ))}
        {ISOCHRONE_BANDS.map((band, i) => (
          <m.path
            key={band.r}
            d={BLOB_PATHS[i]}
            fill={band.color}
            stroke={band.color}
            strokeWidth={1.35}
            strokeOpacity={0.55}
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.18 + i * 0.1, duration: 0.5, ease }}
          />
        ))}
        <m.circle
          cx="80"
          cy="80"
          r="4"
          fill="#ffffff"
          stroke="#1a7a52"
          strokeWidth="2"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.32, ease }}
        />
      </svg>
    </div>
  )
}

function StepRow({
  n,
  children,
  delay,
}: {
  n: string
  children: React.ReactNode
  delay: number
}) {
  return (
    <m.div
      className="flex items-start gap-3"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease }}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
        {n}
      </span>
      <span className="text-[13px] leading-snug text-muted-foreground">
        {children}
      </span>
    </m.div>
  )
}

function OnboardingContent() {
  return (
    <>
      <div className="rounded-t-[10px] bg-muted/35">
        <IsochroneIllustration />
      </div>

      <div className="px-5 pt-4 pb-4">
        <Dialog.Title className="text-center text-[15px] font-semibold text-foreground">
          Dokle seže Zagreb?
        </Dialog.Title>
        <Dialog.Description className="mt-1.5 text-center text-[13px] leading-snug text-muted-foreground">
          Doseg pokazuje koliko daleko možeš stići javnim prijevozom iz bilo
          koje točke u gradu — prema stvarnom voznom redu ZET-a.
        </Dialog.Description>

        <div className="mt-4 flex flex-col gap-2.5">
          <StepRow n="1" delay={0.55}>
            <span className="font-medium text-foreground">
              Klikni polazište
            </span>{" "}
            na karti
          </StepRow>
          <StepRow n="2" delay={0.63}>
            Obojene zone pokažu doseg u{" "}
            <span className="font-medium text-[#16949e]">15</span>,{" "}
            <span className="font-medium text-[#2d7ec4]">30</span> i{" "}
            <span className="font-medium text-[#7b68b8]">45 min</span>
          </StepRow>
          <StepRow n="3" delay={0.71}>
            <span className="font-medium text-foreground">
              Klikni odredište
            </span>{" "}
            za detalje rute
          </StepRow>
        </div>
        <p className="mt-3 text-center text-[11px] leading-snug text-muted-foreground">
          Rute koriste tramvaje i buseve prema ZET voznom redu.
          <br />
          Uključi <span className="font-medium text-amber-700">+ BAJS</span> za
          opciju gradskog bicikla.
        </p>
      </div>

      <div className="px-5 pb-4">
        <Dialog.Close className="w-full rounded-full bg-emerald-600 py-2.5 text-[13px] font-medium text-white shadow-sm transition-[background-color,transform,box-shadow] duration-160 ease-out hover:bg-emerald-700 hover:shadow active:scale-[0.97]">
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

export function OnboardingDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <AnimatePresence>{open && <DialogPortalContent />}</AnimatePresence>
    </Dialog.Root>
  )
}
