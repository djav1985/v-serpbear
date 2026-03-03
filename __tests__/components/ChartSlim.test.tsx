import { render } from '@testing-library/react';
import ChartSlim from '../../components/common/ChartSlim';

const lineMock = jest.fn(() => null);

type LineOptions = {
   layout?: {
      padding?: number;
      autoPadding?: boolean;
   };
   scales?: {
      y?: Record<string, unknown>;
   };
};

type LineProps = {
   className?: string;
   options?: LineOptions;
   data?: { datasets?: Array<Record<string, unknown>> };
};

jest.mock('react-chartjs-2', () => ({
   Line: (props: LineProps) => {
      lineMock(props);
      return null;
   },
}));

jest.mock('../../utils/client/chartBounds', () => ({
   calculateChartBounds: jest.fn(() => ({ min: 3, max: 12 })),
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
      expect(lineMock).toHaveBeenCalledWith(expect.objectContaining({
         options: expect.objectContaining({
            layout: expect.objectContaining({
               autoPadding: false,
               padding: 0,
            }),
         }),
      }));
   });

   it('renders a full-size wrapper and passes full-size classes to the Line chart when fillContainer is true', () => {
      const { container } = render(
         <ChartSlim labels={['1', '2']} series={[10, 8]} fillContainer={true} />
      );

      expect(container.firstChild).toHaveClass('w-full', 'h-full');
      expect(lineMock).toHaveBeenCalledWith(expect.objectContaining({ className: 'w-full h-full' }));
      expect(lineMock).toHaveBeenCalledWith(expect.objectContaining({
         options: expect.objectContaining({
            layout: expect.objectContaining({
               autoPadding: false,
               padding: 0,
            }),
         }),
      }));
   });

   it('uses dynamic y-axis bounds from calculateChartBounds so differences are clearly visible', () => {
      render(<ChartSlim labels={['2024-1-1', '2024-1-2']} series={[5, 8]} />);

      const callArgs = lineMock.mock.calls[0][0] as LineProps;
      const yAxis = (callArgs.options as { scales?: { y?: Record<string, unknown> } })?.scales?.y;
      expect(yAxis?.min).toBe(3);
      expect(yAxis?.max).toBe(12);
   });

   it('maps sentinel 111 values to null in the dataset when mapSentinel is true', () => {
      render(<ChartSlim labels={['2024-1-1', '2024-1-2', '2024-1-3']} series={[111, 5, 4]} mapSentinel={true} />);

      const callArgs = lineMock.mock.calls[0][0] as LineProps;
      const dataset = callArgs.data?.datasets?.[0];
      expect(dataset).toBeDefined();
      expect(dataset?.data).toEqual([null, 5, 4]);
   });

   it('does not map 111 to null when mapSentinel is false (default), preserving legitimate values', () => {
      render(<ChartSlim labels={['2024-1-1', '2024-1-2', '2024-1-3']} series={[111, 500, 400]} reverse={false} noMaxLimit={true} />);

      const callArgs = lineMock.mock.calls[0][0] as LineProps;
      const dataset = callArgs.data?.datasets?.[0];
      expect(dataset).toBeDefined();
      expect(dataset?.data).toEqual([111, 500, 400]);
   });

   it('passes a dataset with fill:start, showLine:true and spanGaps:false', () => {
      render(<ChartSlim labels={['2024-1-1', '2024-1-2']} series={[5, 4]} />);

      const callArgs = lineMock.mock.calls[0][0] as LineProps;
      const dataset = callArgs.data?.datasets?.[0];
      expect(dataset).toBeDefined();
      expect(dataset?.fill).toBe('start');
      expect(dataset?.showLine).toBe(true);
      expect(dataset?.spanGaps).toBe(false);
   });
});
