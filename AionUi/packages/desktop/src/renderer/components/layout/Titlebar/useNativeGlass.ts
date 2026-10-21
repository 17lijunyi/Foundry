import { ipcBridge } from '@/common';
import type { GlassRegion } from '@/common/adapter/ipcBridge';
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
    let interactionActive = false;
    let lastGeometry = '';
    const observed = new Set<Element>();
    const regionFor = (element: HTMLElement): GlassRegion | undefined => {
      const { x, y, width, height } = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (width <= 0 || height <= 0 || style.display === 'none' || style.visibility === 'hidden') return undefined;
      return { x, y, width, height, radius: parseFloat(style.borderRadius) || 0 };
    };
    const synchronize = () => {
      if (disposed) return;
      const panels = [
        document.querySelector('.glass-window-panel'),
        document.querySelector('[data-glass-region="rail"]'),
        document.querySelector('[data-glass-region="dock"]'),
      ].filter((element): element is HTMLElement => element instanceof HTMLElement && element.offsetWidth > 0);
      // Portals live outside the panel. Their menus and modal masks must keep
      // receiving input even when they overlap transparent desktop space.
      const overlays = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.arco-trigger-popup, .arco-modal-wrapper, .arco-modal-mask, .arco-drawer-wrapper, .arco-drawer-mask, .arco-notification, .arco-message, [role="dialog"], [role="menu"], [role="listbox"], [data-glass-input]'
        )
      ).filter((element) => !panels.some((panel) => panel.contains(element)));
      const targets = new Set<Element>([...panels, ...overlays]);
      const shell = document.querySelector('.app-shell');
      if (shell) targets.add(shell);
      for (const element of observed) {
        if (!targets.has(element)) {
          observer.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of targets) {
        if (!observed.has(element)) {
          observer.observe(element);
          observed.add(element);
        }
      }
      const regions = panels.map(regionFor).filter((region): region is GlassRegion => Boolean(region));
      const inputRegions = [
        ...regions,
        ...overlays
          .filter((element) => getComputedStyle(element).pointerEvents !== 'none')
          .map(regionFor)
          .filter((region): region is GlassRegion => Boolean(region)),
      ];
      const surface: 'solid' | 'glass' = root.dataset.surface === 'solid' ? 'solid' : 'glass';
      const payload = {
        regions,
        // Fail closed if an unusually large number of popups is present.
        inputRegions:
          inputRegions.length <= 64
            ? inputRegions
            : [{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, radius: 0 }],
        interactionActive,
        surface,
        dark: document.body.getAttribute('arco-theme') === 'dark',
      };
      const geometry = JSON.stringify(payload);
      if (geometry === lastGeometry) return;
      lastGeometry = geometry;
      void ipcBridge.windowControls.updateGlass
        .invoke(payload)
        .then((enabled) => {
          if (!disposed && lastGeometry === geometry) root.dataset.nativeGlass = String(enabled);
        })
        .catch((error) => {
          if (!disposed && lastGeometry === geometry) lastGeometry = '';
          console.warn('Could not synchronize native glass:', error);
        });
    };
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(synchronize);
    };
    const observer = new ResizeObserver(measure);
    const layoutObserver = new MutationObserver(measure);
    layoutObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['arco-theme', 'class', 'style', 'hidden', 'role', 'data-glass-input'],
    });
    layoutObserver.observe(root, { attributes: true, attributeFilter: ['data-surface'] });
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
      const ignore = !interactionActive && onCanvas && !atWindowEdge;
      if (ignoring === ignore) return;
      ignoring = ignore;
      void ipcBridge.windowControls.setPointerPassthrough.invoke(ignore).catch(() => {
        ignoring = !ignore;
      });
    };
    const beginInteraction = () => {
      interactionActive = true;
      synchronize();
    };
    const endInteraction = () => {
      interactionActive = false;
      synchronize();
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('transitionend', measure, true);
    window.addEventListener('animationend', measure, true);
    window.addEventListener('pointerdown', beginInteraction, true);
    window.addEventListener('pointerup', endInteraction, true);
    window.addEventListener('pointercancel', endInteraction, true);
    window.addEventListener('dragstart', beginInteraction, true);
    window.addEventListener('dragend', endInteraction, true);
    window.addEventListener('blur', endInteraction);
    window.addEventListener('focus', endInteraction);
    document.addEventListener('visibilitychange', endInteraction);
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      layoutObserver.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('transitionend', measure, true);
      window.removeEventListener('animationend', measure, true);
      window.removeEventListener('pointerdown', beginInteraction, true);
      window.removeEventListener('pointerup', endInteraction, true);
      window.removeEventListener('pointercancel', endInteraction, true);
      window.removeEventListener('dragstart', beginInteraction, true);
      window.removeEventListener('dragend', endInteraction, true);
      window.removeEventListener('blur', endInteraction);
      window.removeEventListener('focus', endInteraction);
      document.removeEventListener('visibilitychange', endInteraction);
      delete root.dataset.glassDesktop;
      delete root.dataset.nativeGlass;
      void ipcBridge.windowControls.setPointerPassthrough.invoke(false).catch(() => {});
      void ipcBridge.windowControls.updateGlass.invoke({ regions: [], dark: false }).catch(() => {});
    };
  }, []);
}
