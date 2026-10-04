# macOS glass surfaces

`glass.mm` is a Node-API module built by the desktop Vite configuration. It uses public AppKit APIs: `NSGlassEffectView` on macOS 26 and `NSVisualEffectView` on earlier versions. Build on macOS with the macOS 26 SDK and Node headers; `AIONUI_NODE_HEADERS` and `AIONUI_NATIVE_ARCH` can override header discovery and the target architecture.

The renderer measures the main panel, navigation rail and bottom dock. The existing IPC bridge validates and scales these three rectangles before sending them to the native module. AppKit owns the glass views as children of the window's content view, so they are released with that window. Empty space stays transparent and passes pointer clicks through to the desktop. The titlebar remains draggable and the standard window controls move with the main panel.

Native autoresizing keeps the glass aligned during window animations. The macOS main window disables Chromium background throttling so an inactive window's content continues to resize with AppKit; standard window-control positions are reapplied after native zoom and resize events.

The compiled module is emitted to `out/main/native/glass.node` and unpacked from ASAR when packaging. Other platforms keep the browser glass theme. If loading the module fails, macOS retains readable translucent CSS panels. The module does not capture the screen or use private macOS selectors.
