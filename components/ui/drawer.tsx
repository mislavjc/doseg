"use client"

import * as React from "react"
import { Drawer as VaulDrawer } from "vaul"

import { cn } from "@/lib/utils"

const Drawer = VaulDrawer.Root

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof VaulDrawer.Trigger>) {
  return <VaulDrawer.Trigger {...props} />
}

function DrawerPortal(props: React.ComponentProps<typeof VaulDrawer.Portal>) {
  return <VaulDrawer.Portal {...props} />
}

function DrawerClose(props: React.ComponentProps<typeof VaulDrawer.Close>) {
  return <VaulDrawer.Close {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Overlay>) {
  return (
    <VaulDrawer.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/80",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  overlay = true,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Content> & { overlay?: boolean }) {
  return (
    <DrawerPortal>
      {overlay && <DrawerOverlay />}
      <VaulDrawer.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex h-full flex-col rounded-t-[14px] bg-background",
          !overlay && "!pointer-events-none",
          className
        )}
        {...props}
      >
        <div className={cn(
          "flex-1 flex flex-col min-h-0 rounded-t-[14px]",
          !overlay && "pointer-events-auto"
        )}>
          <div className="mx-auto mt-4 mb-2 h-1.5 w-[100px] shrink-0 rounded-full bg-muted" />
          {children}
        </div>
      </VaulDrawer.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-4 text-center md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Title>) {
  return (
    <VaulDrawer.Title
      className={cn(
        "text-sm font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof VaulDrawer.Description>) {
  return (
    <VaulDrawer.Description
      className={cn("text-xs/relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
