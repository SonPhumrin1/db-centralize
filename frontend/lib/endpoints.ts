export type Endpoint = {
  id: number
  queryId?: number
  name: string
  publicId: string
  slug: string
  invokeMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  isActive: boolean
  createdAt: string
}
