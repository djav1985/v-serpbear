'use client';

import { useEffect, ViewTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'components/ui/sheet';
import { getClientOrigin } from 'utils/client/origin';
import { settingsKey } from '../domain/_components/keyword-queries';
import { SettingsForm } from './settings/settings-form';

type SettingsDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   platformName: string;
};

/**
 * The global settings, in a side sheet. The Google Ads sign-in finishes in another tab and reports back with a message,
 * so the listener lives here, where it stays mounted whether or not the sheet is open.
 */
export function SettingsDialog({ open, onOpenChange, platformName }: SettingsDialogProps) {
   const queryClient = useQueryClient();

   useEffect(() => {
      const expectedOrigin = getClientOrigin();
      const onMessage = (event: MessageEvent) => {
         if (event.origin !== expectedOrigin) { return; }
         const data = event.data as { type?: string; status?: string; message?: string } | null;
         if (!data || data.type !== 'adwordsIntegrated') { return; }
         if (data.status === 'success') {
            toast.success('Google Ads has been integrated successfully!');
            // The callback already stored the new token on the server; reading it again picks it up.
            queryClient.invalidateQueries({ queryKey: settingsKey });
         } else {
            toast.error(data.message || 'Google Ads integration failed. Please try again.');
         }
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
   }, [queryClient]);

   return (
      <Sheet open={open} onOpenChange={onOpenChange}>
         <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
            <SheetHeader>
               <SheetTitle>Settings</SheetTitle>
               <SheetDescription className="sr-only">Scraper, notification and integration settings</SheetDescription>
            </SheetHeader>
            <ViewTransition default="none">
               {open && <SettingsForm platformName={platformName} />}
            </ViewTransition>
         </SheetContent>
      </Sheet>
   );
}
