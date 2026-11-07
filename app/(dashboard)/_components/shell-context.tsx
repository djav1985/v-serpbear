'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { setAppTimezone } from 'utils/client/appTimezone';
import { AddDomainDialog } from './add-domain-dialog';
import { SettingsDialog } from './settings-dialog';

/** The part of a domain the shell needs. Kept small so only plain strings cross the server/client boundary. */
export type DomainSummary = { domain: string; slug: string };

type ShellContextValue = {
   domains: DomainSummary[];
   /** True when the server could not read the domain list, so the sidebar can say so instead of showing "none". */
   domainsFailed: boolean;
   openAddDomain: () => void;
   openSettings: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export const useShell = (): ShellContextValue => {
   const value = useContext(ShellContext);
   if (!value) { throw new Error('useShell must be used inside ShellProvider'); }
   return value;
};

type ShellProviderProps = {
   domains: DomainSummary[];
   domainsFailed: boolean;
   /** The app's time zone (TZ on the server). Browsers cannot read it, so the server hands it down. */
   timezone: string;
   children: ReactNode;
};

/** Owns the global dialogs (Add Domain, Settings) so the sidebar, header and pages can all open them. */
export function ShellProvider({ domains, domainsFailed, timezone, children }: ShellProviderProps) {
   // Set during render so every date helper below already sees it on the first paint.
   setAppTimezone(timezone);

   const [addDomainOpen, setAddDomainOpen] = useState(false);
   const [settingsOpen, setSettingsOpen] = useState(false);

   const value = useMemo<ShellContextValue>(() => ({
      domains,
      domainsFailed,
      openAddDomain: () => setAddDomainOpen(true),
      openSettings: () => setSettingsOpen(true),
   }), [domains, domainsFailed]);

   return (
      <ShellContext.Provider value={value}>
         {children}
         <AddDomainDialog open={addDomainOpen} onOpenChange={setAddDomainOpen} existingDomains={domains} />
         <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </ShellContext.Provider>
   );
}
