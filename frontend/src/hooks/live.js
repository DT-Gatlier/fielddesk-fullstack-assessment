import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const EVT = "fielddesk:live";

// One SSE connection for the whole app (used by Layout). Authenticated with a one-time ticket,
// reconnects with exponential backoff and asks pages to refetch after an outage.
export function useLiveConnection() {
  const [status, setStatus] = useState("connecting");
  useEffect(() => {
    let es, timer, attempt = 0, stopped = false, wasOffline = false;
    const emit = (detail) => window.dispatchEvent(new CustomEvent(EVT, { detail }));
    const schedule = () => {
      if (stopped) return;
      attempt += 1;
      timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt) + Math.random() * 500);
    };
    async function connect() {
      try {
        const { ticket } = await api.streamTicket(); // new ticket every (re)connect
        if (stopped) return;
        es = new EventSource(`/api/stream/?ticket=${encodeURIComponent(ticket)}`);
        es.onopen = () => {
          attempt = 0;
          setStatus("live");
          if (wasOffline) { wasOffline = false; emit({ kind: "resync" }); } // we may have missed events
        };
        es.onmessage = (e) => { try { emit(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
        es.onerror = () => { es.close(); wasOffline = true; setStatus("offline"); schedule(); };
      } catch {
        wasOffline = true;
        setStatus("offline");
        schedule();
      }
    }
    connect();
    return () => { stopped = true; clearTimeout(timer); es?.close(); };
  }, []);
  return status;
}

// Pages call this to refetch when something changed (or after a reconnect)
export function useLiveRefresh(cb) {
  const ref = useRef(cb);
  useEffect(() => { ref.current = cb; });
  useEffect(() => {
    const h = (e) => ref.current(e.detail);
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
}
