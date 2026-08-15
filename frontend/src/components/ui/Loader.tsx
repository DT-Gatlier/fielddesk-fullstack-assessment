import React from 'react';

interface LoaderProps {
  text?: string;
}

export default function Loader({ text = 'Synchronizing Tenant Data...' }: LoaderProps) {
  return (
    <div className="fielddesk-loader" style={{ height: '100%', width: '100%' }}>
      <svg viewBox="0 0 100 100" className="loader-svg">
        {/* Outer Sync Ring */}
        <circle cx="50" cy="50" r="38" className="ring track" />
        <circle cx="50" cy="50" r="38" className="ring spinner" />
        
        {/* Internal Concurrent Node Pulse */}
        <circle cx="50" cy="50" r="18" className="core-pulse" />
        
        {/* Field Data Nodes */}
        <circle cx="50" cy="12" r="4" className="node node-1" />
        <circle cx="88" cy="50" r="4" className="node node-2" />
        <circle cx="50" cy="88" r="4" className="node node-3" />
        <circle cx="12" cy="50" r="4" className="node node-4" />
      </svg>
      <p className="loader-text">{text}</p>
    </div>
  );
}
