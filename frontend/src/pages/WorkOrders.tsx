import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, MapPin, Calendar, User as UserIcon, Paperclip } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Modal } from '../components/ui/modal';
import { cn } from '../lib/utils';

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  technician_id?: string;
  scheduled_range?: [string, string];
}

interface Technician {
  id: string;
  email: string;
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

const WorkOrders: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  
  // Modals state
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isAssignModalOpen, setAssignModalOpen] = useState(false);
  const [isProgressModalOpen, setProgressModalOpen] = useState(false);
  
  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('open');
  const [techId, setTechId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progressStatus, setProgressStatus] = useState('');

  const { data: workOrdersData, isLoading } = useQuery({
    queryKey: ['workOrders'],
    queryFn: async () => {
      const response = await api.get(`/work-orders?pageSize=100`);
      return response.data;
    }
  });

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ['technicians'],
    queryFn: async () => {
      const response = await api.get('/technicians');
      return response.data;
    }
  });

  const workOrders: WorkOrder[] = workOrdersData?.data || [];

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket: Socket = io(import.meta.env.VITE_API_URL || 'http://localhost:8000', {
      auth: { token },
      path: '/socket.io'
    });

    socket.on('work_order_updated', (updatedOrder) => {
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
      // If the currently selected order was updated, update local selection
      setSelectedOrder(prev => prev && prev.id === updatedOrder.id ? updatedOrder : prev);
    });

    return () => { socket.disconnect(); };
  }, [queryClient]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/work-orders', { title, description, status });
      setCreateModalOpen(false);
      setTitle(''); setDescription(''); setStatus('open');
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      await api.post(`/work-orders/${selectedOrder.id}/assign`, {
        technician_id: techId,
        scheduled_start: new Date(startDate).toISOString(),
        scheduled_end: new Date(endDate).toISOString(),
      });
      setAssignModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      await api.post(`/work-orders/${selectedOrder.id}/progress`, {
        event_id: crypto.randomUUID(),
        status_to: progressStatus,
      });
      setProgressModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrder) return;
    try {
      await api.delete(`/work-orders/${selectedOrder.id}`);
      setSelectedOrder(null);
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      
      {/* Master List View */}
      <div className="w-[400px] flex-shrink-0 border-r border-zinc-200 bg-white flex flex-col h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col gap-4 p-4 border-b border-zinc-100">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Work Orders</h1>
            <Button aria-label="Create Work Order" size="icon" onClick={() => setCreateModalOpen(true)} className="h-8 w-8 rounded-full">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search orders..." 
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-zinc-50 border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-zinc-500">Loading orders...</div>
          ) : workOrders.map(order => (
            <button 
              key={order.id}
              onClick={() => setSelectedOrder(order)}
              className={cn(
                "w-full text-left p-3 rounded-xl transition-all border",
                selectedOrder?.id === order.id 
                  ? "bg-zinc-50 border-zinc-200 shadow-sm" 
                  : "bg-transparent border-transparent hover:bg-zinc-50"
              )}
            >
              <div className="flex items-start justify-between mb-1">
                <span className="font-semibold text-zinc-900 truncate pr-2">{order.title}</span>
                <Badge variant={getStatusColor(order.status) as any} className="capitalize flex-shrink-0 text-[10px] px-1.5 py-0">
                  {order.status.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 line-clamp-1 mb-2">{order.description}</p>
              <div className="flex items-center gap-3 text-[11px] text-zinc-400 font-medium">
                <span className="flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  {order.technician_id ? technicians.find(t => t.id === order.technician_id)?.email.split('@')[0] : 'Unassigned'}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(order.created_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail View */}
      <div className="flex-1 bg-zinc-50/50 flex flex-col h-full overflow-hidden">
        {selectedOrder ? (
          <div className="flex-1 overflow-y-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="max-w-3xl mx-auto space-y-6">
              
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant={getStatusColor(selectedOrder.status) as any} className="capitalize mb-3">
                    {selectedOrder.status.replace('_', ' ')}
                  </Badge>
                  <h2 className="text-3xl font-bold tracking-tight text-zinc-900 mb-2">{selectedOrder.title}</h2>
                  <p className="text-zinc-500">ID: {selectedOrder.id}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setAssignModalOpen(true)}>Assign Tech</Button>
                  {user?.id === selectedOrder.technician_id && (
                    <Button onClick={() => setProgressModalOpen(true)}>Update Progress</Button>
                  )}
                  <Button variant="destructive" onClick={handleDelete}>Delete</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="p-6 rounded-[2rem] bg-white shadow-sm ring-1 ring-zinc-200">
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-900 mb-4 flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-zinc-400" />
                    Assignment Details
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Technician</span>
                      <span className="font-medium text-zinc-900">
                        {selectedOrder.technician_id ? technicians.find(t => t.id === selectedOrder.technician_id)?.email : 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Scheduled Start</span>
                      <span className="font-medium text-zinc-900">
                        {selectedOrder.scheduled_range ? new Date(selectedOrder.scheduled_range[0]).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Scheduled End</span>
                      <span className="font-medium text-zinc-900">
                        {selectedOrder.scheduled_range ? new Date(selectedOrder.scheduled_range[1]).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-[2rem] bg-white shadow-sm ring-1 ring-zinc-200">
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-900 mb-4 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-zinc-400" />
                    Location & Description
                  </h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {selectedOrder.description || 'No description provided.'}
                  </p>
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <div className="h-16 w-16 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
              <Paperclip className="h-6 w-6 text-zinc-300" />
            </div>
            <p className="font-medium text-zinc-500">Select a work order to view details</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setCreateModalOpen(false)} title="Create Work Order">
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">Title</label>
            <input id="title" required type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-xl border-zinc-200 px-3 py-2 border text-sm" />
          </div>
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">Description</label>
            <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-xl border-zinc-200 px-3 py-2 border text-sm" rows={4} />
          </div>
          <Button type="submit" className="w-full rounded-full">Create Order</Button>
        </form>
      </Modal>

      {/* Assign Modal */}
      <Modal isOpen={isAssignModalOpen} onClose={() => setAssignModalOpen(false)} title="Assign Technician">
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Technician</label>
            <select required value={techId} onChange={e => setTechId(e.target.value)} className="w-full rounded-xl border-zinc-200 px-3 py-2 border text-sm">
              <option value="">Select Technician...</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.email}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date/Time</label>
              <input required type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-xl border-zinc-200 px-3 py-2 border text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date/Time</label>
              <input required type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full rounded-xl border-zinc-200 px-3 py-2 border text-sm" />
            </div>
          </div>
          <Button type="submit" className="w-full rounded-full">Save Assignment</Button>
        </form>
      </Modal>

      {/* Progress Modal */}
      <Modal isOpen={isProgressModalOpen} onClose={() => setProgressModalOpen(false)} title="Update Progress">
        <form onSubmit={handleProgressSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">New Status</label>
            <select required value={progressStatus} onChange={e => setProgressStatus(e.target.value)} className="w-full rounded-xl border-zinc-200 px-3 py-2 border text-sm">
              <option value="">Select Status...</option>
              <option value="in_progress">In Progress</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <Button type="submit" className="w-full rounded-full">Submit Event</Button>
        </form>
      </Modal>
    </div>
  );
};

export default WorkOrders;
