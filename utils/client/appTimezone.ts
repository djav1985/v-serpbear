import { resolveTimezone } from '../timezone';

/** The app's time zone as the server reports it (GET /api/settings, GET /api/auth-check). Browsers cannot read CRON_TIMEZONE. */
let appTimezone: string = resolveTimezone(undefined);

export const setAppTimezone = (timezone?: string | null): void => {
   appTimezone = resolveTimezone(timezone);
};

export const getAppTimezone = (): string => appTimezone;
