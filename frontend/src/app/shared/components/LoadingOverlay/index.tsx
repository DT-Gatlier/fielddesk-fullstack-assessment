interface LoadingOverlayProps {
  description?: string
}

function LoadingOverlay({ description = "Loading..." }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-900/20 backdrop-blur-xs">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      <p className="rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-md border border-slate-200">
        {description}
      </p>
    </div>
  )
}

export default LoadingOverlay

