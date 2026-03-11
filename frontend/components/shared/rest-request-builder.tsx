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
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="rest-method">
            Method
          </label>
          <select
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="rest-path">
            Relative path
          </label>
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
        </div>
      </div>

      <div className="rounded-[1.4rem] border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Request preview</p>
        <p className="mt-2 break-all font-mono text-xs leading-6">
          {formatRestRequestPreview(request)}
        </p>
        {source?.summary.baseUrl ? (
          <p className="mt-3 text-xs leading-5">
            Base URL: <span className="font-medium text-foreground">{source.summary.baseUrl}</span>
            {" · "}Auth: <span className="font-medium text-foreground">{authType}</span>
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

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="rest-body">
          JSON body
        </label>
        <textarea
          className="min-h-32 w-full rounded-[1.2rem] border border-input bg-background px-3 py-3 text-sm leading-6 shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          id="rest-body"
          onChange={(event) =>
            onChange({
              ...request,
              body: event.target.value,
            })
          }
          placeholder={request.method === "GET" ? "{\n  \"note\": \"Optional for GET\"\n}" : "{\n  \"severity\": \"high\"\n}"}
          spellCheck={false}
          value={request.body}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          Leave empty for read-only requests. When present, the body must be valid JSON.
        </p>
      </div>

      {previewPath && request.method !== "GET" ? (
        <p className="text-xs leading-5 text-muted-foreground">
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
    <div className="space-y-3 rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Button onClick={onAdd} size="sm" type="button" variant="outline">
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[1rem] border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-xs leading-5 text-muted-foreground">
          No entries yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 rounded-[1rem] border border-border/70 bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
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
                variant="outline"
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
