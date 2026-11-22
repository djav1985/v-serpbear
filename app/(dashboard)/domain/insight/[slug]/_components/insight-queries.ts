import { callApi } from 'utils/client/apiClient';

export const insightQueryOptions = (domain: string) => ({
   queryKey: ['sc-insight', domain] as const,
   queryFn: async () => (await callApi('insight.get', { query: { domain } })).insight,
   retry: false as const,
});
