"use client"

import { useState } from "react"
import useSWR from "swr"
import { m, AnimatePresence } from "motion/react"

interface AlertActivePeriod {
  start: number | null
  end: number | null
}

interface Alert {
  activePeriods: AlertActivePeriod[]
  affectedRouteIds: string[]
  affectedStopIds: string[]
  cause: string
  effect: string
  headerText: string | null
  descriptionText: string | null
}

const EFFECT_LABELS: Record<string, string> = {
  NO_SERVICE: "Bez prometa",
  REDUCED_SERVICE: "Smanjen promet",
  SIGNIFICANT_DELAYS: "Značajna kašnjenja",
  DETOUR: "Obilazak",
  ADDITIONAL_SERVICE: "Dodatni promet",
  MODIFIED_SERVICE: "Izmijenjeni promet",
  STOP_MOVED: "Premješteno stajalište",
  ACCESSIBILITY_ISSUE: "Problem pristupačnosti",
  OTHER_EFFECT: "Obavijest",
  UNKNOWN_EFFECT: "Obavijest",
  NO_EFFECT: "Obavijest",
}

function effectLabel(effect: string): string {
  return EFFECT_LABELS[effect] ?? "Obavijest"
}

function WarningIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function AlertText({ alert }: { alert: Alert }) {
  return (
    <p className="text-[12px] leading-tight text-amber-100">
      <span className="font-semibold text-amber-300">
        {effectLabel(alert.effect)}
      </span>
      {alert.headerText && (
        <span className="text-amber-100/80">
          {": "}
          {alert.headerText}
        </span>
      )}
    </p>
  )
}

function ExpandedAlerts({ alerts, onCollapse }: { alerts: Alert[]; onCollapse: () => void }) {
  return (
    <m.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-1.5 flex flex-col gap-1">
        {alerts.slice(1).map((alert) => (
          <AlertText key={`${alert.effect}-${alert.headerText}`} alert={alert} />
        ))}
      </div>
      <button
        type="button"
        className="mt-1 text-[11px] font-medium text-amber-400 underline decoration-amber-400/40 underline-offset-2 hover:text-amber-300"
        onClick={onCollapse}
      >
        Prikaži manje
      </button>
    </m.div>
  )
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      className="-mr-1 -mt-0.5 rounded-md p-1 text-amber-400/60 transition-colors hover:bg-amber-400/10 hover:text-amber-300"
      onClick={onDismiss}
      aria-label="Zatvori upozorenja"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
      </svg>
    </button>
  )
}

function AlertsBannerContent({
  alerts,
  expanded,
  setExpanded,
  setDismissed,
}: {
  alerts: Alert[]
  expanded: boolean
  setExpanded: (v: boolean) => void
  setDismissed: (v: boolean) => void
}) {
  const hasMultiple = alerts.length > 1

  return (
    <div className="flex items-start gap-2">
      <WarningIcon />
      <div className="min-w-0 flex-1">
        <AlertText alert={alerts[0]} />
        {hasMultiple && !expanded && (
          <button
            type="button"
            className="mt-1 text-[11px] font-medium text-amber-400 underline decoration-amber-400/40 underline-offset-2 hover:text-amber-300"
            onClick={() => setExpanded(true)}
          >
            + još {alerts.length - 1}{" "}
            {alerts.length - 1 === 1 ? "upozorenje" : "upozorenja"}
          </button>
        )}
        <AnimatePresence initial={false}>
          {expanded && hasMultiple && (
            <ExpandedAlerts alerts={alerts} onCollapse={() => setExpanded(false)} />
          )}
        </AnimatePresence>
      </div>
      <DismissButton onDismiss={() => setDismissed(true)} />
    </div>
  )
}

export function AlertsBanner() {
  const { data: alerts } = useSWR<Alert[]>("/api/alerts")
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  if (dismissed || !alerts || alerts.length === 0) return null

  return (
    <AnimatePresence>
      <m.div
        role="alert"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-lg rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 backdrop-blur-md"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      >
        <AlertsBannerContent
          alerts={alerts}
          expanded={expanded}
          setExpanded={setExpanded}
          setDismissed={setDismissed}
        />
      </m.div>
    </AnimatePresence>
  )
}
