import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import type { WorkOrder } from '../pages/TechnicianFeed';
import { Upload, Paperclip } from 'lucide-react';

interface Props {
  workOrder: WorkOrder | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TechnicianExecutionView({ workOrder, isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);

  const progressMutation = useMutation({
    mutationFn: async (status_to: string) => {
      const event_id = crypto.randomUUID();
      const response = await api.post(`/work-orders/${workOrder?.id}/progress`, {
        event_id,
        status_to
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technician-work-orders'] });
      // Call onClose to close modal or let the UI update. 
      // Based on typical flows, we might leave it open to see state.
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/attachments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    },
    onSuccess: (data) => {
      setAttachments(prev => [...prev, data]);
    },
    onSettled: () => {
      setUploading(false);
    }
  });

  const handleStatusChange = (status_to: string) => {
    progressMutation.mutate(status_to);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      uploadMutation.mutate(file);
    }
  };

  if (!workOrder) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={workOrder.title}>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-zinc-600">{workOrder.description}</p>
          <div className="mt-2 text-sm text-zinc-500">
            <strong>Location:</strong> {workOrder.location || 'N/A'}
          </div>
          <div className="mt-1 text-sm font-semibold capitalize text-zinc-900">
            Status: {workOrder.status.replace('_', ' ')}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {workOrder.status === 'assigned' && (
            <Button 
              size="lg" 
              className="w-full text-lg h-14" 
              onClick={() => handleStatusChange('in_progress')}
              disabled={progressMutation.isPending}
            >
              Start Work
            </Button>
          )}

          {workOrder.status === 'in_progress' && (
            <Button 
              size="lg" 
              className="w-full text-lg h-14" 
              variant="default"
              onClick={() => handleStatusChange('completed')}
              disabled={progressMutation.isPending}
            >
              Complete Work
            </Button>
          )}

          {workOrder.status === 'in_progress' && (
            <Button 
              size="lg" 
              className="w-full text-lg h-14 bg-zinc-200 text-zinc-800 hover:bg-zinc-300" 
              onClick={() => handleStatusChange('on_hold')}
              disabled={progressMutation.isPending}
            >
              Put on Hold
            </Button>
          )}

          {workOrder.status === 'on_hold' && (
            <Button 
              size="lg" 
              className="w-full text-lg h-14" 
              onClick={() => handleStatusChange('in_progress')}
              disabled={progressMutation.isPending}
            >
              Resume Work
            </Button>
          )}
        </div>

        <div className="border-t border-zinc-200 pt-4">
          <h3 className="text-sm font-semibold mb-3">Attachments</h3>
          
          <div className="flex items-center gap-4">
            <label className="flex items-center justify-center cursor-pointer bg-zinc-50 hover:bg-zinc-100 border-2 border-dashed border-zinc-300 rounded-lg p-4 w-full transition-colors">
              <input 
                type="file" 
                className="hidden" 
                onChange={handleFileUpload} 
                accept="image/*,application/pdf"
                data-testid="file-upload"
                aria-label="Upload"
              />
              <div className="flex flex-col items-center text-zinc-500">
                <Upload className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">{uploading ? 'Uploading...' : 'Upload Image / PDF'}</span>
              </div>
            </label>
          </div>

          {attachments.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-zinc-600 bg-zinc-50 p-2 rounded">
                  <Paperclip className="h-4 w-4" />
                  <span>{att.file_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
