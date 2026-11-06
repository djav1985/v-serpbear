import normalizeOrigin from '../normalizeOrigin';

export const getClientOrigin = (): string => {
   if (typeof window !== 'undefined' && window.location?.origin) {
      return normalizeOrigin(window.location.origin);
   }

   if (typeof process !== 'undefined') {
      const envOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
      if (envOrigin) {
         return normalizeOrigin(envOrigin);
      }
   }

   return 'http://localhost:3000';
};

export default getClientOrigin;
