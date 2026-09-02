import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Calendar, MapPin, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  priority?: string;
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'open': return 'default';
    case 'assigned': return 'secondary';
    case 'in_progress': return 'warning';
    case 'completed': return 'success';
    case 'cancelled': return 'destructive';
    case 'on_hold': return 'outline';
    default: return 'default';
  }
};

const TechnicianFeed: React.FC = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['technician-work-orders'],
    queryFn: async () => {
      const response = await api.get('/work-orders');
      return response.data;
    }
  });

  const workOrders: WorkOrder[] = data?.data || [];

  if (isLoading) {
    return <div className="p-4 text-center text-zinc-500">Loading your assignments...</div>;
  }

  if (isError) {
    return <div className="p-4 text-center text-red-500">Failed to load work orders.</div>;
  }

  if (workOrders.length === 0) {
    return <div className="p-4 text-center text-zinc-500">No work orders assigned.</div>;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto h-full overflow-y-auto">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mb-6">My Assigned Work</h1>
      <div 
        data-testid="technician-feed-grid"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      >
        {workOrders.map((order) => (
          <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]">
            <CardHeader className="pb-3 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-zinc-900 line-clamp-1">
                  {order.title}
                </CardTitle>
                <div className="flex items-center gap-1 text-sm text-zinc-500 mt-1">
                  <MapPin className="h-4 w-4" />
                  <span className="truncate">{order.title}</span>
                </div>
              </div>
              <Badge variant={getStatusColor(order.status) as any} className="capitalize flex-shrink-0">
                {order.status.replace('_', ' ')}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <div className="flex flex-row gap-4 text-sm text-zinc-600">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-zinc-400" />
                    <span>{new Date(order.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-zinc-400" />
                    <span className="capitalize">{order.priority || 'Normal'}</span>
                  </div>
                </div>
                <p className="text-sm text-zinc-500 line-clamp-2 mt-2">
                  {order.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default TechnicianFeed;
