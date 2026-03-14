"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { SchemaTable } from "@/lib/datasources"

type SchemaDetailsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  tables: Array<SchemaTable & { schemaName?: string }>
}

export function SchemaDetailsDialog({
  open,
  onOpenChange,
  title,
  description,
  tables,
}: SchemaDetailsDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(92vw,52rem)] max-w-[52rem]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
          {tables.map((table) => (
            <section key={table.qualifiedName} className="rounded-[10px] border border-border px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{table.qualifiedName}</p>
                  <p className="mt-1 text-xs text-secondary">
                    {table.columns.length} fields
                  </p>
                </div>
                {table.schemaName ? (
                  <span className="type-tag">{table.schemaName}</span>
                ) : null}
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.columns.map((column) => (
                      <tr key={`${table.qualifiedName}:${column.name}`} className="data-row">
                        <td className="font-mono text-[13px]">{column.name}</td>
                        <td className="font-mono text-[13px] text-secondary">{column.dataType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
