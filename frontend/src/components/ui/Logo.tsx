import React from 'react';

export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Vertical Blue Line */}
        <line x1="8" y1="12" x2="8" y2="36" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" />
        
        {/* Horizontal Lines */}
        <line x1="18" y1="14" x2="32" y2="14" stroke="var(--text-main)" strokeWidth="5" strokeLinecap="round" />
        <line x1="18" y1="24" x2="26" y2="24" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" />
        <line x1="18" y1="34" x2="32" y2="34" stroke="var(--text-main)" strokeWidth="5" strokeLinecap="round" />
        
        {/* Small Blue Dot */}
        <circle cx="40" cy="14" r="2.5" fill="var(--primary)" />
      </svg>
      <div className="flex flex-col justify-center">
        <span className="text-2xl font-bold leading-none tracking-tight" style={{ fontFamily: "'Inter', sans-serif" }}>
          <span style={{ color: 'var(--text-main)' }}>FIELD</span>
          <span style={{ color: 'var(--primary)' }}>DESK</span>
        </span>
      </div>
    </div>
  );
}
