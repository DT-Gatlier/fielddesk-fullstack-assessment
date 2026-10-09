'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  startTransition,
} from 'react';
import { usePathname } from 'next/navigation';
import Link, { type LinkProps } from 'next/link';

interface NavigationProgressContextValue {
  start: () => void;
  done: () => void;
}

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(null);

export function useNavigationProgress() {
  const context = useContext(NavigationProgressContext);
  if (!context) {
    throw new Error('useNavigationProgress must be used within NavigationProgressBar');
  }
  return context;
}

export function NavigationProgressBar({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    clearTimer();
    setVisible(true);
    setProgress(15);

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev < 60) return prev + Math.floor(Math.random() * 10) + 5;
        if (prev < 85) return prev + Math.floor(Math.random() * 5) + 2;
        return prev;
      });
    }, 200);
  }, [clearTimer]);

  const done = useCallback(() => {
    clearTimer();
    setProgress(100);
    const timeout = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [clearTimer]);

  useEffect(() => {
    // When the route transition finishes, finish the progress bar
    const frame = requestAnimationFrame(() => {
      done();
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, done]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return (
    <NavigationProgressContext.Provider value={{ start, done }}>
      {visible && (
        <div
          aria-hidden="true"
          className="fixed left-0 top-0 z-50 h-[2.5px] w-full bg-transparent pointer-events-none"
        >
          <div
            className="h-full bg-primary shadow-xs shadow-primary/50 transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {children}
    </NavigationProgressContext.Provider>
  );
}

interface NavLinkProps extends LinkProps {
  children: ReactNode;
  className?: string;
  'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | boolean;
}

export function NavLink({ href, children, onClick, ...props }: NavLinkProps) {
  const { start } = useNavigationProgress();
  const currentPath = usePathname();

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (href.toString() !== currentPath) {
          startTransition(() => {
            start();
          });
        }
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
