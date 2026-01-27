import { fromDbBool } from './dbBooleans';

const normalizeDomainBooleans = (domain: DomainType): DomainType & { scrapeEnabled: boolean; notification: boolean } => ({
   ...domain,
   scrapeEnabled: typeof domain.scrapeEnabled === 'boolean' ? domain.scrapeEnabled : fromDbBool(domain.scrapeEnabled),
   notification: typeof domain.notification === 'boolean' ? domain.notification : fromDbBool(domain.notification),
});

export default normalizeDomainBooleans;
