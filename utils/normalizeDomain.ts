import { fromDbBool } from './dbBooleans';

const normalizeDbBool = (value: boolean | number | null | undefined): boolean => (
   typeof value === 'boolean' ? value : fromDbBool(value)
);

const normalizeDomainBooleans = (domain: DomainType): DomainType & { scrapeEnabled: boolean; notification: boolean } => ({
   ...domain,
   scrapeEnabled: normalizeDbBool(domain.scrapeEnabled),
   notification: normalizeDbBool(domain.notification),
});

export default normalizeDomainBooleans;
