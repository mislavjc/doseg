"use client"

import { useState, useEffect } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { motion, AnimatePresence } from "motion/react"

const STORAGE_KEY = "doseg-onboarded"
const ease = [0.23, 1, 0.32, 1] as const

const rings = [
  { color: "#22c55e", opacity: 0.5, r: 18 },
  { color: "#0891b2", opacity: 0.4, r: 32 },
  { color: "#2563eb", opacity: 0.35, r: 46 },
  { color: "#9333ea", opacity: 0.25, r: 60 },
]

const labels = [
  { label: "15 min", y: 56, color: "#22c55e" },
  { label: "30 min", y: 42, color: "#0891b2" },
  { label: "45 min", y: 28, color: "#2563eb" },
]

const gridLines = [40, 60, 80, 100, 120]

function IsochroneIllustration() {
  return (
    <div className="flex items-center justify-center py-6">
      <svg width="160" height="160" viewBox="0 0 160 160" fill="none">
        {gridLines.map((v) => (
          <g key={v}>
            <line
              x1="20"
              y1={v}
              x2="140"
              y2={v}
              stroke="rgba(255,255,255,0.03)"
            />
            <line
              x1={v}
              y1="20"
              x2={v}
              y2="140"
              stroke="rgba(255,255,255,0.03)"
            />
          </g>
        ))}
        {rings.map((ring, i) => (
          <motion.circle
            key={i}
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
        <motion.circle
          cx="80"
          cy="80"
          r="12"
          fill="rgba(34,197,94,0.1)"
          initial={{ r: 0 }}
          animate={{ r: 12 }}
          transition={{ delay: 0.2, duration: 0.4, ease }}
        />
        <motion.circle
          cx="80"
          cy="80"
          r="4"
          fill="white"
          stroke="#22c55e"
          strokeWidth="2"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.3, ease }}
        />
        {labels.map((t, i) => (
          <motion.text
            key={i}
            x="80"
            y={t.y}
            textAnchor="middle"
            fill={t.color}
            fontSize="8"
            fontWeight="500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ delay: 0.4 + i * 0.12, duration: 0.3 }}
          >
            {t.label}
          </motion.text>
        ))}
      </svg>
    </div>
  )
}

export function OnboardingDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setOpen(true)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1")
    setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={dismiss}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              render={
                <motion.div
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
                <motion.div
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
              <div className="rounded-t-[10px] bg-white/[0.02]">
                <IsochroneIllustration />
              </div>

              <div className="px-5 pt-4 pb-4">
                <Dialog.Title className="text-center text-[15px] font-semibold text-white">
                  Klikni bilo gdje na karti
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-center text-[13px] leading-snug text-slate-400">
                  Obojene linije pokazuju dokle možeš stići tramvajem i busom u
                  15, 30 ili 45 minuta.
                </Dialog.Description>

                <div className="mt-4 flex flex-col gap-2">
                  <motion.div
                    className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3.5 py-3"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.25, ease }}
                  >
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="inline-flex h-[20px] items-center rounded-[4px] bg-[#e11d48] px-1.5 text-[10px] font-semibold text-white">
                        4
                      </span>
                      <span className="inline-flex h-[20px] items-center rounded-[4px] bg-white/[0.08] px-1.5 text-[10px] font-medium text-slate-400">
                        Hod
                      </span>
                      <span className="ml-0.5 text-[12px] font-semibold text-slate-300 tabular-nums">
                        23 min
                      </span>
                    </div>
                    <span className="text-[11px] leading-snug text-slate-500">
                      Pomakni miš za detalje rute
                    </span>
                  </motion.div>

                  <motion.div
                    className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3.5 py-3"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.68, duration: 0.25, ease }}
                  >
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="flex flex-col items-center">
                        <div className="relative h-[15px] overflow-hidden">
                          <motion.div
                            initial={{ y: 0 }}
                            animate={{ y: -15 }}
                            transition={{ delay: 1.2, duration: 0.4, ease }}
                          >
                            <span className="block h-[15px] text-[12px] leading-[15px] text-slate-400 tabular-nums">
                              08:30
                            </span>
                            <span className="block h-[15px] text-[12px] leading-[15px] text-slate-200 tabular-nums">
                              14:00
                            </span>
                          </motion.div>
                        </div>
                        <span className="text-[8px] text-slate-600">
                          polazak
                        </span>
                      </div>
                      <div className="w-[60px]">
                        <div
                          className="h-[3px] rounded-full"
                          style={{
                            background:
                              "linear-gradient(to right, #16a34a, #0891b2, #2563eb, #9333ea)",
                          }}
                        />
                        <div className="mt-px flex justify-between text-[7px] text-slate-600 tabular-nums">
                          <span>0</span>
                          <span>15</span>
                          <span>30</span>
                          <span>45</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] leading-snug text-slate-500">
                      Promijeni vrijeme polaska
                    </span>
                  </motion.div>
                </div>
              </div>

              <div className="px-5 pb-4">
                <Dialog.Close className="w-full rounded-lg bg-emerald-500/15 py-2.5 text-[13px] font-medium text-emerald-400 transition-[background-color,transform] duration-160 ease-out hover:bg-emerald-500/25 active:scale-[0.97]">
                  Pokaži kartu
                </Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
