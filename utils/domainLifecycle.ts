import Domain from '../database/models/domain';
import { withKeyedMutex } from './keyedMutex';

export const withDomainLifecycleLock = <T>(domain: string, operation: () => Promise<T>): Promise<T> =>
   withKeyedMutex(`domain-lifecycle:${domain.trim().toLowerCase()}`, operation);

/** A background result belongs only to the exact domain row it started for. */
export const isCurrentDomainRecord = async (domain: string, domainID: number): Promise<boolean> => {
   const current = await Domain.findOne({ where: { domain: domain.trim().toLowerCase() }, attributes: ['ID'], raw: true }) as unknown as { ID?: number } | null;
   return current?.ID === domainID;
};
