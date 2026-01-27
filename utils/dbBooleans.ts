export const toDbBool = (value: boolean | number | null | undefined): 1 | 0 => {
   return value ? 1 : 0;
};

export const fromDbBool = (value: number | null | undefined): boolean => value === 1;
