"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, UserPlus, Users } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

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

export function UserManagementWorkspace({
  currentUserId,
}: {
  currentUserId: number
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CreateFormState>(initialFormState)
  const [userPendingDeactivate, setUserPendingDeactivate] =
    useState<AdminUser | null>(null)

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
      toast.success("User created.")
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to create user."
      )
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
      toast.success(
        variables.payload.isActive === false
          ? "User deactivated."
          : variables.payload.isActive === true
            ? "User activated."
            : "User role updated."
      )
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update user."
      )
    },
  })

  function updateForm<K extends keyof CreateFormState>(
    key: K,
    value: CreateFormState[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function submitCreateUser() {
    createMutation.mutate({
      ...form,
      name: form.name.trim(),
      email: form.email.trim(),
      username: form.username.trim(),
      password: form.password,
    })
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <article className="rounded-[1.8rem] border border-border/70 bg-background/92 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-amber-100 p-3 text-amber-800">
              <UserPlus className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold">Create user</h2>
              <p className="text-sm text-muted-foreground">
                Add dashboard credentials for a new team member.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <Field label="Full name">
              <Input
                onChange={(event) => updateForm("name", event.target.value)}
                placeholder="Operations Analyst"
                value={form.name}
              />
            </Field>
            <Field label="Email">
              <Input
                onChange={(event) => updateForm("email", event.target.value)}
                placeholder="ops@dataplatform.local"
                type="email"
                value={form.email}
              />
            </Field>
            <Field label="Username">
              <Input
                onChange={(event) => updateForm("username", event.target.value)}
                placeholder="ops-analyst"
                value={form.username}
              />
            </Field>
            <Field label="Password">
              <Input
                onChange={(event) => updateForm("password", event.target.value)}
                placeholder="Temporary password"
                type="password"
                value={form.password}
              />
            </Field>
            <Field label="Role">
              <select
                className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                onChange={(event) =>
                  updateForm(
                    "role",
                    event.target.value as CreateFormState["role"]
                  )
                }
                value={form.role}
              >
                {adminRoleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </Field>

            <Button
              className="mt-2"
              disabled={createMutation.isPending}
              onClick={submitCreateUser}
              type="button"
            >
              {createMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Create user
            </Button>
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-border/70 bg-background/92 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-100 p-3 text-emerald-800">
              <Users className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold">User directory</h2>
              <p className="text-sm text-muted-foreground">
                Change roles and control who can sign into the platform.
              </p>
            </div>
          </div>

          {usersQuery.isLoading ? (
            <div className="mt-6 space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`user-skeleton-${index}`}
                  className="rounded-[1.4rem] border border-border/70 bg-stone-50/70 p-4"
                >
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="mt-2 h-4 w-52" />
                  <div className="mt-4 flex gap-3">
                    <Skeleton className="h-10 w-28" />
                    <Skeleton className="h-10 w-28" />
                  </div>
                </div>
              ))}
            </div>
          ) : usersQuery.isError ? (
            <div className="mt-6 rounded-[1.4rem] border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive">
              {usersQuery.error instanceof Error
                ? usersQuery.error.message
                : "Failed to load users."}
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {(usersQuery.data ?? []).map((user) => {
                const isCurrentUser = user.id === currentUserId
                const isPending =
                  updateMutation.isPending &&
                  updateMutation.variables?.id === user.id

                return (
                  <div
                    key={user.id}
                    className="rounded-[1.4rem] border border-border/70 bg-stone-50/70 p-4"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold">{user.name}</p>
                          {isCurrentUser ? (
                            <span className="rounded-full bg-stone-900 px-2.5 py-1 text-xs font-medium text-white">
                              You
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              user.isActive
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-stone-200 text-stone-700"
                            }`}
                          >
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {user.username} · {user.email}
                        </p>
                        <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
                          Created {new Date(user.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <select
                          className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          disabled={isPending}
                          onChange={(event) =>
                            updateMutation.mutate({
                              id: user.id,
                              payload: {
                                role: event.target.value as AdminUser["role"],
                              },
                            })
                          }
                          value={user.role}
                        >
                          {adminRoleOptions.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>

                        <Button
                          disabled={isPending}
                          onClick={() => {
                            if (user.isActive) {
                              setUserPendingDeactivate(user)
                              return
                            }

                            updateMutation.mutate({
                              id: user.id,
                              payload: { isActive: true },
                            })
                          }}
                          type="button"
                          variant={user.isActive ? "destructive" : "secondary"}
                        >
                          {isPending ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : null}
                          {user.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </article>
      </section>

      <ConfirmActionDialog
        confirmLabel="Deactivate user"
        description={
          userPendingDeactivate
            ? `This will block "${userPendingDeactivate.username}" from authenticating until the account is reactivated.`
            : ""
        }
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
    </div>
  )
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <label className="space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </label>
  )
}
