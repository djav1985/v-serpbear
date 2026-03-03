import { fromDbBool } from './dbBooleans';

const normalizeDomainBooleans = (domain: DomainType): DomainType & { scrapeEnabled: boolean } => ({
   ...domain,
   scrapeEnabled: typeof domain.scrapeEnabled === 'boolean' ? domain.scrapeEnabled : fromDbBool(domain.scrapeEnabled),
});

export default normalizeDomainBooleans;
