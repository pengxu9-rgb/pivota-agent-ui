import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DetailsAccordion } from './DetailsAccordion';

afterEach(() => {
  cleanup();
});

describe('DetailsAccordion', () => {
  it('keeps collapsed section content in the DOM inside a hidden panel', () => {
    render(
      <DetailsAccordion
        data={{
          sections: [{ heading: 'Test', content_type: 'text', content: 'Hello world' }],
        }}
      />,
    );

    const content = screen.getByText('Hello world');
    expect(content).toBeInTheDocument();
    expect(content.closest('[hidden]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    expect(screen.getByText('Hello world').closest('[hidden]')).toBeNull();
  });
});
