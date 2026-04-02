"use client"

import { Agentation as AgentationWidget } from "agentation"

export function Agentation() {
  if (process.env.NODE_ENV !== "development") return null
  return <AgentationWidget endpoint="http://localhost:4747" />
}
