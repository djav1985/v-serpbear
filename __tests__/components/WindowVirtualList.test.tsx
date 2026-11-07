import React from 'react';
import { render, screen } from '@testing-library/react';
import WindowVirtualList from '../../components/common/WindowVirtualList';

jest.mock('@tanstack/react-virtual', () => ({
   useWindowVirtualizer: ({ count, getItemKey }: { count: number, getItemKey: (index: number) => string | number }) => ({
      getTotalSize: () => count * 40,
      getVirtualItems: () => Array.from({ length: Math.min(count, 2) }, (_, index) => ({
         index,
         key: getItemKey(index),
         start: index * 40,
      })),
      measureElement: jest.fn(),
   }),
}));

describe('WindowVirtualList', () => {
   it('renders only virtual rows and keeps a full-height document-flow spacer', () => {
      const items = Array.from({ length: 100 }, (_, id) => ({ id }));
      const { container } = render(
         <WindowVirtualList
            items={items}
            estimateSize={40}
            getItemKey={(item) => item.id}
            renderItem={(item) => <span>{item.id}</span>}
         />,
      );

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.queryByText('2')).not.toBeInTheDocument();
      expect(container.firstChild).toHaveStyle({ height: '4000px', position: 'relative' });
      expect(container.querySelector('[data-index="1"]')).toBeInTheDocument();
   });
});
