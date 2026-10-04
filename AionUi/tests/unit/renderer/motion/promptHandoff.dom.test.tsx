import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GuidInputCard from '@/renderer/pages/guid/components/GuidInputCard';

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => null }));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/FilePreview', () => ({ default: () => null }));
vi.mock('@/renderer/pages/guid/components/GuidWorkspaceFootnote', () => ({ default: () => null }));
vi.mock('@/renderer/hooks/ui/useMotion', () => ({ useMotion: () => ({ animate: () => null }) }));
const props = {
  input: '',
  onInputChange: vi.fn(),
  onKeyDown: vi.fn(),
  onPaste: vi.fn(),
  onFocus: vi.fn(),
  onBlur: vi.fn(),
  placeholder: 'Draft',
  isInputActive: false,
  isFileDragging: false,
  activeBorderColor: 'transparent',
  inactiveBorderColor: 'transparent',
  activeShadow: 'none',
  dragHandlers: {},
  files: [],
  onRemoveFile: vi.fn(),
  actionRow: null,
  workspaceDir: '',
  onSelectWorkspace: vi.fn(),
  onClearWorkspace: vi.fn(),
};
afterEach(cleanup);

describe('prompt handoff focus', () => {
  it('focuses the editable draft at its end even when animation is disabled', () => {
    const view = render(<GuidInputCard {...props} />);
    view.rerender(
      <GuidInputCard
        {...props}
        input='Explore this idea'
        promptTransfer={{ sequence: 1, text: 'Explore this idea', source: { left: 0, top: 0, width: 100, height: 30 } }}
      />
    );
    const input = screen.getByTestId('guid-input') as HTMLTextAreaElement;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe('Explore this idea'.length);
  });
  it('does not steal focus when restored text has no clicked prompt', () => {
    const view = render(<GuidInputCard {...props} />);
    view.rerender(<GuidInputCard {...props} input='Restored draft' />);
    expect(document.activeElement).not.toBe(screen.getByTestId('guid-input'));
  });
});
