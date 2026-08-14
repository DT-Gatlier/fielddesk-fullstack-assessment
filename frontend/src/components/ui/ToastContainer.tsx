import { useToastStore } from '../../store/useToastStore';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div style={{
      position: 'fixed',
      bottom: '2rem',
      right: '2rem',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      pointerEvents: 'none',
    }}>
      {toasts.map((toast) => {
        let icon;
        let borderColor;
        
        switch (toast.type) {
          case 'success':
            icon = <CheckCircle size={18} />;
            borderColor = 'var(--success)';
            break;
          case 'error':
            icon = <AlertCircle size={18} />;
            borderColor = 'var(--error)';
            break;
          case 'warning':
            icon = <AlertTriangle size={18} />;
            borderColor = 'var(--warning)';
            break;
          default:
            icon = <Info size={18} />;
            borderColor = 'var(--primary)';
        }

        return (
          <div key={toast.id} className="toast-message" style={{
            background: 'var(--surface)',
            borderLeft: `4px solid ${borderColor}`,
            boxShadow: 'var(--shadow-md)',
            borderRadius: 'var(--radius)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            minWidth: '300px',
            maxWidth: '400px',
            pointerEvents: 'auto',
          }}>
            <div style={{ color: borderColor, display: 'flex', alignItems: 'center' }}>
              {icon}
            </div>
            <div style={{ flexGrow: 1, fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 500 }}>
              {toast.message}
            </div>
            <button 
              onClick={() => removeToast(toast.id)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
