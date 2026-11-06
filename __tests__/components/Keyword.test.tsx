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
   it('Should unfavorite a sticky keyword from the star button', () => {
      const favoriteKeyword = jest.fn();
      render(<Keyword {...keywordProps} favoriteKeyword={favoriteKeyword} keywordData={{ ...dummyKeywords[0], sticky: true }} />);
      fireEvent.click(screen.getByRole('button', { name: 'Unfavorite Keyword' }));
      expect(favoriteKeyword).toHaveBeenCalledWith({ keywordID: dummyKeywords[0].ID, sticky: false });
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
