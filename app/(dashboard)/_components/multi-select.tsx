'use client';

import { Button } from 'components/ui/button';
import {
   DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from 'components/ui/dropdown-menu';

export type MultiSelectOption = { label: string; value: string; flag?: string };

type MultiSelectProps = {
   label: string;
   allLabel: string;
   options: MultiSelectOption[];
   selected: string[];
   onChange: (next: string[]) => void;
   emptyMessage: string;
   testId: string;
};

export function MultiSelect({ label, allLabel, options, selected, onChange, emptyMessage, testId }: MultiSelectProps) {
   const summary = selected.length === 0 ? allLabel : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0]) : `${selected.length} selected`;
   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid={testId} aria-label={label} className="max-w-44 justify-start">
               <span className="truncate">{summary}</span>
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {options.length === 0 && <p className="text-muted-foreground px-2 py-1.5 text-xs">{emptyMessage}</p>}
            {options.map((option) => (
               <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={selected.includes(option.value)}
                  // Keep the menu open so several values can be ticked in one go.
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => onChange(checked ? [...selected, option.value] : selected.filter((v) => v !== option.value))}
               >
                  {option.flag && <span className={`fflag fflag-${option.flag} h-[12px] w-[18px] shrink-0`} />}
                  <span className="truncate">{option.label}</span>
               </DropdownMenuCheckboxItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
