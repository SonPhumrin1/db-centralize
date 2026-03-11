"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRound, LoaderCircle, Settings2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { fetchJson } from "@/components/settings/fetch-json"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  ChangeRootPasswordInput,
  SystemSettings,
  UpdateSystemSettingsInput,
} from "@/lib/system-settings"

type SystemSettingsWorkspaceProps = {
  onPlatformNameChange?: (value: string) => void
}

const initialPasswordState: ChangeRootPasswordInput = {
  newPassword: "",
  confirmNewPassword: "",
}

export function SystemSettingsWorkspace({
  onPlatformNameChange,
}: SystemSettingsWorkspaceProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<UpdateSystemSettingsInput>({
    platformName: "",
    defaultPageSize: 25,
  })
  const [passwordForm, setPasswordForm] =
    useState<ChangeRootPasswordInput>(initialPasswordState)

  const settingsQuery = useQuery({
    queryKey: ["system-settings"],
    queryFn: () => fetchJson<SystemSettings>("/api/platform/settings"),
  })

  useEffect(() => {
    if (!settingsQuery.data) {
      return
    }

    setForm({
      platformName: settingsQuery.data.platformName,
      defaultPageSize: settingsQuery.data.defaultPageSize,
    })
    onPlatformNameChange?.(settingsQuery.data.platformName)
  }, [onPlatformNameChange, settingsQuery.data])

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateSystemSettingsInput) =>
      fetchJson<SystemSettings>("/api/platform/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (settings) => {
      toast.success("System settings updated.")
      onPlatformNameChange?.(settings.platformName)
      await queryClient.invalidateQueries({ queryKey: ["system-settings"] })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update settings."
      )
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (payload: ChangeRootPasswordInput) =>
      fetchJson<void>("/api/platform/admin/settings/root-password", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setPasswordForm(initialPasswordState)
      toast.success("Root password updated.")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update root password."
      )
    },
  })

  function updateForm<K extends keyof UpdateSystemSettingsInput>(
    key: K,
    value: UpdateSystemSettingsInput[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function updatePasswordForm<K extends keyof ChangeRootPasswordInput>(
    key: K,
    value: ChangeRootPasswordInput[K]
  ) {
    setPasswordForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function submitSettings() {
    updateMutation.mutate({
      platformName: form.platformName.trim(),
      defaultPageSize: Number(form.defaultPageSize),
    })
  }

  function submitRootPassword() {
    passwordMutation.mutate(passwordForm)
  }

  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <article className="rounded-[1.8rem] border border-border/70 bg-background/92 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-sky-100 p-3 text-sky-800">
            <Settings2 className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">System settings</h2>
            <p className="text-sm text-muted-foreground">
              Control platform branding and the default table page size.
            </p>
          </div>
        </div>

        {settingsQuery.isLoading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-36" />
          </div>
        ) : settingsQuery.isError ? (
          <div className="mt-6 rounded-[1.4rem] border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive">
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : "Failed to load system settings."}
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            <Field label="Platform name">
              <Input
                onChange={(event) =>
                  updateForm("platformName", event.target.value)
                }
                placeholder="Data Platform"
                value={form.platformName}
              />
            </Field>
            <Field label="Default pagination size">
              <Input
                min={5}
                max={200}
                onChange={(event) =>
                  updateForm(
                    "defaultPageSize",
                    Number.parseInt(event.target.value || "0", 10)
                  )
                }
                type="number"
                value={form.defaultPageSize}
              />
            </Field>

            <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
              Last updated{" "}
              {settingsQuery.data?.updatedAt
                ? new Date(settingsQuery.data.updatedAt).toLocaleString()
                : "just now"}
            </p>

            <Button
              className="mt-2"
              disabled={updateMutation.isPending}
              onClick={submitSettings}
              type="button"
            >
              {updateMutation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Settings2 className="size-4" />
              )}
              Save settings
            </Button>
          </div>
        )}
      </article>

      <article className="rounded-[1.8rem] border border-border/70 bg-background/92 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-rose-100 p-3 text-rose-800">
            <KeyRound className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Root password</h2>
            <p className="text-sm text-muted-foreground">
              Reset the bootstrap administrator credential for{" "}
              <span className="font-medium text-foreground">
                {settingsQuery.data?.rootUsername ?? "root"}
              </span>
              .
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <Field label="New password">
            <Input
              onChange={(event) =>
                updatePasswordForm("newPassword", event.target.value)
              }
              placeholder="Replace the bootstrap password"
              type="password"
              value={passwordForm.newPassword}
            />
          </Field>
          <Field label="Confirm new password">
            <Input
              onChange={(event) =>
                updatePasswordForm("confirmNewPassword", event.target.value)
              }
              placeholder="Repeat the new password"
              type="password"
              value={passwordForm.confirmNewPassword}
            />
          </Field>

          <Button
            className="mt-2"
            disabled={passwordMutation.isPending}
            onClick={submitRootPassword}
            type="button"
            variant="outline"
          >
            {passwordMutation.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Update root password
          </Button>
        </div>
      </article>
    </section>
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
