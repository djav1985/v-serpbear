const normalizeOrigin = (value: string): string => {
   let i = value.length;
   while (i > 0 && value[i - 1] === '/') i--;
   return i === value.length ? value : value.slice(0, i);
};

export default normalizeOrigin;
