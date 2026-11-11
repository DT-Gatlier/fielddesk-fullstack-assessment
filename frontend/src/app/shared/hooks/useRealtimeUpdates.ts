import { useEffect, useState, useRef, useCallback } from "react"
import { ENV } from "@/app/api/configs/environment"
import { getAccessToken } from "@/app/api/client"
import { queryClient } from "@/app/api/configs/tanStackQuery"

export type RealtimeStatus = "connected" | "connecting" | "reconnecting" | "disconnected"

export function useRealtimeUpdates(enabled = true) {
  const [status, setStatus] = useState<RealtimeStatus>("disconnected")
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)

  const connect = useCallback(() => {
    const token = getAccessToken()
    if (!token || !enabled) {
      setStatus("disconnected")
      return
    }

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setStatus(reconnectAttemptsRef.current === 0 ? "connecting" : "reconnecting")

    const streamUrl = `${ENV.API_BASE_URL}/realtime/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(streamUrl)
    eventSourceRef.current = es

    es.onopen = () => {
      setStatus("connected")
      reconnectAttemptsRef.current = 0
    }

    // Work order created event
    es.addEventListener("work_order_created", () => {
      void queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })
    })

    // Work order updated event
    es.addEventListener("work_order_updated", (event) => {
      void queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })

      try {
        const payload = JSON.parse(event.data)
        if (payload?.workOrderId) {
          void queryClient.invalidateQueries({
            queryKey: ["work-order-detail", payload.workOrderId],
          })
          void queryClient.invalidateQueries({
            queryKey: ["work-order-attachments", payload.workOrderId],
          })
        }
      } catch {
        // Fallback broad invalidation
        void queryClient.invalidateQueries({ queryKey: ["work-order-detail"] })
      }
    })

    es.onerror = () => {
      es.close()
      eventSourceRef.current = null

      if (!enabled || !getAccessToken()) {
        setStatus("disconnected")
        return
      }

      setStatus("reconnecting")

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s max
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
      reconnectAttemptsRef.current += 1

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        connect()
      }, delay)
    }
  }, [enabled])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [connect])

  return {
    status,
    reconnectAttempts: reconnectAttemptsRef.current,
  }
}

