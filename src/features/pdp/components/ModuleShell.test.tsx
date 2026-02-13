import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModuleShell } from './ModuleShell';

describe('ModuleShell', () => {
  it('renders a fixed-height skeleton while loading', () => {
    render(
      <ModuleShell
        state="LOADING"
        height={232}
        skeleton={<div data-testid="skeleton">loading</div>}
      >
        <div>content</div>
      </ModuleShell>,
    );

    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toBeInTheDocument();
    const wrapper = skeleton.parentElement as HTMLElement;
    expect(wrapper.dataset.moduleState).toBe('loading');
    expect(wrapper.style.minHeight).toBe('232px');
  });

  it('renders ready content with stable container height', () => {
    render(
      <ModuleShell
        state="READY"
        height={320}
        skeleton={<div>loading</div>}
      >
        <div data-testid="content">ready</div>
      </ModuleShell>,
    );

    const content = screen.getByTestId('content');
    expect(content).toBeInTheDocument();
    const wrapper = content.parentElement as HTMLElement;
    expect(wrapper.dataset.moduleState).toBe('ready');
    expect(wrapper.style.minHeight).toBe('320px');
  });
});
