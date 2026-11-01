import { createContext, useContext, useEffect, useState } from "react";
import { api, setAuthLostHandler } from "./api.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthLostHandler(() => setUser(null));
    // Try to restore the session from the httpOnly refresh cookie
    api.restore().then(() => api.me()).then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const login = async (loginValue, password) => {
    const d = await api.login(loginValue, password);
    setUser({ username: d.username, role: d.role });
  };
  const logout = async () => {
    try { await api.logout(); } catch { /* cookie may already be gone */ }
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, ready, login, logout }}>{children}</AuthCtx.Provider>;
}
