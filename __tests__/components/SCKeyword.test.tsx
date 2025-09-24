import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SCKeyword from '../../app/components/keywords/SCKeyword';

// Mock the Icon component
jest.mock('../../app/components/common/Icon', () => 
   function Icon({ type, title }: { type: string; title?: string }) {
      return <span data-testid={`icon-${type}`} title={title}>✓</span>;
   }
);

// Mock countries data
jest.mock('../../app/utils/countries', () => ({
   US: ['United States', 'us'],
}));

// Mock KeywordPosition component
jest.mock('../../app/components/keywords/KeywordPosition', () => 
   function KeywordPosition({ position }: { position: number }) {
      return <span data-testid="position">{position}</span>;
   }
);

describe('SCKeyword Component', () => {
   const mockSelectKeyword = jest.fn();

   const defaultKeywordData: SearchAnalyticsItem = {
      uid: 'test-uid',
      keyword: 'test keyword',
      position: 5,
      country: 'US',
      impressions: 1000,
      ctr: 0.05,
      clicks: 50,
      device: 'desktop',
   };

   const defaultProps = {
      keywordData: defaultKeywordData,
      selected: false,
      selectKeyword: mockSelectKeyword,
      isTracked: false,
      style: {},
   };

   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('renders a selectable keyword when not tracked', () => {
      render(<SCKeyword {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute('disabled');
      expect(button).toHaveAttribute('aria-disabled', 'false');
      expect(button).toHaveAttribute('aria-label', 'Select keyword');
   });

   it('renders a disabled keyword when tracked', () => {
      render(<SCKeyword {...defaultProps} isTracked={true} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('disabled');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('aria-label', 'Keyword already tracked');
   });

   it('calls selectKeyword with correct parameters when clicked and not tracked', () => {
      render(<SCKeyword {...defaultProps} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockSelectKeyword).toHaveBeenCalledWith('test-uid', false);
   });

   it('does not call selectKeyword when clicked and tracked', () => {
      render(<SCKeyword {...defaultProps} isTracked={true} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      // Because the button is disabled, the click event should not trigger selectKeyword
      expect(mockSelectKeyword).not.toHaveBeenCalled();
   });

   it('applies correct styling for tracked keywords', () => {
      render(<SCKeyword {...defaultProps} isTracked={true} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gray-400', 'border-gray-400', 'cursor-not-allowed', 'opacity-80');
   });

   it('applies correct styling for selected keywords', () => {
      render(<SCKeyword {...defaultProps} selected={true} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-blue-700', 'border-blue-700', 'text-white');
   });

   it('shows "Already in Tracker" title when tracked', () => {
      render(<SCKeyword {...defaultProps} isTracked={true} />);

      const icon = screen.getByTestId('icon-check');
      expect(icon).toHaveAttribute('title', 'Already in Tracker');
   });

   it('does not show title when not tracked', () => {
      render(<SCKeyword {...defaultProps} />);

      const icon = screen.getByTestId('icon-check');
      expect(icon).toHaveAttribute('title', '');
   });

   it('updates aria-label when selected', () => {
      render(<SCKeyword {...defaultProps} selected={true} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Deselect keyword');
   });
});