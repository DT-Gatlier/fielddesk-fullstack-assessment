import React, { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';

const themes = [
  { id: 'default', name: 'Classic' },
  { id: 'nexus', name: 'Enterprise' },
  { id: 'emerald', name: 'Nature' },
  { id: 'industrial', name: 'High Contrast' },
  { id: 'telemetry', name: 'Dark Mode' },
];

export default function ThemeSwitcher({ mode = 'desktop' }: { mode?: 'desktop' | 'mobile' }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('fielddesk-theme') || 'default');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('fielddesk-theme', theme);
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }, [theme]);

  if (mode === 'desktop') {
    return (
      <div 
        className="theme-switcher-desktop"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        <div style={{
          background: 'var(--surface)',
          padding: '0.65rem',
          borderRadius: '50%',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
          <Palette size={20} />
        </div>
  
        <div 
          className="theme-switcher-menu-desktop"
          style={{
            display: isOpen ? 'flex' : 'none',
          }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-md)',
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            minWidth: '150px'
          }}>
          <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            Select Theme
          </div>
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                setIsOpen(false);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                backgroundColor: theme === t.id ? 'var(--primary)' : 'transparent',
                color: theme === t.id ? '#FFFFFF' : 'var(--text-main)',
              }}
              onMouseOver={(e) => {
                if (theme !== t.id) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-color)';
                }
              }}
              onMouseOut={(e) => {
                if (theme !== t.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {t.name}
            </button>
          ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-switcher-mobile">
      <button 
        className="nav-item"
        onClick={() => setIsOpen(!isOpen)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Palette size={18} /> Theme
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {themes.find(t => t.id === theme)?.name}
        </span>
      </button>

      {isOpen && (
        <div style={{
          marginTop: '0.5rem',
          background: 'var(--bg-color)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}>
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                setIsOpen(false);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                backgroundColor: theme === t.id ? 'var(--primary)' : 'transparent',
                color: theme === t.id ? '#FFFFFF' : 'var(--text-main)',
              }}
              onMouseOver={(e) => {
                if (theme !== t.id) {
                  e.currentTarget.style.backgroundColor = 'var(--surface)';
                }
              }}
              onMouseOut={(e) => {
                if (theme !== t.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
