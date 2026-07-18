import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageBubble } from './MessageBubble.tsx';
import { ToolCallChip } from './ToolCallChip.tsx';

describe('MessageBubble and ToolCallChip', () => {
  it('renders user markdown and assistant tool states accessibly', () => {
    render(
      <>
        <MessageBubble msg={{ id: 'u1', role: 'user', text: '**Hello** there' }} />
        <MessageBubble
          msg={{
            id: 'a1',
            role: 'assistant',
            text: 'Go to Section 108',
            streaming: true,
            tools: [
              { id: 't1', name: 'find_route' },
              { id: 't2', name: 'list_facilities', ok: true, summary: 'Found restrooms' },
              { id: 't3', name: 'resolve_place', ok: false, summary: 'Place missing' },
            ],
          }}
        />
      </>,
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Finding route')).toBeInTheDocument();
    expect(screen.getByText('Found restrooms')).toBeInTheDocument();
    expect(screen.getByText('Place missing')).toBeInTheDocument();
    expect(screen.getByText('▍')).toBeInTheDocument();
  });

  it('shows typing dots when an assistant is streaming without text or tools', () => {
    render(<MessageBubble msg={{ id: 'a2', role: 'assistant', text: '', streaming: true, tools: [] }} />);
    expect(screen.getByLabelText('Concourse is thinking')).toBeInTheDocument();
  });

  it('falls back to raw tool names for unknown tool calls', () => {
    render(<ToolCallChip chip={{ id: 'custom', name: 'custom_tool' }} />);
    expect(screen.getByText('custom_tool')).toBeInTheDocument();
  });
});
