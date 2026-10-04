import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BenchRunStatus } from '@/renderer/pages/ModelBench/BenchRunStatus';
import type { BenchResult } from '@/renderer/pages/ModelBench/types';

const { animate } = vi.hoisted(() => ({ animate: vi.fn() }));
vi.mock('@/renderer/hooks/ui/useMotion', () => ({ useMotion: () => ({ animate }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const target = { provider_id: 'one', provider_name: 'Provider', model: 'Model' };
const result: BenchResult = { target, text: '', status: 'running', elapsed: 0, startedAt: 1000 };

afterEach(() => {
  cleanup();
  animate.mockClear();
});

describe('independent comparison lane motion', () => {
  it('does not animate historical completed results', () => {
    render(<BenchRunStatus result={{ ...result, status: 'done', elapsed: 1200 }} now={2000} />);
    expect(animate).not.toHaveBeenCalled();
  });
  it('finishes exactly once and ignores text and clock updates', () => {
    const view = render(<BenchRunStatus result={result} now={2000} />);
    view.rerender(<BenchRunStatus result={{ ...result, text: 'token' }} now={2300} />);
    expect(animate).not.toHaveBeenCalled();
    view.rerender(<BenchRunStatus result={{ ...result, status: 'done', elapsed: 1500 }} now={3000} />);
    view.rerender(<BenchRunStatus result={{ ...result, status: 'done', text: 'final', elapsed: 1500 }} now={3500} />);
    expect(animate).toHaveBeenCalledOnce();
    expect(screen.getByText('1.5 s')).toBeTruthy();
  });
  it('does not celebrate errors or stopped requests', () => {
    const view = render(<BenchRunStatus result={result} now={2000} />);
    view.rerender(<BenchRunStatus result={{ ...result, status: 'error' }} now={3000} />);
    view.rerender(<BenchRunStatus result={{ ...result, status: 'stopped' }} now={3500} />);
    expect(animate).not.toHaveBeenCalled();
  });
});
