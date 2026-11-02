import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { useLiveConnection } from "../hooks/live.js";
import { canDispatch } from "../constants.js";

export default function Layout() {
  const { user, logout } = useAuth();
  const live = useLiveConnection();
  const nav = useNavigate();
  const liveText = { live: "Live updates on", connecting: "Connecting…", offline: "Live updates off" }[live];

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">FieldDesk</Link>
        <nav aria-label="Main">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/work-orders" end>Work orders</NavLink>
          {canDispatch(user) && <NavLink to="/work-orders/new">New work order</NavLink>}
        </nav>
        <div className="user">
          <span className={`dot ${live}`} title={liveText} aria-label={liveText} />
          <span>{user.username} ({user.role})</span>
          <button className="link" onClick={async () => { await logout(); nav("/login"); }}>Log out</button>
        </div>
      </header>
      {live === "offline" && (
        <div className="banner warn" role="status">
          Live updates are unavailable, retrying in the background. What you see may be out of date until the connection returns.
        </div>
      )}
      <main><Outlet /></main>
    </div>
  );
}
