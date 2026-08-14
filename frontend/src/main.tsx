import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { SSEProvider } from './store/useSSEStore.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <SSEProvider>
        <App />
      </SSEProvider>
    </AuthProvider>
  </React.StrictMode>,
);
