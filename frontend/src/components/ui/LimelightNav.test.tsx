import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LimelightNav, type NavItem } from './LimelightNav.tsx';

const Icon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} aria-hidden="true" />;

const items: NavItem[] = [
  { id: 'home', icon: <Icon />, label: 'Home' },
  { id: 'map', icon: <Icon />, label: 'Map', onClick: vi.fn() },
];

describe('LimelightNav', () => {
  it('renders the default navigation set when no items are provided', () => {
    render(<LimelightNav />);

    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('supports uncontrolled tab changes and item callbacks', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<LimelightNav items={items} onTabChange={onTabChange} />);

    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Map' }));

    expect(onTabChange).toHaveBeenCalledWith(1);
    expect(items[1]?.onClick).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('follows controlled activeIndex and renders nothing for an empty item list', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const { rerender, container } = render(<LimelightNav items={items} activeIndex={0} onTabChange={onTabChange} />);

    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(onTabChange).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'true');

    rerender(<LimelightNav items={items} activeIndex={1} onTabChange={onTabChange} />);
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true');

    rerender(<LimelightNav items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
