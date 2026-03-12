"use client"

import { ArrowLeftRight, Bot, Database, FileText, Filter, GitMerge, Send, SendToBack } from "lucide-react"
import { Handle, Position, type NodeProps } from "@xyflow/react"

import { summarizeNode, type PipelineNodeData } from "@/lib/pipelines"
import { cn } from "@/lib/utils"

const kindBorders = {
  source: "border-l-[color:oklch(0.72_0.14_240)]",
  filter: "border-l-[color:oklch(0.76_0.08_82)]",
  transform: "border-l-[color:oklch(0.64_0.03_240)]",
  join: "border-l-[color:oklch(0.65_0.09_310)]",
  output: "border-l-[color:oklch(0.74_0.08_150)]",
  "telegram-trigger": "border-l-[color:oklch(0.7_0.08_220)]",
  "telegram-template": "border-l-[color:oklch(0.7_0.06_250)]",
  "telegram-send": "border-l-[color:oklch(0.7_0.08_18)]",
} as const

export function PipelineNode({ data: rawData, selected }: NodeProps) {
  const data = rawData as PipelineNodeData
  const Icon = iconForKind(data.kind)

  return (
    <div
      className={cn(
        "min-w-[210px] rounded-[8px] border border-border border-l-[3px] bg-surface px-4 py-3 shadow-none transition-colors",
        kindBorders[data.kind],
        selected && "bg-accent-soft"
      )}
    >
      {data.kind !== "source" && data.kind !== "telegram-trigger" ? (
        <Handle position={Position.Left} type="target" />
      ) : null}
      {data.kind !== "output" ? <Handle position={Position.Right} type="source" /> : null}

      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[color:color-mix(in_oklab,var(--foreground)_62%,var(--accent))]">
          <Icon className="size-4" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium">{data.label}</p>
          <p className="max-w-[150px] text-xs leading-5 text-[color:color-mix(in_oklab,var(--foreground)_68%,transparent)]">
            {summarizeNode({
              id: "",
              type: "pipelineNode",
              position: { x: 0, y: 0 },
              data,
            })}
          </p>
        </div>
      </div>
    </div>
  )
}

function iconForKind(kind: PipelineNodeData["kind"]) {
  switch (kind) {
    case "source":
      return Database
    case "filter":
      return Filter
    case "transform":
      return ArrowLeftRight
    case "join":
      return GitMerge
    case "output":
      return SendToBack
    case "telegram-trigger":
      return Bot
    case "telegram-template":
      return FileText
    case "telegram-send":
      return Send
  }
}
