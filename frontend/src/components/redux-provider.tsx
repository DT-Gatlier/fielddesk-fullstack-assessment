"use client";

import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { AppStore, makeStore } from "@/lib/store";

export function ReduxProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<AppStore | null>(null);
  useEffect(() => { setStore(makeStore()); }, []);
  if (!store) return <div className="redux-startup" aria-label="Starting FieldDesk" />;
  return <Provider store={store}>{children}</Provider>;
}
