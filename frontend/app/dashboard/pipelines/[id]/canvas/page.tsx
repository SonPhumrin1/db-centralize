import { redirect } from "next/navigation"

import { PipelineCanvasWorkspace } from "@/components/pipelines/pipeline-canvas-workspace"
import { getServerSession } from "@/lib/server-session"

type CanvasPageProps = {
  params: Promise<{
    id: string
  }>
}

export const dynamic = "force-dynamic"

export default async function PipelineCanvasPage({ params }: CanvasPageProps) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  const { id } = await params

  return <PipelineCanvasWorkspace pipelineId={Number(id)} />
}
