export type AdminUser = {
  id: number
  name: string
  email: string
  username: string
  role: "admin" | "member"
  isActive: boolean
  createdAt: string
}

export type CreateAdminUserInput = {
  name: string
  email: string
  username: string
  password: string
  role: "admin" | "member"
}

export type UpdateAdminUserInput = {
  role?: "admin" | "member"
  isActive?: boolean
}

export const adminRoleOptions = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
] satisfies Array<{ label: string; value: AdminUser["role"] }>
