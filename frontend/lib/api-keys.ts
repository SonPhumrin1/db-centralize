export type APIKeyScope = "endpoint.invoke" | "pipeline.run"

export type APIKey = {
  id: number
  name: string
  description: string
  prefix: string
  scopes: APIKeyScope[]
  isActive: boolean
  createdAt: string
  updatedAt: string
  plainText?: string | null
}

export type CreateAPIKeyInput = {
  name: string
  description: string
  scopes: APIKeyScope[]
}

export type UpdateAPIKeyInput = {
  name?: string
  description?: string
  scopes?: APIKeyScope[]
  isActive?: boolean
}

export const apiKeyScopeOptions = [
  {
    label: "Endpoint invoke",
    value: "endpoint.invoke",
    description: "Use this key to call published runtime endpoints.",
  },
  {
    label: "Pipeline run",
    value: "pipeline.run",
    description: "Reserved for future pipeline runtime access.",
  },
] satisfies Array<{
  label: string
  value: APIKeyScope
  description: string
}>
