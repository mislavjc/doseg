"use client"

import Image from "next/image"
import { Dialog } from "@base-ui/react/dialog"
import { m, AnimatePresence } from "motion/react"

import { NumberedStep } from "./ui"

const ease = [0.23, 1, 0.32, 1] as const

function Step({
  n,
  title,
  sub,
  delay,
}: {
  n: string
  title: string
  sub: string
  delay: number
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease }}
    >
      <NumberedStep n={n} title={title} sub={sub} size="md" />
    </m.div>
  )
}

function DialogPortalContent() {
  return (
    <Dialog.Portal keepMounted>
      <Dialog.Backdrop
        render={
          <m.div
            className="fixed inset-0 z-50 bg-scrim"
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
            className="fixed z-50 bg-ground will-change-transform max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-[18px] max-md:shadow-[0_-8px_36px_rgba(13,18,33,0.3)] md:top-1/2 md:left-1/2 md:w-[min(516px,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:shadow-modal"
            initial={{ opacity: 0, scale: 0.97 }}
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
        <div className="flex h-[128px] items-center justify-center overflow-hidden border-b border-hairline-strong bg-surface-blue max-md:rounded-t-[18px] sm:h-[150px] md:h-[188px]">
          <div className="relative h-[104px] w-[300px] sm:h-[150px] sm:w-[440px]">
            <Image
              src="/new/onboarding-tram.png"
              alt=""
              fill
              priority
              sizes="440px"
              className="object-contain"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 px-[22px] pt-[22px] pb-[26px] md:gap-[18px] md:px-8 md:pt-[30px] md:pb-8">
          <p className="font-mono text-label tracking-[0.04em] text-ink-faint">
            doseg · zagreb
          </p>
          <Dialog.Title className="font-heros text-[19px] leading-[25px] font-bold tracking-[-0.01em] text-ink md:text-[21px] md:leading-[27px]">
            Koliko Zagreba stigneš za pola sata?
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Klikni bilo gdje na karti za doseg u 30 minuta, zatim odredište
            unutar dosega za rutu.
          </Dialog.Description>

          <div className="flex flex-col gap-3.5 pt-0.5">
            <Step
              n="1"
              title="Klikni bilo gdje na karti"
              sub="obojano područje je sve što stigneš za 30 min"
              delay={0.18}
            />
            <Step
              n="2"
              title="Klikni odredište unutar dosega"
              sub="dobiješ rutu — tramvaj, bus, vlak"
              delay={0.26}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <Dialog.Close className="font-mono text-label text-ink-faint transition-colors duration-150 hover:text-ink-muted">
              može i kasnije
            </Dialog.Close>
            <Dialog.Close className="bg-zg-blue px-6 py-3 font-heros text-[16px] leading-5 text-white transition-[background-color,transform] duration-150 ease-out hover:bg-navy active:scale-[0.97]">
              Kreni →
            </Dialog.Close>
          </div>
        </div>
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
