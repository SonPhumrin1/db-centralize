"use client"

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react"
import { create } from "zustand"

import {
  createPipelineNode,
  defaultCanvasDocument,
  type PipelineCanvasDocument,
  type PipelineFlowEdge,
  type PipelineFlowNode,
  type PipelineNodeConfigMap,
  type PipelineNodeData,
  type PipelineNodeKind,
} from "@/lib/pipelines"

type PipelineCanvasState = {
  nodes: PipelineFlowNode[]
  edges: PipelineFlowEdge[]
  selectedNodeId: string | null
  hydrate: (document: PipelineCanvasDocument) => void
  selectNode: (id: string | null) => void
  addNode: (kind: PipelineNodeKind) => void
  updateNodeConfig: <K extends PipelineNodeKind>(
    nodeId: string,
    updater: (
      config: PipelineNodeConfigMap[K]
    ) => PipelineNodeConfigMap[K]
  ) => void
  setOutputRows: (rows: Array<Record<string, unknown>>) => void
  onNodesChange: (changes: NodeChange<PipelineFlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange<PipelineFlowEdge>[]) => void
  onConnect: (connection: Connection) => void
  snapshot: () => PipelineCanvasDocument
}

export const usePipelineCanvasStore = create<PipelineCanvasState>((set, get) => ({
  ...defaultCanvasDocument(),
  selectedNodeId: null,
  hydrate: (document) =>
    set({
      nodes: document.nodes,
      edges: document.edges,
      selectedNodeId: null,
    }),
  selectNode: (id) => set({ selectedNodeId: id }),
  addNode: (kind) =>
    set((state) => {
      const column = state.nodes.length % 3
      const row = Math.floor(state.nodes.length / 3)
      const node = createPipelineNode(kind, {
        x: 80 + column * 220,
        y: 80 + row * 160,
      })

      return {
        nodes: [...state.nodes, node],
        selectedNodeId: node.id,
      }
    }),
  updateNodeConfig: (nodeId, updater) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node
        }

        return {
          ...node,
          data: {
            ...(node.data as PipelineNodeData),
            config: updater(node.data.config as never),
          },
        }
      }),
    })),
  setOutputRows: (rows) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.data.kind === "output"
          ? {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...(node.data.config as PipelineNodeConfigMap["output"]),
                  resultRows: rows,
                },
                rowCount: rows.length,
              },
            }
          : node
      ),
    })),
  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes),
    })),
  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
    })),
  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          type: "smoothstep",
          animated: true,
        },
        state.edges
      ),
    })),
  snapshot: () => ({
    nodes: get().nodes,
    edges: get().edges,
  }),
}))
