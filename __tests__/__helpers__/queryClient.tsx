import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';

export const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

export const createQueryClientWrapper = (client = createTestQueryClient()) => ({
  client,
  wrapper: ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  ),
});

type QueryClientRenderOptions = Omit<RenderOptions, 'wrapper'> & { client?: QueryClient };

export const renderWithQueryClient = (ui: ReactElement, options: QueryClientRenderOptions = {}) => {
  const { client = createTestQueryClient(), ...renderOptions } = options;
  const { wrapper } = createQueryClientWrapper(client);
  return { ...rtlRender(ui, { ...renderOptions, wrapper }), client };
};
