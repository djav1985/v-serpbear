'use client';

import { useEffect, useRef, useState } from 'react';
import { Tags, X } from 'lucide-react';
import { Button } from 'components/ui/button';
import {
   Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from 'components/ui/dialog';
import { LocationPicker } from '../../_components/location-picker';
import { TagInput } from '../../_components/tag-input';
import {
   useDeleteKeywords, useUpdateKeywordLocation, useUpdateKeywordTags,
} from '../../_components/keyword-queries';

/** Which dialog is open. It holds keyword IDs, not keywords, so a dialog always reads the freshest list. */
export type TrackerDialog =
   | { type: 'remove'; ids: number[] }
   | { type: 'addTags'; ids: number[] }
   | { type: 'removeTags'; ids: number[] }
   | { type: 'tagManager'; id: number }
   | { type: 'location'; ids: number[] }
   | null;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// ── Remove ─────────────────────────────────────────────────────────────────

function RemoveKeywordsDialog({ count, onConfirm, onClose, isPending }: { count: number; onConfirm: () => void; onClose: () => void; isPending: boolean }) {
   return (
      <Dialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Remove keywords</DialogTitle>
               <DialogDescription>Are you sure you want to remove {count > 1 ? 'these' : 'this'} {count > 1 ? 'keywords' : 'keyword'}?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
               <Button variant="outline" onClick={onClose}>Cancel</Button>
               <Button variant="destructive" disabled={isPending} onClick={onConfirm}>{isPending ? 'Removing…' : 'Remove'}</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

// ── Add / remove tags ──────────────────────────────────────────────────────

type TagsDialogProps = {
   mode: 'add' | 'remove';
   keywords: KeywordType[];
   existingTags: string[];
   onClose: () => void;
   onApplied: () => void;
};

const ERROR_VISIBLE_MS = 3000;

function TagsDialog({ mode, keywords, existingTags, onClose, onApplied }: TagsDialogProps) {
   const [tagInput, setTagInput] = useState('');
   const [inputError, setInputError] = useState('');
   const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const { mutate, isPending } = useUpdateKeywordTags(() => { setTagInput(''); onApplied(); });

   useEffect(() => () => { if (errorTimer.current) { clearTimeout(errorTimer.current); } }, []);

   const apply = () => {
      if (keywords.length === 0 || isPending) { return; }
      if (!tagInput.trim()) {
         if (errorTimer.current) { clearTimeout(errorTimer.current); }
         setInputError(`Please insert ${mode === 'remove' ? 'a tag to remove' : 'a tag'}!`);
         errorTimer.current = setTimeout(() => { setInputError(''); errorTimer.current = null; }, ERROR_VISIBLE_MS);
         return;
      }
      const typed = Array.from(new Set(tagInput.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0)));
      const typedLower = typed.map((tag) => tag.toLowerCase());
      const tags: Record<number, string[]> = {};
      keywords.forEach((keyword) => {
         tags[keyword.ID] = mode === 'remove'
            ? keyword.tags.filter((tag) => !typedLower.includes(tag.toLowerCase()))
            : Array.from(new Set([...keyword.tags, ...typed]));
      });
      mutate({ tags });
   };

   return (
      <Dialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>
                  {mode === 'remove' ? 'Remove tags from' : 'Add tags to'} {plural(keywords.length, 'selected keyword')}
               </DialogTitle>
               <DialogDescription>Separate tags with commas.</DialogDescription>
            </DialogHeader>
            <TagInput
               value={tagInput}
               onChange={setTagInput}
               existingTags={existingTags}
               placeholder={`${mode === 'remove' ? 'Remove tags' : 'Insert tags'}. e.g. tag1, tag2`}
               onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); apply(); } }}
            >
               <Button type="button" size="sm" className="absolute top-1/2 right-1 -translate-y-1/2" disabled={isPending} onClick={apply}>Apply</Button>
            </TagInput>
            {inputError && <p role="alert" className="text-destructive text-sm font-medium">{inputError}</p>}
         </DialogContent>
      </Dialog>
   );
}

// ── Tags of one keyword ────────────────────────────────────────────────────

