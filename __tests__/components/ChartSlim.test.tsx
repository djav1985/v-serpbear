import { render } from '@testing-library/react';
import ChartSlim from '../../components/common/ChartSlim';

const lineMock = jest.fn(() => null);

jest.mock('react-chartjs-2', () => ({
   Line: (props: { className?: string }) => {
      lineMock(props);
      return null;
   },
}));

describe('ChartSlim Component', () => {
   beforeEach(() => {
      lineMock.mockClear();
   });

   it('renders a full-size wrapper and passes full-size classes to the Line chart', () => {
      const { container } = render(
         <ChartSlim labels={['1', '2']} series={[10, 8]} />
      );

      expect(container.firstChild).toHaveClass('w-full', 'h-full');
      expect(lineMock).toHaveBeenCalledWith(expect.objectContaining({ className: 'w-full h-full' }));
   });
});
