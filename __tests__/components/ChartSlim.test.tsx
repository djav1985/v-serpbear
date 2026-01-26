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

   it('renders with default fixed size when fillContainer is not set', () => {
      const { container } = render(
         <ChartSlim labels={['1', '2']} series={[10, 8]} />
      );

      expect(container.firstChild).toHaveClass('w-[80px]', 'h-[30px]');
      expect(lineMock).toHaveBeenCalledWith(expect.objectContaining({ className: '' }));
   });

   it('renders a full-size wrapper and passes full-size classes to the Line chart when fillContainer is true', () => {
      const { container } = render(
         <ChartSlim labels={['1', '2']} series={[10, 8]} fillContainer={true} />
      );

      expect(container.firstChild).toHaveClass('w-full', 'h-full');
      expect(lineMock).toHaveBeenCalledWith(expect.objectContaining({ className: 'w-full h-full' }));
   });
});
