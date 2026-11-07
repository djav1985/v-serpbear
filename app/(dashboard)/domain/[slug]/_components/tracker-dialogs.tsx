'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
   | { type: 'tags'; ids: number[] }
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

// ── Add / edit tags ────────────────────────────────────────────────────────

const ERROR_VISIBLE_MS = 3000;

/**
 * One dialog for tags, for a single keyword or a whole selection. It lists the tags on the keywords, removes a tag
 * from every keyword that has it, and adds new tags to all of them. Matching ignores letter case.
 */
function TagsDialog({ keywords, allTags, onClose }: { keywords: KeywordType[]; allTags: string[]; onClose: () => void }) {
   const [tagInput, setTagInput] = useState('');
   const [inputError, setInputError] = useState('');
   const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const { mutate, isPending } = useUpdateKeywordTags(() => setTagInput(''));

   useEffect(() => () => { if (errorTimer.current) { clearTimeout(errorTimer.current); } }, []);

   const total = keywords.length;
   // How many of the keywords carry each tag (one entry per tag, ignoring case).
   const tagCounts = useMemo(() => {
      const counts = new Map<string, { label: string; count: number }>();
      keywords.forEach((keyword) => {
         new Set(keyword.tags.map((tag) => tag.toLowerCase())).forEach((lower) => {
            const label = keyword.tags.find((tag) => tag.toLowerCase() === lower) ?? lower;
            counts.set(lower, { label, count: (counts.get(lower)?.count ?? 0) + 1 });
         });
      });
      return [...counts.entries()].map(([lower, value]) => ({ lower, ...value }));
   }, [keywords]);

   if (total === 0) { return null; }

   const removeTag = (lower: string) => {
      const tags: Record<number, string[]> = {};
      keywords.forEach((keyword) => {
         if (keyword.tags.some((tag) => tag.toLowerCase() === lower)) { tags[keyword.ID] = keyword.tags.filter((tag) => tag.toLowerCase() !== lower); }
      });
      mutate({ tags });
   };

   const addTags = () => {
      if (isPending) { return; }
      if (!tagInput.trim()) {
         if (errorTimer.current) { clearTimeout(errorTimer.current); }
         setInputError('Please insert a tag!');
         errorTimer.current = setTimeout(() => { setInputError(''); errorTimer.current = null; }, ERROR_VISIBLE_MS);
         return;
      }
      const typed = Array.from(new Set(tagInput.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0)));
      const tags: Record<number, string[]> = {};
      keywords.forEach((keyword) => { tags[keyword.ID] = Array.from(new Set([...keyword.tags, ...typed])); });
      mutate({ tags });
   };

   return (
      <Dialog open onOpenChange={(open) => { if (!open) { onClose(); } }}>
         <DialogContent data-testid="tags_dialog">
            <DialogHeader>
               <DialogTitle>{total === 1 ? <>Tags for &ldquo;{keywords[0].keyword}&rdquo;</> : `Tags for ${plural(total, 'selected keyword')}`}</DialogTitle>
               <DialogDescription>
                  {total === 1 ? 'Remove a tag with its X, or add new ones.' : 'Changes apply to every selected keyword. Remove a tag with its X, or add new ones.'}
               </DialogDescription>
            </DialogHeader>

            {tagCounts.length > 0 ? (
               <ul className="flex flex-wrap items-center gap-2" aria-label="Current tags">
                  {tagCounts.map(({ lower, label, count }) => (
                     <li key={lower} className="bg-muted flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                        <Tags className="text-muted-foreground size-3.5" />{label}
                        {total > 1 && count < total && <span className="text-muted-foreground text-xs" title={`On ${count} of ${total} keywords`}>{count}/{total}</span>}
                        <button type="button" className="hover:bg-destructive/10 hover:text-destructive rounded p-0.5" aria-label={`Remove tag ${label}`} disabled={isPending} onClick={() => removeTag(lower)}>
                           <X className="size-3.5" />
                        </button>
                     </li>
                  ))}
               </ul>
            ) : (
               <p className="text-muted-foreground text-sm">{total === 1 ? 'No tags on this keyword yet.' : 'None of the selected keywords has a tag yet.'}</p>
            )}

            <TagInput
               value={tagInput}
               onChange={setTagInput}
               existingTags={allTags}
               placeholder="Insert tags. e.g. tag1, tag2"
               onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTags(); } }}
            >
               <Button type="button" size="sm" className="absolute top-1/2 right-1 -translate-y-1/2" disabled={isPending} onClick={addTags}>Add</Button>
            </TagInput>
            {inputError && <p role="alert" className="text-destructive text-sm font-medium">{inputError}</p>}
         </DialogContent>
      </Dialog>
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
      case 'tags':
         return <TagsDialog keywords={byIds(dialog.ids)} allTags={allTags} onClose={onClose} />;
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
