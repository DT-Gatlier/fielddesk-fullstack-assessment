import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all">
      <div 
        className="fixed inset-0" 
        onClick={onClose}
      />
      <div className={cn("relative z-50 w-full max-w-lg rounded-[2rem] bg-white p-1 shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200", className)}>
        <div className="flex h-full w-full flex-col rounded-[1.75rem] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h2>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
