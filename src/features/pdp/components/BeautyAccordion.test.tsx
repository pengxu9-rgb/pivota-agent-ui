import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BeautyAccordion } from './BeautyAccordion';

afterEach(() => {
  cleanup();
});

describe('BeautyAccordion', () => {
  // Regression: the body used to be `{open ? … : null}`, so a collapsed
  // section's text never entered the SSR HTML. Crawlers (GPTBot, ClaudeBot,
  // Googlebot's HTML pass) saw the header and nothing else — the mixsoon Bean
  // Essence PDP served 624 readable chars while holding 726 chars of
  // description. Same fix PR #171 applied to DetailsAccordion.
  it('keeps collapsed body content in the DOM inside a hidden panel', () => {
    render(
      <BeautyAccordion title="Product details">
        <p>fermented soybean extract smooths skin texture</p>
      </BeautyAccordion>,
    );

    const body = screen.getByText('fermented soybean extract smooths skin texture');
    expect(body).toBeInTheDocument();
    expect(body.closest('[hidden]')).not.toBeNull();
  });

  it('reveals the body on click and re-hides it on a second click', () => {
    render(
      <BeautyAccordion title="Ingredients">
        <p>Snail Secretion Filtrate</p>
      </BeautyAccordion>,
    );

    const header = screen.getByRole('button', { name: /Ingredients/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(header);
    expect(screen.getByText('Snail Secretion Filtrate').closest('[hidden]')).toBeNull();
    expect(header).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(header);
    expect(screen.getByText('Snail Secretion Filtrate').closest('[hidden]')).not.toBeNull();
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders a defaultOpen section visible on first paint', () => {
    render(
      <BeautyAccordion title="Reviews" count={0} defaultOpen>
        <p>No reviews yet.</p>
      </BeautyAccordion>,
    );

    expect(screen.getByText('No reviews yet.').closest('[hidden]')).toBeNull();
    expect(screen.getByRole('button', { name: /Reviews/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('wires the header to its panel with aria-controls', () => {
    render(
      <BeautyAccordion title="How to use">
        <p>Apply morning and evening.</p>
      </BeautyAccordion>,
    );

    const panelId = screen.getByRole('button', { name: /How to use/ }).getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    // useId() emits colons (`:r3:`), which are not valid in a CSS id selector —
    // resolve the panel by id lookup rather than `closest('#…')`.
    const panel = document.getElementById(panelId as string);
    expect(panel).not.toBeNull();
    expect(panel).toContainElement(screen.getByText('Apply morning and evening.'));
  });
});
