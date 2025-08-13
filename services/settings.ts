import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import apiFetch from './apiClient';

export async function fetchSettings() {
   return apiFetch(`${window.location.origin}/api/settings`);
}

export function useFetchSettings() {
   return useQuery('settings', () => fetchSettings());
}

export const useUpdateSettings = (onSuccess:Function|undefined) => {
   const queryClient = useQueryClient();

   return useMutation(async (settings: SettingsType) => {
      // console.log('settings: ', JSON.stringify(settings));

      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'PUT', headers, body: JSON.stringify({ settings }) };
      return apiFetch(`${window.location.origin}/api/settings`, fetchOpts);
   }, {
      onSuccess: async () => {
         if (onSuccess) {
            onSuccess();
         }
         toast('Settings Updated!', { icon: '✔️' });
         queryClient.invalidateQueries(['settings']);
      },
      onError: () => {
         console.log('Error Updating App Settings!!!');
         toast('Error Updating App Settings.', { icon: '⚠️' });
      },
   });
};

export function useClearFailedQueue(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async () => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'PUT', headers };
      return apiFetch(`${window.location.origin}/api/clearfailed`, fetchOpts);
   }, {
      onSuccess: async () => {
         onSuccess();
         toast('Failed Queue Cleared', { icon: '✔️' });
         queryClient.invalidateQueries(['settings']);
      },
      onError: () => {
         console.log('Error Clearing Failed Queue!!!');
         toast('Error Clearing Failed Queue.', { icon: '⚠️' });
      },
   });
}

export async function fetchMigrationStatus() {
   return apiFetch(`${window.location.origin}/api/dbmigrate`);
}

export function useCheckMigrationStatus() {
   return useQuery('dbmigrate', () => fetchMigrationStatus());
}

export const useMigrateDatabase = (onSuccess:Function|undefined) => {
   const queryClient = useQueryClient();

   return useMutation(async () => {
      // console.log('settings: ', JSON.stringify(settings));
      return apiFetch(`${window.location.origin}/api/dbmigrate`, { method: 'POST' });
   }, {
      onSuccess: async (res) => {
         if (onSuccess) {
            onSuccess(res);
         }
         toast('Database Updated!', { icon: '✔️' });
         queryClient.invalidateQueries(['settings']);
      },
      onError: () => {
         console.log('Error Updating Database!!!');
         toast('Error Updating Database.', { icon: '⚠️' });
      },
   });
};
