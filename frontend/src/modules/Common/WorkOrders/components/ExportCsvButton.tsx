import { Download, Loader2 } from "lucide-react"
import { Button } from "@/app/shared/widgets/base/button"
import { useExportWorkOrdersCsv } from "../queryHooks"

interface ExportCsvButtonProps {
  status?: string
  priority?: string
  search?: string
}

export function ExportCsvButton({
  status,
  priority,
  search,
}: ExportCsvButtonProps) {
  const exportMutation = useExportWorkOrdersCsv()

  const handleExport = () => {
    exportMutation.mutate({
      status,
      priority,
      search,
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exportMutation.isPending}
      className="h-8 text-xs font-medium text-slate-700 border-slate-300 bg-white hover:bg-slate-50 shadow-xs"
      title="Download filtered work orders as CSV"
    >
      {exportMutation.isPending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-emerald-600" />
          <span>Exporting...</span>
        </>
      ) : (
        <>
          <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
          <span>Export CSV</span>
        </>
      )}
    </Button>
  )
}

