'use client';

import { useState } from 'react';
import { Button } from 'components/ui/button';
import {
   Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from 'components/ui/dialog';
import { LocationPicker } from '../../domain/_components/location-picker';
import { TagInput } from '../../domain/_components/tag-input';

type AddToTrackerDialogProps = {
   selectedCount: number;
   existingTags: string[];
   existingLocations: string[];
   allowsCity: boolean;
   isAdding?: boolean;
   onConfirm: (details: { tags: string[]; location: string; country: string }) => void;
   onClose: () => void;
};

const parseTags = (input: string): string[] => [...new Set(input.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0))];

/** The step between picking ideas and tracking them: choose tags and a location. */
export function AddToTrackerDialog({ selectedCount, existingTags, existingLocations, allowsCity, isAdding = false, onConfirm, onClose }: AddToTrackerDialogProps) {
   const [tagInput, setTagInput] = useState('');
   // Nothing is picked until the user chooses a location or adds a country-only choice.
   const [selection, setSelection] = useState<{ location: string; country: string } | null>(null);

   return (
      <Dialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
         <DialogContent className="sm:max-w-sm" data-testid="add_meta_step">
            <DialogHeader>
               <DialogTitle>Add {selectedCount} keyword{selectedCount === 1 ? '' : 's'} to Tracker</DialogTitle>
               <DialogDescription>Tags and a location are optional.</DialogDescription>
            </DialogHeader>
            <div>
               <p className="text-muted-foreground mb-1 text-sm font-semibold">Tags</p>
               <TagInput value={tagInput} onChange={setTagInput} existingTags={existingTags} placeholder="Insert tags (optional). e.g. tag1, tag2" />
            </div>
            <LocationPicker
               existingLocations={existingLocations}
               value={selection?.location ?? ''}
               onChange={(location, country) => setSelection({ location, country })}
               allowsCity={allowsCity}
               sectionLabels
               defaultCountry="US"
            />
            <DialogFooter>
               <Button variant="outline" onClick={onClose}>Cancel</Button>
               <Button disabled={isAdding} onClick={() => { if (!isAdding) { onConfirm({ tags: parseTags(tagInput), location: selection?.location ?? '', country: selection?.country ?? '' }); } }}>
                  {isAdding ? 'Adding…' : 'Track'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
