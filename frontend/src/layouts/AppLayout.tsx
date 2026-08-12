import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';

const Icon = ({ children }: { children: string }) => <span className="nav-icon" aria-hidden="true">{children}</span>;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const realtime = useRealtime(Boolean(user));
  const nav = [
    { to: '/', label: 'Dashboard', icon: '⌂', end: true },
    { to: '/work-orders', label: 'Work orders', icon: '▣' },
    ...(user?.role !== 'technician' ? [{ to: '/notifications', label: 'Notifications', icon: '◌' }] : []),
    ...(user?.role !== 'technician' ? [{ to: '/team', label: 'Team', icon: '♙' }] : []),
    ...(user?.role === 'owner' ? [{ to: '/settings', label: 'Settings', icon: '⚙' }] : [])
  ];

  return <div className="app-shell">
    <button className="mobile-menu" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
    <aside className={menuOpen ? 'sidebar sidebar--open' : 'sidebar'}>
      <div className="brand"><span className="brand__mark">F</span><span>FieldDesk</span></div>
      <nav>{nav.map((item) => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMenuOpen(false)}><Icon>{item.icon}</Icon>{item.label}</NavLink>)}</nav>
      <div className="sidebar__footer">
        <span className={`live-status live-status--${realtime}`}>{realtime === 'connected' ? 'Live updates on' : 'Reconnecting…'}</span>
        <div className="profile"><span className="avatar">{user?.name.slice(0, 1).toUpperCase()}</span><div><strong>{user?.name}</strong><small>{user?.organisationName ?? user?.email}</small></div></div>
        <button className="logout-button" onClick={() => void logout()}>Sign out</button>
      </div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <main className="main-content"><Outlet /></main>
  </div>;
}
