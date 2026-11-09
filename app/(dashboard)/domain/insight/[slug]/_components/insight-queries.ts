import { apiGet } from 'utils/client/apiClient';

export const insightQueryOptions = (domain: string) => ({
   queryKey: ['sc-insight', domain] as const,
   queryFn: async () => (await apiGet<{ data: InsightDataType }>(`/api/google/insight?domain=${encodeURIComponent(domain)}`)).data,
   retry: false as const,
});
