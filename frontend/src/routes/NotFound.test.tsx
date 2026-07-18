import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NotFound from './NotFound.tsx';

describe('NotFound route', () => {
  it('explains the missing route and links back to the app entrance', () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: /doesn't exist yet/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Concourse' })).toHaveAttribute('href', '/');
  });
});
