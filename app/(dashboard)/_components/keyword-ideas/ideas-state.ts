import type { SortingState } from '@tanstack/react-table';
import { matchesIdeaTags } from 'utils/client/sortFilter';

export type IdeaRow = IdeaKeyword;

export type IdeaFilters = { search: string; groups: string[] };
export const DEFAULT_IDEA_FILTERS: IdeaFilters = { search: '', groups: [] };

export type IdeaSortChoice = { value: string; label: string; sorting: SortingState };

/** The sort choices the legacy table offered. It listed a default (`imp_desc`) that was not among them; the default is now a listed choice. */
export const IDEA_SORT_CHOICES: IdeaSortChoice[] = [
   { value: 'vol_desc', label: 'Highest Search Volume', sorting: [{ id: 'volume', desc: true }] },
   { value: 'vol_asc', label: 'Lowest Search Volume', sorting: [{ id: 'volume', desc: false }] },
   { value: 'alpha_asc', label: 'Alphabetically (A-Z)', sorting: [{ id: 'keyword', desc: false }] },
   { value: 'alpha_desc', label: 'Alphabetically (Z-A)', sorting: [{ id: 'keyword', desc: true }] },
   { value: 'competition_desc', label: 'High Competition', sorting: [{ id: 'competition', desc: true }] },
   { value: 'competition_asc', label: 'Low Competition', sorting: [{ id: 'competition', desc: false }] },
];
export const DEFAULT_IDEA_SORT = 'vol_desc';

export const ideaSortingFor = (value: string): SortingState => (
   (IDEA_SORT_CHOICES.find((c) => c.value === value) ?? IDEA_SORT_CHOICES[0]).sorting
);

export const ideaChoiceFor = (sorting: SortingState): string => (
   IDEA_SORT_CHOICES.find((c) => c.sorting.length === sorting.length && c.sorting.every((s, i) => s.id === sorting[i].id && s.desc === sorting[i].desc))?.value ?? ''
);

const MIN_GROUP_SIZE = 3;

/**
 * Phrase groups: the first two words of a keyword, when at least three ideas share them in either word order.
 * The count shown next to a group uses the same matching as the filter, so a group's number is what it filters to.
 */
export const buildIdeaGroups = (keywords: IdeaKeyword[]): string[] => {
   const candidates = new Set<string>();
   keywords.forEach(({ keyword }) => {
      const firstTwo = keyword.split(' ').slice(0, 2).join(' ');
      const reversed = firstTwo.split(' ').reverse().join(' ');
      if (firstTwo && !candidates.has(reversed)) { candidates.add(firstTwo); }
   });
   return [...candidates]
      .map((group) => ({ group, count: keywords.filter((k) => matchesIdeaTags(k.keyword, [group])).length }))
      .filter(({ count }) => count >= MIN_GROUP_SIZE)
      .sort((a, b) => b.count - a.count)
      .map(({ group, count }) => `${group} (${count})`);
};
