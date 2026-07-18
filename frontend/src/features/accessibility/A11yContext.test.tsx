import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { A11yProvider } from './A11yContext.tsx';
import { A11yTogglePanel } from './A11yTogglePanel.tsx';
import { useA11y } from './useA11y.ts';

function Probe() {
  const { prefs, updatePref } = useA11y();
  return (
    <div>
      <output aria-label="large-text">{String(prefs.large_text)}</output>
      <output aria-label="step-free">{String(prefs.step_free)}</output>
      <button type="button" onClick={() => updatePref('large_text', true)}>Large text on</button>
    </div>
  );
}

describe('A11yProvider', () => {
  it('hydrates stored preferences, persists updates, and mirrors DOM attributes', async () => {
    localStorage.setItem('concourse.a11y_prefs', JSON.stringify({ step_free: true }));
    const user = userEvent.setup();

    render(<A11yProvider><Probe /></A11yProvider>);

    expect(screen.getByLabelText('step-free')).toHaveTextContent('true');
    expect(screen.getByLabelText('large-text')).toHaveTextContent('false');
    expect(document.documentElement.dataset.concourseLargeText).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Large text on' }));

    expect(screen.getByLabelText('large-text')).toHaveTextContent('true');
    expect(document.documentElement.dataset.concourseLargeText).toBe('true');
    expect(JSON.parse(localStorage.getItem('concourse.a11y_prefs') ?? '{}')).toMatchObject({
      step_free: true,
      large_text: true,
    });
  });

  it('recovers from corrupt storage and lets the toggle panel update provider state', async () => {
    localStorage.setItem('concourse.a11y_prefs', '{not-json');
    const user = userEvent.setup();

    render(<A11yProvider><A11yTogglePanel /></A11yProvider>);

    const largeText = screen.getByRole('checkbox', { name: 'Large text' });
    expect(largeText).not.toBeChecked();

    await user.click(largeText);

    expect(largeText).toBeChecked();
    expect(document.documentElement.dataset.concourseLargeText).toBe('true');
  });
});
