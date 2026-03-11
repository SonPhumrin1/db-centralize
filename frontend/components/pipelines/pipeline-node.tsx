"use client"

import { ArrowLeftRight, Bot, Database, FileText, Filter, GitMerge, Send, SendToBack } from "lucide-react"
import { Handle, Position, type NodeProps } from "@xyflow/react"

import { summarizeNode, type PipelineNodeData } from "@/lib/pipelines"
import { cn } from "@/lib/utils"

const kindStyles = {
  source: "border-emerald-300 bg-emerald-50 text-emerald-900",
  filter: "border-amber-300 bg-amber-50 text-amber-900",
  transform: "border-sky-300 bg-sky-50 text-sky-900",
  join: "border-violet-300 bg-violet-50 text-violet-900",
  output: "border-stone-300 bg-stone-100 text-stone-900",
  "telegram-trigger": "border-cyan-300 bg-cyan-50 text-cyan-900",
  "telegram-template": "border-blue-300 bg-blue-50 text-blue-900",
  "telegram-send": "border-rose-300 bg-rose-50 text-rose-900",
} as const

export function PipelineNode({ data: rawData, selected }: NodeProps) {
  const data = rawData as PipelineNodeData
  const Icon = iconForKind(data.kind)

  return (
    <div
      className={cn(
        "min-w-[190px] rounded-[1.4rem] border px-4 py-3 shadow-sm transition-shadow",
        kindStyles[data.kind],
        selected ? "shadow-lg shadow-stone-900/15" : "shadow-stone-900/5"
      )}
    >
      {data.kind !== "source" && data.kind !== "telegram-trigger" ? (
        <Handle position={Position.Left} type="target" />
      ) : null}
      {data.kind !== "output" ? <Handle position={Position.Right} type="source" /> : null}

      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-full bg-white/70 p-2">
          <Icon className="size-4" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold">{data.label}</p>
          <p className="max-w-[130px] text-xs leading-5 opacity-80">
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
