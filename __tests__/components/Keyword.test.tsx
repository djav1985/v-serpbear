import { fireEvent, render, screen } from '@testing-library/react';
import Keyword from '../../components/keywords/Keyword';
import { dummyKeywords } from '../../__mocks__/data';

const keywordProps = {
   keywordData: dummyKeywords[0],
   selected: false,
   index: 0,
   showSCData: false,
   scDataType: '',
   style: {},
   maxTitleColumnWidth: 200,
   refreshkeyword: jest.fn(),
   favoriteKeyword: jest.fn(),
   removeKeyword: jest.fn(),
   selectKeyword: jest.fn(),
   manageTags: jest.fn(),
   showKeywordDetails: jest.fn(),
};
jest.mock('react-chartjs-2', () => ({
   Line: () => null,
 }));
describe('Keyword Component', () => {
   it('renders without crashing', async () => {
       render(<Keyword {...keywordProps} />);
       expect(await screen.findByText('compress image')).toBeInTheDocument();
   });
   it('Should Render Position Correctly', async () => {
      render(<Keyword {...keywordProps} />);
      // Find the position element by looking for the specific position area
      const positionElements = screen.getAllByText('19');
      // The first instance should be the main position
      expect(positionElements.length).toBeGreaterThan(0);
      expect(positionElements[0]).toBeInTheDocument();
   });
   it('Should Display Position Change arrow', async () => {
      render(<Keyword {...keywordProps} />);
      // Look for the position change indicator by its text content
      expect(screen.getByText('▲ 1')).toBeInTheDocument();
   });
   it('Should Display the SERP Page URL', async () => {
      render(<Keyword {...keywordProps} />);
      // Look for the URL link by its href attribute
      expect(screen.getByRole('link', { name: '/' })).toBeInTheDocument();
   });
   it('renders a full-width history chart container', () => {
      render(<Keyword {...keywordProps} />);
      const historyChart = screen.getByTestId('keyword-history-chart');
      expect(historyChart).toHaveClass('lg:w-full', 'lg:h-[30px]', 'lg:min-w-[80px]');
   });
   it('shows the map pack flag when the keyword is in the map pack', async () => {
      render(<Keyword {...keywordProps} />);
      expect(screen.getByLabelText('Map pack top three')).toBeInTheDocument();
   });
   it('Should Display the Keyword Options on dots Click', async () => {
      render(<Keyword {...keywordProps} />);
      // Get all buttons and find the options button by looking for the SVG with specific viewBox
      const buttons = screen.getAllByRole('button');
      // The options button is the second button (the one with the dots icon)
      const optionsButton = buttons[1]; // Based on the DOM structure, this should be the dots button
      fireEvent.click(optionsButton);
      // Look for the options menu by finding one of its menu items
      expect(screen.getByText('Refresh Keyword')).toBeVisible();
   });
   // it('Should favorite Keywords', async () => {
   //    render(<Keyword {...keywordProps} />);
   //    const button = document.querySelector('.keyword .keyword_dots');
   //    if (button) fireEvent(button, new MouseEvent('click', { bubbles: true }));
   //    const option = document.querySelector('.keyword .keyword_options li:nth-child(1) a');
   //    if (option) fireEvent(option, new MouseEvent('click', { bubbles: true }));
   //    const { favoriteKeyword } = keywordFunctions;
   //    expect(favoriteKeyword).toHaveBeenCalled();
   // });
});
