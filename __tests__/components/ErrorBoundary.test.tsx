import { fireEvent, render, screen } from '@testing-library/react';
import ErrorBoundary from '../../components/common/ErrorBoundary';

let shouldThrow = true;
const ExplodingChild = () => {
  if (shouldThrow) {
    throw new Error('Boundary test failure');
  }

  return <span>Recovered content</span>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
  });

  it('renders fallback with serialized error message', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ExplodingChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Boundary test failure')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('allows resetting the error state', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ExplodingChild />
      </ErrorBoundary>
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Recovered content')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
