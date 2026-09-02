import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Briefcase, CheckCircle } from 'lucide-react';

const fetchSummaryCounts = async () => {
  const [openRes, completedRes] = await Promise.all([
    api.get('/work-orders?status=open&pageSize=1'),
    api.get('/work-orders?status=completed&pageSize=1')
  ]);
  return {
    open: openRes.data.total,
    completed: completedRes.data.total
  };
};

const OwnerDashboard: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['summaryCounts'],
    queryFn: fetchSummaryCounts
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Owner Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Total Open</CardTitle>
            <Briefcase className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-2xl font-bold text-zinc-300 animate-pulse">--</div>
            ) : error ? (
              <div className="text-red-500 text-sm">Error loading counts</div>
            ) : (
              <div className="text-2xl font-bold" data-testid="count-open">{data?.open}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-2xl font-bold text-zinc-300 animate-pulse">--</div>
            ) : error ? (
              <div className="text-red-500 text-sm">Error loading counts</div>
            ) : (
              <div className="text-2xl font-bold" data-testid="count-completed">{data?.completed}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OwnerDashboard;
