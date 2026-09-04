import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/login', { email, password });
      login(response.data.access_token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-zinc-50/50 p-4">
      <div className="absolute inset-0 z-[-1] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-200/50 via-zinc-50/50 to-zinc-50/50"></div>
      <Card className="w-full max-w-md shadow-xl ring-1 ring-black/5 rounded-[2rem] overflow-hidden bg-white/70 backdrop-blur-2xl">
        <div className="p-1">
          <div className="rounded-[1.75rem] bg-white p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-black/5">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-3xl font-bold tracking-tight text-zinc-900">Sign in</CardTitle>
              <CardDescription className="text-zinc-500">
                Access your FieldDesk dispatcher terminal.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {error && (
                <div className="mb-6 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800 ring-1 ring-red-600/10">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="flex flex-col space-y-5">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium leading-none text-zinc-900">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="flex h-11 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="name@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium leading-none text-zinc-900">
                      Password
                    </label>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="flex h-11 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="mt-2 h-11 w-full rounded-full bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98] transition-transform"
                >
                  {loading ? 'Authenticating...' : 'Log In'}
                </Button>
              </form>
            </CardContent>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Login;