function TagManagerDialog({ keyword, allTags, onClose }: { keyword: KeywordType | undefined; allTags: string[]; onClose: () => void }) {
   const [adding, setAdding] = useState(false);
   const { mutate } = useUpdateKeywordTags(() => {});

   if (!keyword) { return null; }
   const removeTag = (tag: string) => mutate({ tags: { [keyword.ID]: keyword.tags.filter((t) => t !== tag.trim()) } });

   return (
      <>
         <Dialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Tags for &ldquo;{keyword.keyword}&rdquo;</DialogTitle>
                  <DialogDescription>Remove a tag with its X, or add a new one.</DialogDescription>
               </DialogHeader>
               {keyword.tags.length > 0 ? (
                  <ul className="flex flex-wrap items-center gap-2">
                     {keyword.tags.map((tag) => (
                        <li key={tag} className="bg-muted flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                           <Tags className="text-muted-foreground size-3.5" />{tag}
                           <button type="button" className="hover:bg-destructive/10 hover:text-destructive rounded p-0.5" aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)}>
                              <X className="size-3.5" />
                           </button>
                        </li>
                     ))}
                     <li><Button size="sm" title="Add new tag" onClick={() => setAdding(true)}>+</Button></li>
                  </ul>
               ) : (
                  <p className="text-muted-foreground text-center text-sm">
                     No tags added to this keyword. <button type="button" className="text-primary" onClick={() => setAdding(true)}>+ Add tag</button>
                  </p>
               )}
            </DialogContent>
         </Dialog>
         {adding && (
            <TagsDialog mode="add" keywords={[keyword]} existingTags={allTags} onClose={() => setAdding(false)} onApplied={() => setAdding(false)} />
         )}
      </>
   );
}

// ── Change location ────────────────────────────────────────────────────────

type LocationSelection = { location: string; country: string };

function ChangeLocationDialog({ keywords, existingLocations, allowsCity, onClose, onApplied }: {
   keywords: KeywordType[]; existingLocations: string[]; allowsCity: boolean; onClose: () => void; onApplied: () => void;
}) {
   // A country-only choice has a blank location, so the selection itself decides whether Apply is enabled.
   const [selection, setSelection] = useState<LocationSelection | null>(null);
   const { mutate, isPending } = useUpdateKeywordLocation(onApplied);

   return (
      <Dialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
         <DialogContent className="sm:max-w-sm" data-testid="change_location_modal">
            <DialogHeader>
               <DialogTitle>Change location for {plural(keywords.length, 'keyword')}</DialogTitle>
               <DialogDescription>Pick an existing location or add a new one.</DialogDescription>
            </DialogHeader>
            <LocationPicker
               existingLocations={existingLocations}
               value={selection?.location ?? ''}
               onChange={(location, country) => setSelection({ location, country })}
               allowsCity={allowsCity}
               sectionLabels
            />
            <DialogFooter>
               <Button variant="outline" onClick={onClose}>Cancel</Button>
               <Button
                  disabled={!selection || isPending}
                  onClick={() => { if (selection) { mutate({ keywordIDs: keywords.map((k) => k.ID), location: selection.location, country: selection.country }); } }}
               >
                  {isPending ? 'Applying…' : 'Apply'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

// ── Host ───────────────────────────────────────────────────────────────────

type TrackerDialogsProps = {
   dialog: TrackerDialog;
   keywords: KeywordType[];
   allTags: string[];
   existingLocations: string[];
   allowsCity: boolean;
   onClose: () => void;
   /** Called after an action changed these keywords, so the table can drop them from the selection. */
   onDone: (ids: number[]) => void;
};

export function TrackerDialogs({ dialog, keywords, allTags, existingLocations, allowsCity, onClose, onDone }: TrackerDialogsProps) {
   const removeMutation = useDeleteKeywords(() => {});
   if (!dialog) { return null; }

   const byIds = (ids: number[]) => keywords.filter((keyword) => ids.includes(keyword.ID));

   switch (dialog.type) {
      case 'remove':
         return (
            <RemoveKeywordsDialog
               count={dialog.ids.length}
               isPending={removeMutation.isPending}
               onClose={onClose}
               onConfirm={() => removeMutation.mutate(dialog.ids, { onSuccess: () => { onDone(dialog.ids); onClose(); } })}
            />
         );
      case 'addTags':
      case 'removeTags':
         return (
            <TagsDialog
               mode={dialog.type === 'addTags' ? 'add' : 'remove'}
               keywords={byIds(dialog.ids)}
               existingTags={dialog.type === 'addTags' ? allTags : [...new Set(byIds(dialog.ids).flatMap((k) => k.tags).filter((t) => t && t.trim() !== ''))]}
               onClose={onClose}
               onApplied={() => { onDone(dialog.ids); onClose(); }}
            />
         );
      case 'tagManager':
         return <TagManagerDialog keyword={keywords.find((k) => k.ID === dialog.id)} allTags={allTags} onClose={onClose} />;
      case 'location':
         return (
            <ChangeLocationDialog
               keywords={byIds(dialog.ids)}
               existingLocations={existingLocations}
               allowsCity={allowsCity}
               onClose={onClose}
               onApplied={() => { onDone(dialog.ids); onClose(); }}
            />
         );
      default:
         return null;
   }
}
