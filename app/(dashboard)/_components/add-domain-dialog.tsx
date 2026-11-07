'use client';

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from 'components/ui/button';
import {
   Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from 'components/ui/dialog';
import { Label } from 'components/ui/label';
import { Textarea } from 'components/ui/textarea';
import { apiPost } from 'utils/client/apiClient';
import { isValidUrl } from 'utils/client/validators';
import { normalizeHostFromString } from 'utils/validators/hostname';

type AddDomainDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   existingDomains: { domain: string }[];
};

export function AddDomainDialog({ open, onOpenChange, existingDomains }: AddDomainDialogProps) {
   const router = useRouter();
   const queryClient = useQueryClient();
   const [value, setValue] = useState('');
   const [error, setError] = useState('');

   const close = (next: boolean) => {
      onOpenChange(next);
      if (!next) { setValue(''); setError(''); }
   };

   const { mutate, isPending } = useMutation({
      mutationFn: (domains: string[]) => apiPost<{ domains: DomainType[] }>('/api/domains', { domains }),
      onSuccess: (data) => {
         const added = data.domains;
         const single = added.length === 1;
         toast.success(`${single ? added[0].domain : `${added.length} domains`} added successfully`);
         close(false);
         queryClient.invalidateQueries({ queryKey: ['domains'] });
         // Re-runs the dashboard layout so the sidebar list picks up the new domain.
         router.refresh();
         if (single) { router.push(`/domain/${added[0].slug}`); }
      },
      onError: () => { toast.error('Error adding new domain'); },
   });

   const submit = () => {
      setError('');
      const existing = new Set(existingDomains.map((d) => d.domain));
      const toAdd = new Set<string>();
      const invalid: string[] = [];
      let duplicateCount = 0;

      value.split('\n').forEach((line) => {
         const url = line.trim();
         if (!url) { return; }
         const host = isValidUrl(url) ? normalizeHostFromString(url) : null;
         if (!host) { invalid.push(url); return; }
         if (existing.has(host) || toAdd.has(host)) { duplicateCount += 1; return; }
         toAdd.add(host);
      });

      if (invalid.length > 0) {
         setError(`Please insert a valid website URL.${invalid.length > 1 ? ` Invalid URLs: ${invalid.join(', ')}` : ''}`);
      } else if (toAdd.size > 0) {
         mutate(Array.from(toAdd));
      } else if (duplicateCount > 0) {
         setError('All provided domains are already tracked or duplicates.');
      }
   };

   const onInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
      if (event.currentTarget.value === '' && error) { setError(''); }
      setValue(event.currentTarget.value);
   };

   return (
      <Dialog open={open} onOpenChange={close}>
         <DialogContent data-testid="adddomain_modal">
            <DialogHeader>
               <DialogTitle>Add new domain</DialogTitle>
               <DialogDescription>Put each website URL on its own line.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
               <Label htmlFor="add-domain-urls">Website URL(s)</Label>
               <Textarea
                  id="add-domain-urls"
                  className="h-40"
                  placeholder={'https://mysite.com/\nhttps://anothersite.com/'}
                  value={value}
                  aria-invalid={!!error}
                  onChange={onInput}
               />
               {error && <p role="alert" className="text-destructive text-xs font-medium">{error}</p>}
            </div>
            <DialogFooter>
               <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
               <Button disabled={isPending} onClick={() => { if (!isPending) { submit(); } }}>
                  {isPending ? 'Adding…' : 'Add Domain'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
