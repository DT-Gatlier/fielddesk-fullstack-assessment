import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: (count, error) => !(error instanceof Error && 'status' in error && [401, 403, 404].includes((error as { status: number }).status)) && count < 2, refetchOnWindowFocus: false }, mutations: { retry: false } } });

createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>);
