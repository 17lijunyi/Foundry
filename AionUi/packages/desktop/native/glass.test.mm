// Offscreen AppKit checks. This executable never orders a window onto the desktop.
#include "glass.mm"
#include <cstdio>

static void check(bool condition, const char *message) {
  if (!condition) { std::fprintf(stderr, "FAIL: %s\n", message); std::exit(1); }
}
static NSArray *regions() {
  return @[
    @{@"x": @100, @"y": @30, @"width": @720, @"height": @600, @"radius": @30},
    @{@"x": @20, @"y": @200, @"width": @50, @"height": @300, @"radius": @25},
    @{@"x": @400, @"y": @700, @"width": @200, @"height": @50, @"radius": @25},
  ];
}
int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1000, 800) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    window.releasedWhenClosed = NO;
    NSView *root = window.contentView;
    check(!applyGlassRegions([[NSView alloc] initWithFrame:NSZeroRect], regions(), false), "reject a detached native view");
    check(applyGlassRegions(root, regions(), false), "attach three glass regions");
    NSMutableArray<FoundryGlassSurface *> *views = objc_getAssociatedObject(root, glassViewsKey);
    check(views.count == 3, "exactly three independently clipped surfaces");
    for (FoundryGlassSurface *view in views) {
      check(view.material.material == NSVisualEffectMaterialUnderWindowBackground, "shared under-window material");
      check(view.material.blendingMode == NSVisualEffectBlendingModeBehindWindow && view.material.state == NSVisualEffectStateActive, "active desktop material");
      check(std::abs(view.material.alphaValue - 0.38) < 0.001, "shared material opacity");
      check([view.appearance.name isEqualToString:NSAppearanceNameVibrantLight] && [view.material.appearance.name isEqualToString:NSAppearanceNameVibrantLight], "fixed light glass appearance");
      check([view hitTest:NSMakePoint(25, 25)] == nil && !view.acceptsFirstResponder, "glass never intercepts input or focus");
      check(view.layer.mask == view.roundedMask && view.material.maskImage != nil, "both native layers are rounded");
      check(!CGPathContainsPoint(view.roundedMask.path, nullptr, CGPointMake(0, 0), false), "transparent round corner stays outside material");
      if (desktopBlurAvailable() && !view.backdropFailed) {
        check(view.desktopBackdrop.superlayer == view.layer, "desktop blur is a child of the mask");
        check([[view.desktopBackdrop.filters.firstObject valueForKey:@"inputRadius"] doubleValue] == 20, "20-point blur is not reduced on Retina");
      }
    }
    FoundryGlassSurface *panel = views[0];
    [root setFrameSize:NSMakeSize(1100, 900)];
    check(panel.frame.size.width == 820 && panel.frame.size.height == 700, "main panel follows native live resize");
    check(NSEqualRects(panel.material.frame, panel.bounds) && NSEqualRects(panel.roundedMask.frame, panel.bounds), "material and mask follow live resize before IPC");
    if (panel.desktopBackdrop) check(NSEqualRects(panel.desktopBackdrop.frame, panel.bounds), "desktop blur follows live resize");
    check(CGPathContainsPoint(panel.roundedMask.path, nullptr, CGPointMake(810, 350), false), "rounded mask expands with native resize");
    check(applyGlassRegions(root, regions(), true), "retain dark custom glass support");
    check([panel.material.appearance.name isEqualToString:NSAppearanceNameVibrantDark], "dark custom glass has dark material");
    check(applyGlassRegions(root, @[], false) && views.count == 0, "solid appearance removes every native material");
    check(panel.superview == nil, "removed material cannot remain behind solid panels");
    setenv("FOUNDRY_DISABLE_NATIVE_BACKGROUND_BLUR", "1", 1);
    check(applyGlassRegions(root, regions(), false), "fallback is usable without optional backdrop APIs");
    for (FoundryGlassSurface *view in views) {
      check(view.desktopBackdrop == nil && view.material.maskImage != nil, "fallback retains masked public material only");
    }
    applyGlassRegions(root, @[], false);
    unsetenv("FOUNDRY_DISABLE_NATIVE_BACKGROUND_BLUR");
    check(!window.visible, "native verification never opens a visible window");
    [window close];
    std::puts("PASS: native glass material, rounded clipping, live resize, input transparency, dark compatibility, solid cleanup, optional-API fallback");
  }
  return 0;
}
