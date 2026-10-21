# macOS glass surfaces

`glass.mm` is a Node-API module built by the desktop Vite configuration. Its soft-focus material matches the local 悬浮岛 implementation: an active, behind-window `NSVisualEffectView` with `NSVisualEffectMaterialUnderWindowBackground`, `NSAppearanceNameVibrantLight`, and material opacity `0.38`. Dark custom themes use `NSAppearanceNameVibrantDark`; the white and black presets remove the native surfaces entirely.

The extra desktop soft focus uses the optional private Core Animation classes `CABackdropLayer` and `CAFilter`, discovered at runtime. The Gaussian blur radius is **20 points**, including on Retina displays, with normalized edges and backdrop scale `1`. The layer is a child of each region's rounded mask, never a window-wide blur. If the capability is missing or raises an exception, the masked public AppKit material remains usable. `FOUNDRY_DISABLE_NATIVE_BACKGROUND_BLUR=1` explicitly selects that fallback. No screen capture or screenshot-based background is used.

The renderer measures the main panel, navigation rail and bottom dock. The existing IPC bridge validates and scales these three rectangles before sending them to the native module. AppKit owns the glass views as children of the window's content view, so they are released with that window. Every material wrapper rejects hit testing and first-responder status. Empty space stays transparent and passes pointer clicks through to the desktop; the titlebar and standard window controls retain their existing behavior.

Native autoresizing keeps the glass aligned during window animations. The rounded shape mask, stretchable material `maskImage`, and optional blur layer follow size and backing-scale changes before Chromium's next layout update. The macOS main window disables Chromium background throttling so an inactive window's content continues to resize with AppKit; standard window-control positions are reapplied after native zoom and resize events.

Build on macOS with AppKit, QuartzCore, and Node headers; `AIONUI_NODE_HEADERS` and `AIONUI_NATIVE_ARCH` can override header discovery and the target architecture. The compiled module is emitted to `out/main/native/glass.node` and unpacked from ASAR when packaging. Other platforms keep the browser glass theme. If loading the module fails, macOS retains readable translucent CSS panels.

## Offscreen native verification

`glass.test.mm` exercises the actual AppKit view hierarchy without displaying a window. It verifies the shared material values, independently rounded regions, click/focus transparency, native live resize, dark compatibility, removal for solid themes, and the optional-API fallback. Replace the include path with `AIONUI_NODE_HEADERS` when needed:

```sh
xcrun clang++ -std=c++17 -fobjc-arc -undefined dynamic_lookup -mmacosx-version-min=12.0 \
  -framework AppKit -framework QuartzCore -I /usr/local/include/node \
  packages/desktop/native/glass.test.mm -o /tmp/foundry-glass-native-test
/tmp/foundry-glass-native-test
rm /tmp/foundry-glass-native-test
```
