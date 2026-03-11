"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { InlineBanner } from "@/components/dashboard/platform-ui"
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

export function SystemSettingsWorkspace({ onPlatformNameChange }: SystemSettingsWorkspaceProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<UpdateSystemSettingsInput>({
    platformName: "",
    defaultPageSize: 25,
  })
  const [passwordForm, setPasswordForm] = useState<ChangeRootPasswordInput>(initialPasswordState)
  const [showRotateForm, setShowRotateForm] = useState(false)
  const [notice, setNotice] = useState<{ kind: "idle" | "success" | "error"; message?: string }>({ kind: "idle" })

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
      setNotice({ kind: "success", message: "System settings updated." })
      onPlatformNameChange?.(settings.platformName)
      await queryClient.invalidateQueries({ queryKey: ["system-settings"] })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to update settings." })
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
      setShowRotateForm(false)
      setNotice({ kind: "success", message: "Root password updated." })
    },
    onError: (error) => {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Failed to update root password." })
    },
  })

  function updateForm<K extends keyof UpdateSystemSettingsInput>(
    key: K,
    value: UpdateSystemSettingsInput[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updatePasswordForm<K extends keyof ChangeRootPasswordInput>(
    key: K,
    value: ChangeRootPasswordInput[K]
  ) {
    setPasswordForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div>
          <p className="page-label">System Settings</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Platform defaults</h2>
        </div>
      </div>

      {notice.kind !== "idle" && notice.message ? (
        <div className="border-b border-border px-4 py-3">
          <InlineBanner tone={notice.kind === "success" ? "success" : "error"}>
            {notice.message}
          </InlineBanner>
        </div>
      ) : null}

      {settingsQuery.isLoading ? (
        <div className="space-y-3 px-4 py-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : settingsQuery.isError ? (
        <div className="px-4 py-4 text-sm text-[color:var(--danger)]">
          {settingsQuery.error instanceof Error ? settingsQuery.error.message : "Failed to load system settings."}
        </div>
      ) : (
        <div className="divide-y divide-border">
          <SettingRow
            control={
              <Input
                onChange={(event) => updateForm("platformName", event.target.value)}
                value={form.platformName}
              />
            }
            description="Shown in the dashboard shell and admin header."
            label="Platform name"
          />
          <SettingRow
            control={
              <select
                className="field-select w-full max-w-[160px]"
                onChange={(event) => updateForm("defaultPageSize", Number(event.target.value))}
                value={form.defaultPageSize}
              >
                {[25, 50, 100, 500].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            }
            description="Used as the default raw data page size across results tables."
            label="Default page size"
          />
          <SettingRow
            control={
              <div className="w-full max-w-md space-y-3">
                <Button onClick={() => setShowRotateForm((current) => !current)} type="button" variant="outline">
                  {showRotateForm ? "Cancel rotation" : "Rotate password"}
                </Button>
                {showRotateForm ? (
                  <div className="space-y-3 rounded-[8px] border border-border px-3 py-3">
                    <Input
                      onChange={(event) => updatePasswordForm("newPassword", event.target.value)}
                      placeholder="New root password"
                      type="password"
                      value={passwordForm.newPassword}
                    />
                    <Input
                      onChange={(event) => updatePasswordForm("confirmNewPassword", event.target.value)}
                      placeholder="Confirm new password"
                      type="password"
                      value={passwordForm.confirmNewPassword}
                    />
                    <Button onClick={() => passwordMutation.mutate(passwordForm)} type="button">
                      {passwordMutation.isPending ? "Rotating..." : "Confirm rotation"}
                    </Button>
                  </div>
                ) : null}
              </div>
            }
            description={`Bootstrap admin: ${settingsQuery.data?.rootUsername ?? "root"}. Rotation is never applied instantly without a second explicit action.`}
            label="Root password"
          />
          <div className="flex justify-end px-4 py-4">
            <Button
              disabled={updateMutation.isPending}
              onClick={() =>
                updateMutation.mutate({
                  platformName: form.platformName.trim(),
                  defaultPageSize: Number(form.defaultPageSize),
                })
              }
              type="button"
            >
              {updateMutation.isPending ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function SettingRow({
  label,
  description,
  control,
}: {
  label: string
  description: string
  control: React.ReactNode
}) {
  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(240px,0.48fr)_minmax(0,0.52fr)] lg:items-start">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-sm text-secondary">{description}</p>
      </div>
      <div>{control}</div>
    </div>
  )
}
