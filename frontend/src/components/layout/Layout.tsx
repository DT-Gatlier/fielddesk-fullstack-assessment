import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSSEStore } from '../../store/useSSEStore';
import { LogOut, Home, ClipboardList, Users, Menu, X } from 'lucide-react';
import Logo from '../ui/Logo';
import ThemeSwitcher from '../ui/ThemeSwitcher';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const sseStatus = useSSEStore((state) => state.status);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-layout">
      <div className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', marginBottom: '1rem' }}>
          <div>
            <Logo />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {user?.orgName}
            </div>
          </div>
          <button 
            className="mobile-toggle-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <div className="sidebar-content">

        <nav className="sidebar-nav">
          <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
            <Home size={18} /> Dashboard
          </Link>
          <Link to="/work-orders" className={`nav-item ${location.pathname.startsWith('/work-orders') ? 'active' : ''}`}>
            <ClipboardList size={18} /> Work Orders
          </Link>
          {(user?.role === 'OWNER' || user?.role === 'DISPATCHER') && (
            <Link to="/users" className={`nav-item ${location.pathname.startsWith('/users') ? 'active' : ''}`}>
              <Users size={18} /> Users
            </Link>
          )}
          
          <ThemeSwitcher mode="mobile" />
        </nav>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0 1rem', fontSize: '0.75rem' }}>
            <div style={{ 
              width: 8, height: 8, borderRadius: '50%', 
              backgroundColor: sseStatus === 'connected' ? 'var(--success)' : (sseStatus === 'connecting' ? 'var(--warning)' : 'var(--error)')
            }} />
            <span>Live Sync: {sseStatus}</span>
          </div>


          <div style={{ padding: '0 1rem', fontSize: '0.875rem', marginBottom: '1rem', marginTop: '1rem', color: 'var(--text-main)' }}>
            <div>{user?.email}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Role: {user?.role}</div>
          </div>
          
          <button 
            onClick={logout}
            className="nav-item" 
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <LogOut size={18} /> Sign Out
          </button>
        </div>
        </div>
      </div>
      
      <main className="main-content">
        <ThemeSwitcher mode="desktop" />
        {children}
      </main>
    </div>
  );
}
