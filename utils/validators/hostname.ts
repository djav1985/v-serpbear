const HOSTNAME_CHARS = /^[a-zA-Z0-9-.]{1,253}\.?$/;
const HOSTNAME_LABEL = /^([a-zA-Z0-9-]+)$/;

const normalizeInput = (value: string): string => {
   const trimmed = value.trim();
   if (!trimmed) {
      return '';
   }

   const withoutTrailingDot = trimmed.endsWith('.')
      ? trimmed.slice(0, trimmed.length - 1)
      : trimmed;

   return withoutTrailingDot.toLowerCase();
};

export const normalizeHostFromString = (value: string): string | null => {
   if (typeof value !== 'string') {
      return null;
   }

   const trimmed = value.trim();
   if (!trimmed) {
      return null;
   }

   try {
      const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
      const normalizedHost = normalizeInput(url.hostname);
      if (!normalizedHost) {
         return null;
      }
      return normalizedHost.replace(/^www\./i, '');
   } catch {
      return null;
   }
};

export const isValidHostname = (value: unknown): value is string => {
   if (typeof value !== 'string') {
      return false;
   }

   if (!value.includes('.')) {
      return false;
   }

   const normalized = normalizeInput(value);
   if (!normalized) {
      return false;
   }

   if (!HOSTNAME_CHARS.test(normalized)) {
      return false;
   }

   if (normalized.length > 253) {
      return false;
   }

   const labels = normalized.split('.');
   return labels.every((label) => (
      HOSTNAME_LABEL.test(label)
      && label.length < 64
      && !label.startsWith('-')
      && !label.endsWith('-')
   ));
};

export const validateHostname = (value: unknown): { isValid: boolean; hostname: string } => {
   if (!isValidHostname(value)) {
      return { isValid: false, hostname: '' };
   }

   return { isValid: true, hostname: normalizeInput(value as string) };
};

export const sanitizeHostname = (value: unknown): string => {
   const { hostname } = validateHostname(value);
   return hostname;
};

export default isValidHostname;
