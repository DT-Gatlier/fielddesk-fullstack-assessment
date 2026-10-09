'use client';

import { useState } from 'react';
import { Copy, Check, Users, KeyRound, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export interface DemoUser {
  name: string;
  email: string;
  role: 'OWNER' | 'DISPATCHER' | 'TECHNICIAN';
  organisation: string;
}

export const DEMO_PASSWORD = 'Demo2026';

export const DEMO_ACCOUNTS: DemoUser[] = [
  // Organisation 1: Clearbrook Maintenance
  {
    name: 'Arjun Nair',
    email: 'arjun.nair@clearbrook.org',
    role: 'OWNER',
    organisation: 'Clearbrook Maintenance',
  },
  {
    name: 'Meera Menon',
    email: 'meera.menon@clearbrook.org',
    role: 'DISPATCHER',
    organisation: 'Clearbrook Maintenance',
  },
  {
    name: 'Rahul Sharma',
    email: 'rahul.sharma@clearbrook.org',
    role: 'TECHNICIAN',
    organisation: 'Clearbrook Maintenance',
  },
  {
    name: 'Priya Patel',
    email: 'priya.patel@clearbrook.org',
    role: 'TECHNICIAN',
    organisation: 'Clearbrook Maintenance',
  },
  {
    name: 'Kiran Rao',
    email: 'kiran.rao@clearbrook.org',
    role: 'TECHNICIAN',
    organisation: 'Clearbrook Maintenance',
  },
  // Organisation 2: Oakridge Property Services
  {
    name: 'Ananya Iyer',
    email: 'ananya.iyer@oakridge.org',
    role: 'OWNER',
    organisation: 'Oakridge Property Services',
  },
  {
    name: 'Vikram Singh',
    email: 'vikram.singh@oakridge.org',
    role: 'DISPATCHER',
    organisation: 'Oakridge Property Services',
  },
  {
    name: 'Neha Gupta',
    email: 'neha.gupta@oakridge.org',
    role: 'TECHNICIAN',
    organisation: 'Oakridge Property Services',
  },
  {
    name: 'Rohan Das',
    email: 'rohan.das@oakridge.org',
    role: 'TECHNICIAN',
    organisation: 'Oakridge Property Services',
  },
  {
    name: 'Aditi Joshi',
    email: 'aditi.joshi@oakridge.org',
    role: 'TECHNICIAN',
    organisation: 'Oakridge Property Services',
  },
];

interface DemoAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAccount?: (account: DemoUser) => void;
}

export function DemoAccountsDialog({
  open,
  onOpenChange,
  onSelectAccount,
}: DemoAccountsDialogProps) {
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const copyToClipboard = async (text: string, isEmail = true) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isEmail) {
        setCopiedEmail(text);
        setTimeout(() => setCopiedEmail(null), 2000);
      } else {
        setCopiedPassword(true);
        setTimeout(() => setCopiedPassword(false), 2000);
      }
    } catch {
      /* Fallback clipboard handling if needed */
    }
  };

  const getRoleBadgeVariant = (role: DemoUser['role']) => {
    switch (role) {
      case 'OWNER':
        return 'default';
      case 'DISPATCHER':
        return 'info';
      case 'TECHNICIAN':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  const clearbrookUsers = DEMO_ACCOUNTS.filter(
    (u) => u.organisation === 'Clearbrook Maintenance',
  );
  const oakridgeUsers = DEMO_ACCOUNTS.filter(
    (u) => u.organisation === 'Oakridge Property Services',
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-xl max-h-[85vh] flex flex-col p-6">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <Users className="size-5 text-primary" />
          Demo Test Accounts
        </DialogTitle>
        <DialogDescription>
          Pre-seeded test accounts for role-based testing across multiple organisations.
        </DialogDescription>
      </DialogHeader>

      {/* Shared Password Callout */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <span className="text-muted-foreground">Default password for all accounts:</span>
          <code className="rounded bg-background px-2 py-0.5 font-mono font-semibold text-foreground">
            {DEMO_PASSWORD}
          </code>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => copyToClipboard(DEMO_PASSWORD, false)}
        >
          {copiedPassword ? (
            <>
              <Check className="size-3.5 text-emerald-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              Copy
            </>
          )}
        </Button>
      </div>

      {/* Account Lists */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-1">
        {/* Clearbrook */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Building2 className="size-3.5" />
            Clearbrook Maintenance
          </div>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {clearbrookUsers.map((user) => (
              <div
                key={user.email}
                className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{user.name}</span>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {user.role}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-mono text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (onSelectAccount) {
                        onSelectAccount(user);
                        onOpenChange(false);
                      }
                    }}
                  >
                    Auto-fill
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title="Copy Email"
                    onClick={() => copyToClipboard(user.email, true)}
                  >
                    {copiedEmail === user.email ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Oakridge */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Building2 className="size-3.5" />
            Oakridge Property Services
          </div>
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {oakridgeUsers.map((user) => (
              <div
                key={user.email}
                className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{user.name}</span>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {user.role}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-mono text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (onSelectAccount) {
                        onSelectAccount(user);
                        onOpenChange(false);
                      }
                    }}
                  >
                    Auto-fill
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title="Copy Email"
                    onClick={() => copyToClipboard(user.email, true)}
                  >
                    {copiedEmail === user.email ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
