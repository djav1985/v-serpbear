'use client';

import { Plus } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Separator } from 'components/ui/separator';
import { SidebarTrigger } from 'components/ui/sidebar';
import { useShell } from './shell-context';

/** Top bar: sidebar toggle plus the Add Domain shortcut that the legacy mobile layout had. */
export function DashboardHeader() {
   const { openAddDomain } = useShell();

   return (
      <header className="bg-background/80 sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-md lg:px-6">
         <SidebarTrigger className="-ml-1" />
         <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
         <div className="flex-1" />
         <Button size="sm" variant="outline" aria-label="Add Domain" onClick={openAddDomain}>
            <Plus />
            <span className="hidden sm:inline">Add Domain</span>
         </Button>
      </header>
   );
}
