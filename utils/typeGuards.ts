export type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord => (
   value !== null && typeof value === 'object' && !Array.isArray(value)
);

export const asRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {});

export const asRecordArray = (value: unknown): UnknownRecord[] => (
   Array.isArray(value) ? value.filter(isRecord) : []
);

export const getPathValue = (value: unknown, ...path: string[]): unknown => {
   let current = value;
   for (const key of path) {
      if (Array.isArray(current) && /^\d+$/.test(key)) {
         current = current[Number(key)];
      } else if (isRecord(current)) {
         current = current[key];
      } else {
         return undefined;
      }
   }
   return current;
};
