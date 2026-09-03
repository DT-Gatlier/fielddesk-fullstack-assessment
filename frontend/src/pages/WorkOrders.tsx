import { useEffect, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { SortingState, ColumnFiltersState } from '@tanstack/react-table';
import { Plus, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, User as UserIcon, Calendar, MapPin, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Modal } from '../components/ui/modal';
import { cn } from '../lib/utils';

// ... (rest of the file as before, I'll paste the full component)

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

const WorkOrders = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  
  // Modals state
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isProgressModalOpen, setProgressModalOpen] = useState(false);
  
  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('open');
  const [techId, setTechId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progressStatus, setProgressStatus] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOrder) {
      setTechId(selectedOrder.technician_id || '');
      if (selectedOrder.scheduled_range) {
        const formatLocal = (d: Date) => {
          const pad = (n: number) => n.toString().padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        setStartDate(formatLocal(new Date(selectedOrder.scheduled_range[0])));
        setEndDate(formatLocal(new Date(selectedOrder.scheduled_range[1])));
      } else {
        setStartDate('');
        setEndDate('');
      }
      setAssignError(null);
    }
  }, [selectedOrder]);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const { data: workOrdersData, isLoading } = useQuery({
    queryKey: ['workOrders'],
    queryFn: async () => {
      const response = await api.get('/work-orders?pageSize=1000');
      return response.data;
    }
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: async () => {
      const response = await api.get('/technicians');
      return response.data;
    }
  });

  const workOrders = workOrdersData?.data || [];

  const [highlightedRowIds, setHighlightedRowIds] = useState<Set<string>>(new Set());
  const highlightTimeouts = React.useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    return () => {
      Object.values(highlightTimeouts.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:8000', {
      auth: { token },
      path: '/socket.io'
    });

    socket.on('work_order_updated', (updatedOrder) => {
      queryClient.setQueryData(['workOrders'], (oldData: any) => {
        if (!oldData || !oldData.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((order: any) =>
            order.id === updatedOrder.id ? updatedOrder : order
          ),
        };
      });
      // If the currently selected order was updated, update local selection
      setSelectedOrder((prev: any) => prev && prev.id === updatedOrder.id ? updatedOrder : prev);
      
      setHighlightedRowIds((prev) => {
        const next = new Set(prev);
        next.add(updatedOrder.id);
        return next;
      });

      if (highlightTimeouts.current[updatedOrder.id]) {
        clearTimeout(highlightTimeouts.current[updatedOrder.id]);
      }
      
      highlightTimeouts.current[updatedOrder.id] = setTimeout(() => {
        setHighlightedRowIds((prev) => {
          const next = new Set(prev);
          next.delete(updatedOrder.id);
          return next;
        });
        delete highlightTimeouts.current[updatedOrder.id];
      }, 2000);
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
    setAssignError(null);
    try {
      await api.post(`/work-orders/${selectedOrder.id}/assign`, {
        technician_id: techId,
        scheduled_start: new Date(startDate).toISOString(),
        scheduled_end: new Date(endDate).toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    } catch (err: any) {
      if (err.response?.status === 409) {
        setAssignError(err.response.data.error || 'Technician is already booked for this time slot.');
      } else {
        console.error(err);
      }
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

  const columns = useMemo(() => [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: (info: any) => <span className="font-mono text-xs">{info.getValue().split('-')[0]}</span>,
    },
    {
      accessorKey: 'title',
      header: 'Title',
      cell: (info: any) => <span className="font-medium text-zinc-900">{info.getValue()}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info: any) => {
        const val = info.getValue();
        return (
          <Badge variant={getStatusColor(val)} className="capitalize">
            {val.replace('_', ' ')}
          </Badge>
        );
      },
    },
    {
      accessorFn: (row: any) => {
        if (!row.technician_id) return 'Unassigned';
        const t = technicians.find((tech: any) => tech.id === row.technician_id);
        return t ? t.email : row.technician_id;
      },
      id: 'technician',
      header: 'Technician',
      cell: (info: any) => {
        const val = info.getValue();
        if (val === 'Unassigned') {
          return <span className="text-sm text-zinc-400">Unassigned</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <UserIcon className="h-3 w-3 text-zinc-400" />
            <span className="text-sm">{val.split('@')[0]}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: (info: any) => {
        const val = info.getValue();
        return (
          <div className="flex items-center gap-2 text-zinc-500">
            <Calendar className="h-3 w-3" />
            <span className="text-sm">{new Date(val).toLocaleDateString()}</span>
          </div>
        );
      },
    },
  ], [technicians]);

  const table = useReactTable({
    data: workOrders,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="flex h-full w-full overflow-hidden bg-zinc-50/50">
      
      {/* Data Table */}
      <div className={cn("flex flex-col h-full z-10 transition-all duration-300", selectedOrder ? "w-[600px] border-r border-zinc-200 bg-white shadow-lg" : "w-full bg-white")}>
        <div className="p-6 border-b border-zinc-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Work Orders</h1>
              <p className="text-sm text-zinc-500 mt-1">Manage and dispatch field service requests.</p>
            </div>
            <Button aria-label="Create Work Order" onClick={() => setCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create Order
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search orders..." 
                value={globalFilter ?? ''}
                onChange={e => setGlobalFilter(e.target.value)}
                className="w-full h-10 pl-9 pr-4 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            
            <select 
              className="h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              value={(table.getColumn('status')?.getFilterValue() as string) ?? ''}
              onChange={e => table.getColumn('status')?.setFilterValue(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="on_hold">On Hold</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th key={header.id} className="px-4 py-3 font-medium text-zinc-500">
                        {header.isPlaceholder ? null : (
                          <div 
                            className={cn("flex items-center gap-2", header.column.getCanSort() && "cursor-pointer select-none hover:text-zinc-900")}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <ChevronUp className="h-4 w-4" />,
                              desc: <ChevronDown className="h-4 w-4" />,
                            }[header.column.getIsSorted() as string] ?? (header.column.getCanSort() ? <div className="w-4" /> : null)}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {isLoading ? (
                  <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-zinc-500">Loading work orders...</td></tr>
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-zinc-500">No results found.</td></tr>
                ) : (
                  table.getRowModel().rows.map(row => (
                    <tr 
                      key={row.id} 
                      onClick={() => setSelectedOrder(row.original)}
                      className={cn(
                        "hover:bg-zinc-50 transition-colors cursor-pointer",
                        selectedOrder?.id === row.original.id && "bg-zinc-50",
                        highlightedRowIds.has(row.original.id) && "bg-yellow-100/50"
                      )}
                      data-testid={`row-${row.original.id}`}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-zinc-500">
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + (table.getFilteredRowModel().rows.length > 0 ? 1 : 0)} to{' '}
              {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of{' '}
              {table.getFilteredRowModel().rows.length} results
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail View / Slide-out side panel */}
      {selectedOrder && (
        <div className="flex-1 bg-zinc-50/50 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300 relative">
          <div className="absolute top-4 right-4 z-20">
            <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 pt-16">
            <div className="max-w-3xl mx-auto space-y-6">
              
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant={getStatusColor(selectedOrder.status)} className="capitalize mb-3">
                    {selectedOrder.status.replace('_', ' ')}
                  </Badge>
                  <h2 className="text-3xl font-bold tracking-tight text-zinc-900 mb-2">{selectedOrder.title}</h2>
                  <p className="text-zinc-500">ID: {selectedOrder.id}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {user?.id === selectedOrder.technician_id && (
                    <Button onClick={() => setProgressModalOpen(true)}>Update Progress</Button>
                  )}
                  <Button variant="destructive" onClick={handleDelete}>Delete</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="p-6 rounded-[2rem] bg-white shadow-sm ring-1 ring-zinc-200">
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-900 mb-4 flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-zinc-400" />
                    Assignment Details
                  </h3>
                  <form onSubmit={handleAssignSubmit} className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <label className="text-zinc-500 block">Technician</label>
                      <select 
                        required 
                        aria-label="Technician"
                        value={techId} 
                        onChange={e => setTechId(e.target.value)} 
                        className={cn("w-full rounded-xl border-zinc-200 px-3 py-2 border text-sm", assignError && "border-red-500")}
                      >
                        <option value="">Select Technician...</option>
                        {technicians.map((t: any) => <option key={t.id} value={t.id}>{t.email}</option>)}
                      </select>
                      {assignError && <p className="text-red-500 text-xs mt-1">{assignError}</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-zinc-500 block">Start Date/Time</label>
                      <input 
                        required 
                        aria-label="Start Date/Time"
                        type="datetime-local" 
                        value={startDate} 
                        onChange={e => setStartDate(e.target.value)} 
                        className="w-full rounded-xl border-zinc-200 px-3 py-2 border text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-zinc-500 block">End Date/Time</label>
                      <input 
                        required 
                        aria-label="End Date/Time"
                        type="datetime-local" 
                        value={endDate} 
                        onChange={e => setEndDate(e.target.value)} 
                        className="w-full rounded-xl border-zinc-200 px-3 py-2 border text-sm"
                      />
                    </div>
                    <div className="pt-2">
                      <Button type="submit" className="w-full rounded-full">Save Assignment</Button>
                    </div>
                  </form>
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
        </div>
      )}

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
