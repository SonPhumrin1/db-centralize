"use client"

import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DataSource } from "@/lib/datasources"
import {
  buildRestRequestPath,
  createRestFieldPair,
  formatRestRequestPreview,
  restMethodOptions,
  type RestFieldPair,
  type StructuredRestRequest,
} from "@/lib/rest-requests"

type RestRequestBuilderProps = {
  request: StructuredRestRequest
  onChange: (request: StructuredRestRequest) => void
  source?: DataSource
}

export function RestRequestBuilder({
  request,
  onChange,
  source,
}: RestRequestBuilderProps) {
  const authType = source?.summary.authType ?? "none"
  const previewPath = buildRestRequestPath(request)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
        <label className="field-stack" htmlFor="rest-method">
          <span className="field-label">Method</span>
          <select
            className="field-select"
            id="rest-method"
            onChange={(event) =>
              onChange({
                ...request,
                method: event.target.value as StructuredRestRequest["method"],
              })
            }
            value={request.method}
          >
            {restMethodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack" htmlFor="rest-path">
          <span className="field-label">Relative path</span>
          <Input
            id="rest-path"
            onChange={(event) =>
              onChange({
                ...request,
                path: event.target.value,
              })
            }
            placeholder="/orders"
            value={request.path}
          />
        </label>
      </div>

      <div className="rounded-[8px] border border-border bg-surface-raised px-4 py-3">
        <p className="page-label">Request preview</p>
        <p className="mt-2 break-all font-mono text-xs leading-6 text-foreground">
          {formatRestRequestPreview(request)}
        </p>
        {source?.summary.baseUrl ? (
          <p className="mt-3 text-xs leading-6 text-secondary">
            Base URL: <span className="font-mono text-foreground">{source.summary.baseUrl}</span>
            <span className="px-2 text-tertiary">/</span>
            Auth: <span className="font-mono text-foreground">{authType}</span>
          </p>
        ) : null}
      </div>

      <PairListEditor
        description="These are appended to the path when the request runs."
        items={request.queryParams}
        label="Query params"
        onAdd={() =>
          onChange({
            ...request,
            queryParams: [...request.queryParams, createRestFieldPair()],
          })
        }
        onChange={(queryParams) =>
          onChange({
            ...request,
            queryParams,
          })
        }
      />

      <PairListEditor
        description="Use this for request-specific overrides. Datasource auth headers stay at the source level."
        items={request.headers}
        label="Header overrides"
        onAdd={() =>
          onChange({
            ...request,
            headers: [...request.headers, createRestFieldPair()],
          })
        }
        onChange={(headers) =>
          onChange({
            ...request,
            headers,
          })
        }
      />

      <label className="field-stack" htmlFor="rest-body">
        <span className="field-label">JSON body</span>
        <textarea
          className="field-textarea min-h-32 font-mono leading-6"
          id="rest-body"
          onChange={(event) =>
            onChange({
              ...request,
              body: event.target.value,
            })
          }
          placeholder={
            request.method === "GET"
              ? '{\n  "note": "Optional for GET"\n}'
              : '{\n  "severity": "high"\n}'
          }
          spellCheck={false}
          value={request.body}
        />
        <p className="text-xs leading-6 text-secondary">
          Leave empty for read-only requests. When present, the body must be valid JSON.
        </p>
      </label>

      {previewPath && request.method !== "GET" ? (
        <p className="text-xs leading-6 text-secondary">
          Final request path: <span className="font-mono text-foreground">{previewPath}</span>
        </p>
      ) : null}
    </div>
  )
}

function PairListEditor({
  description,
  items,
  label,
  onAdd,
  onChange,
}: {
  description: string
  items: RestFieldPair[]
  label: string
  onAdd: () => void
  onChange: (items: RestFieldPair[]) => void
}) {
  return (
    <div className="rounded-[8px] border border-border bg-surface px-4 py-4">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="field-label">{label}</p>
          <p className="mt-1 text-sm leading-6 text-secondary">{description}</p>
        </div>
        <Button onClick={onAdd} size="sm" type="button" variant="outline">
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="pt-4 text-sm text-secondary">No entries yet.</div>
      ) : (
        <div className="space-y-3 pt-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 border border-border bg-surface-raised px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <Input
                onChange={(event) =>
                  onChange(
                    items.map((current) =>
                      current.id === item.id
                        ? { ...current, key: event.target.value }
                        : current
                    )
                  )
                }
                placeholder="key"
                value={item.key}
              />
              <Input
                onChange={(event) =>
                  onChange(
                    items.map((current) =>
                      current.id === item.id
                        ? { ...current, value: event.target.value }
                        : current
                    )
                  )
                }
                placeholder="value"
                value={item.value}
              />
              <Button
                className="justify-self-start md:justify-self-auto"
                onClick={() =>
                  onChange(items.filter((current) => current.id !== item.id))
                }
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
