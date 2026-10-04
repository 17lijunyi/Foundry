import { ipcBridge } from '@/common';
import { useEffect } from 'react';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';

/** Keep AppKit materials aligned with the actual responsive panel bounds. */
export function useNativeGlass(): void {
  useEffect(() => {
    if (!isElectronDesktop() || !isMacOS()) return undefined;
    const root = document.documentElement;
    root.dataset.glassDesktop = 'true';
    let frame = 0;
    let disposed = false;
    let ignoring = false;
    let lastGeometry = '';
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const panels = [
          document.querySelector('.glass-window-panel'),
          document.querySelector('[data-glass-region="rail"]'),
          document.querySelector('[data-glass-region="dock"]'),
        ].filter((element): element is HTMLElement => element instanceof HTMLElement && element.offsetWidth > 0);
        const payload = {
          regions: panels.map((panel) => {
            const { x, y, width, height } = panel.getBoundingClientRect();
            return { x, y, width, height, radius: parseFloat(getComputedStyle(panel).borderRadius) || 0 };
          }),
          dark: document.body.getAttribute('arco-theme') === 'dark',
        };
        const geometry = JSON.stringify(payload);
        if (geometry === lastGeometry) return;
        lastGeometry = geometry;
        void ipcBridge.windowControls.updateGlass
          .invoke(payload)
          .then((enabled) => {
            if (!disposed) root.dataset.nativeGlass = String(enabled);
          })
          .catch((error) => console.warn('Could not synchronize native glass:', error));
      });
    };
    const observer = new ResizeObserver(measure);
    document
      .querySelectorAll('.app-shell, .glass-window-panel, [data-glass-region]')
      .forEach((panel) => observer.observe(panel));
    const themeObserver = new MutationObserver(measure);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['arco-theme'] });
    const onMouseMove = (event: MouseEvent) => {
      const target = event.target;
      const onCanvas =
        target === document.body ||
        target === root ||
        (target instanceof Element && (target.id === 'root' || target.classList.contains('app-shell')));
      const atWindowEdge =
        event.clientX < 6 ||
        event.clientY < 6 ||
        event.clientX > window.innerWidth - 6 ||
        event.clientY > window.innerHeight - 6;
      const ignore = onCanvas && !atWindowEdge;
      if (ignoring === ignore) return;
      ignoring = ignore;
      void ipcBridge.windowControls.setPointerPassthrough.invoke(ignore).catch(() => {
        ignoring = !ignore;
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('mousemove', onMouseMove);
      delete root.dataset.glassDesktop;
      delete root.dataset.nativeGlass;
      void ipcBridge.windowControls.setPointerPassthrough.invoke(false).catch(() => {});
      void ipcBridge.windowControls.updateGlass.invoke({ regions: [], dark: false }).catch(() => {});
    };
  }, []);
}
