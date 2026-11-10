import { renderHook } from '@testing-library/react';
import { ColumnFiltersState, useTable } from '@tanstack/react-table';
import { dataTableFeatures } from 'app/(dashboard)/_components/data-table/features';
import { createIdeaColumns } from 'app/(dashboard)/_components/keyword-ideas/ideas-columns';
import { DEFAULT_IDEA_SORT, IDEA_SORT_CHOICES, IdeaRow, buildIdeaGroups, ideaChoiceFor, ideaSortingFor } from 'app/(dashboard)/_components/keyword-ideas/ideas-state';

// The Ideas table is used by the Research page and by each domain's Ideas page. These tests drive its real columns.

const noop = () => undefined;
const idea = (uid: string, keywordText: string, avgMonthlySearches: number, competitionIndex = 0): IdeaRow => ({
   uid, keyword: keywordText, country: 'US', avgMonthlySearches, competitionIndex, competition: 'LOW', monthlySearchVolumes: {},
} as unknown as IdeaRow);

const idsFor = (data: IdeaRow[], sort: string, columnFilters: ColumnFiltersState = []): string[] => {
   const { result } = renderHook(() => useTable({
      features: dataTableFeatures,
      data,
      columns: createIdeaColumns({ favoriteIds: new Set<string>(), onOpenDetails: noop, onToggleFavorite: noop }),
      getRowId: (row) => row.uid,
      state: { sorting: ideaSortingFor(sort), columnFilters },
   }));
   return result.current.getRowModel().rows.map((row) => row.id);
};

describe('Ideas table', () => {
   const data = [
      idea('a', 'tattoo removal cost', 500, 80),
      idea('b', 'Laser tattoo removal', 5000, 20),
      idea('c', 'tattoo removal near me', 50, 55),
   ];

   it('starts on highest search volume and maps each sort choice to table sorting and back', () => {
      expect(DEFAULT_IDEA_SORT).toBe('vol_desc');
      IDEA_SORT_CHOICES.forEach((choice) => expect(ideaChoiceFor(ideaSortingFor(choice.value))).toBe(choice.value));
      expect(ideaChoiceFor([{ id: 'trend', desc: false }])).toBe('');
   });

   it('sorts by volume, competition and keyword (ignoring case)', () => {
      expect(idsFor(data, 'vol_desc')).toEqual(['b', 'a', 'c']);
      expect(idsFor(data, 'vol_asc')).toEqual(['c', 'a', 'b']);
      expect(idsFor(data, 'competition_desc')).toEqual(['a', 'c', 'b']);
      expect(idsFor(data, 'competition_asc')).toEqual(['b', 'c', 'a']);
      expect(idsFor(data, 'alpha_asc')).toEqual(['b', 'a', 'c']);
      expect(idsFor(data, 'alpha_desc')).toEqual(['c', 'a', 'b']);
   });

   it('filters by search text and by phrase group, in either word order', () => {
      expect(idsFor(data, 'vol_desc', [{ id: 'keyword', value: 'NEAR' }])).toEqual(['c']);
      expect(idsFor(data, 'vol_desc', [{ id: 'groups', value: ['removal tattoo'] }])).toEqual(['b', 'a', 'c']);
      expect(idsFor(data, 'vol_desc', [{ id: 'groups', value: ['laser tattoo (1)'] }])).toEqual(['b']);
   });

   it('offers phrase groups of three or more ideas, and each count equals what the group filters to', () => {
      const many = [
         idea('1', 'tattoo removal cost', 1), idea('2', 'tattoo removal near me', 1), idea('3', 'removal tattoo prices', 1),
         idea('4', 'laser hair', 1), idea('5', 'laser pricing', 1),
      ];

      const groups = buildIdeaGroups(many);

      expect(groups).toEqual(['tattoo removal (3)']);
      expect(idsFor(many, 'vol_desc', [{ id: 'groups', value: groups }])).toHaveLength(3);
   });

   it('keeps every idea selectable until a location is chosen in the add dialog', () => {
      const row = idea('already-tracked', 'plumber', 100);
      const { result } = renderHook(() => useTable({
         features: dataTableFeatures,
         data: [row],
         columns: createIdeaColumns({ favoriteIds: new Set<string>(), onOpenDetails: noop, onToggleFavorite: noop }),
         getRowId: (item) => item.uid,
      }));

      expect(result.current.getRowModel().rows[0].getCanSelect()).toBe(true);
   });
});
