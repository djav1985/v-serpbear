import toast from 'react-hot-toast';
import { ApiError } from '../utils/client/apiClient';

/**
 * Shows a readable error toast for a failed data query.
 * A fixed toast id per query means repeated failures replace the existing toast instead of stacking.
 * 401 responses are skipped: they mean the session ended, which is handled by the login redirect.
 */
export const showQueryErrorToast = (error: unknown, fallbackMessage: string, toastId: string) => {
   if (error instanceof ApiError && error.statusCode === 401) { return; }
   const message = error instanceof ApiError && error.message ? error.message : fallbackMessage;
   toast(message, { id: toastId, icon: '⚠️' });
};
