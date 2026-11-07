'use client';

import {
   Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from 'components/ui/dialog';

type SettingsDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
};

/**
 * Entry point for the global settings. The forms (scraper, notifications, Search Console, Google Ads,
 * integrations) still live in components/settings/ on the legacy stack and move here in their own change.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Settings</DialogTitle>
               <DialogDescription>The settings forms are being moved to the new interface.</DialogDescription>
            </DialogHeader>
         </DialogContent>
      </Dialog>
   );
}
