'use client';

import type { ReactNode } from 'react';
import { Check, Mail, Plus } from 'lucide-react';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import type { TrackerDevice } from 'utils/keywordMeta';

const DEVICES: { value: TrackerDevice; label: string }[] = [{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }];

type AddToTrackerBarProps = {
   selectedCount: number;
   label?: string;
   devices: TrackerDevice[];
   onDevicesChange: (devices: TrackerDevice[]) => void;
   onAdd: () => void;
   addDisabled?: boolean;
   onEmail?: () => void;
   emailDisabled?: boolean;
   /** Extra control placed first, for example the domain picker on the Research page. */
   children?: ReactNode;
   onClear: () => void;
};

/** Shown instead of the filters while ideas are selected: pick devices, then add them to the tracker or email them. */
export function AddToTrackerBar({
   selectedCount, label, devices, onDevicesChange, onAdd, addDisabled = false, onEmail, emailDisabled = false, children, onClear,
}: AddToTrackerBarProps) {
   const toggle = (device: TrackerDevice) => onDevicesChange(devices.includes(device) ? devices.filter((d) => d !== device) : [...devices, device]);
   return (
      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:items-center" data-testid="bulk_actions">
         <span className="text-muted-foreground text-sm font-medium sm:mr-2">{selectedCount} selected{label ? ` · ${label}` : ''}</span>
         {children}
         <div className="flex gap-2" role="group" aria-label="Devices">
            {DEVICES.map(({ value, label: deviceLabel }) => (
               <button
                  key={value}
                  type="button"
                  aria-pressed={devices.includes(value)}
                  className={cn('flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium', devices.includes(value) ? 'bg-accent text-accent-foreground border-primary/30' : 'text-muted-foreground')}
                  onClick={() => toggle(value)}
               >
                  <Check className={cn('size-3.5', !devices.includes(value) && 'opacity-30')} />{deviceLabel}
               </button>
            ))}
         </div>
         <Button size="sm" disabled={addDisabled} onClick={onAdd}><Plus />Add Keyword</Button>
         {onEmail && <Button size="sm" variant="secondary" disabled={emailDisabled} onClick={onEmail}><Mail />Email Keywords</Button>}
         <Button size="sm" variant="ghost" className="sm:ml-auto" onClick={onClear}>Clear</Button>
      </div>
   );
}
