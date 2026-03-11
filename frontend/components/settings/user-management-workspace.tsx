"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import {
  InlineBanner,
  StatusBadge,
  SwitchButton,
} from "@/components/dashboard/platform-ui"
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog"
import { fetchJson } from "@/components/settings/fetch-json"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  adminRoleOptions,
  type AdminUser,
  type CreateAdminUserInput,
} from "@/lib/admin-users"

type CreateFormState = CreateAdminUserInput

const initialFormState: CreateFormState = {
  name: "",
  email: "",
  username: "",
  password: "",
  role: "member",
}

export function UserManagementWorkspace({ currentUserId }: { currentUserId: number }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CreateFormState>(initialFormState)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [userPendingDeactivate, setUserPendingDeactivate] = useState<AdminUser | null>(null)
  const [notice, setNotice] = useState<{ kind: "idle" | "success" | "error"; message?: string }>({ kind: "idle" })

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchJson<AdminUser[]>("/api/platform/admin/users"),
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateAdminUserInput) =>
      fetchJson<AdminUser>("/api/platform/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setForm(initialFormState)
      setShowCreateForm(false)
      setNotice({ kind: "success", message: "User created." })
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to create user." })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number
      payload: {
        role?: AdminUser["role"]
        isActive?: boolean
      }
    }) =>
      fetchJson<AdminUser>(`/api/platform/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (_user, variables) => {
      setUserPendingDeactivate(null)
      setNotice({
        kind: "success",
        message:
          variables.payload.isActive === false
            ? "User deactivated."
            : variables.payload.isActive === true
              ? "User activated."
              : "User role updated.",
      })
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to update user." })
    },
  })

  function updateForm<K extends keyof CreateFormState>(
    key: K,
    value: CreateFormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <p className="page-label">User Management</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Access directory</h2>
        </div>
        <Button onClick={() => setShowCreateForm((current) => !current)} type="button" variant="outline">
          {showCreateForm ? "Close create form" : "Create User"}
        </Button>
      </div>

      {notice.kind !== "idle" && notice.message ? (
        <div className="border-b border-border px-4 py-3">
          <InlineBanner tone={notice.kind === "success" ? "success" : "error"}>
            {notice.message}
          </InlineBanner>
        </div>
      ) : null}

      {showCreateForm ? (
        <div className="border-b border-border px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input onChange={(event) => updateForm("name", event.target.value)} placeholder="Full name" value={form.name} />
            <Input onChange={(event) => updateForm("email", event.target.value)} placeholder="Email" type="email" value={form.email} />
            <Input onChange={(event) => updateForm("username", event.target.value)} placeholder="Username" value={form.username} />
            <Input onChange={(event) => updateForm("password", event.target.value)} placeholder="Temporary password" type="password" value={form.password} />
            <select
              className="field-select"
              onChange={(event) => updateForm("role", event.target.value as CreateFormState["role"])}
              value={form.role}
            >
              {adminRoleOptions.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              disabled={createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  ...form,
                  name: form.name.trim(),
                  email: form.email.trim(),
                  username: form.username.trim(),
                })
              }
              type="button"
            >
              {createMutation.isPending ? "Creating..." : "Create user"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="data-table min-w-[920px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th className="w-[180px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={5} className="px-3 py-0">
                      <div className="grid h-[38px] grid-cols-[2fr_2fr_1fr_1fr_180px] items-center gap-3">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3.5 w-24" />
                      </div>
                    </td>
                  </tr>
                ))
              : null}

            {!usersQuery.isLoading && (usersQuery.data ?? []).map((user) => {
              const isCurrentUser = user.id === currentUserId
              const isPending = updateMutation.isPending && updateMutation.variables?.id === user.id

              return (
                <tr key={user.id} className="data-row">
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.name}</span>
                      {isCurrentUser ? <span className="type-tag">You</span> : null}
                    </div>
                    <div className="mono-value text-secondary">{user.username}</div>
                  </td>
                  <td className="text-sm">{user.email}</td>
                  <td>
                    <select
                      className="field-select w-[120px]"
                      disabled={isPending}
                      onChange={(event) =>
                        updateMutation.mutate({
                          id: user.id,
                          payload: { role: event.target.value as AdminUser["role"] },
                        })
                      }
                      value={user.role}
                    >
                      {adminRoleOptions.map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <StatusBadge label={user.isActive ? "Active" : "Inactive"} tone={user.isActive ? "success" : "muted"} />
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <SwitchButton
                        checked={user.isActive}
                        disabled={isPending}
                        onCheckedChange={(next) => {
                          if (!next) {
                            setUserPendingDeactivate(user)
                            return
                          }

                          updateMutation.mutate({ id: user.id, payload: { isActive: true } })
                        }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}

            {!usersQuery.isLoading && (usersQuery.data ?? []).length === 0 ? (
              <tr>
                <td className="py-14 text-center text-sm text-secondary" colSpan={5}>
                  No users found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ConfirmActionDialog
        confirmLabel="Deactivate user"
        description={userPendingDeactivate ? `This will block ${userPendingDeactivate.username} from authenticating until reactivated.` : ""}
        onConfirm={() => {
          if (!userPendingDeactivate) {
            return
          }

          updateMutation.mutate({
            id: userPendingDeactivate.id,
            payload: { isActive: false },
          })
        }}
        onOpenChange={(open) => {
          if (!open) {
            setUserPendingDeactivate(null)
          }
        }}
        open={Boolean(userPendingDeactivate)}
        pending={updateMutation.isPending}
        title="Deactivate user?"
      />
    </section>
  )
}


