import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge must be taught the custom font-size utilities from
 * globals.css (@theme: --text-head/--text-body/--text-label). Without this it
 * can't tell `text-label` (a size) from `text-zg-blue` (a colour), treats
 * them as conflicting and silently drops the size class.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["head", "body", "label"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
