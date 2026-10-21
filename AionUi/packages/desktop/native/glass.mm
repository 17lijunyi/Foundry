#include <node_api.h>
#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/message.h>
#import <objc/runtime.h>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <vector>

// Each rounded region owns its blur, system material and input-transparent view.
static const void *glassViewsKey = &glassViewsKey;
static constexpr CGFloat desktopBlurRadius = 20;

static bool desktopBlurAvailable() {
  if (std::getenv("FOUNDRY_DISABLE_NATIVE_BACKGROUND_BLUR")) return false;
  Class backdrop = NSClassFromString(@"CABackdropLayer");
  Class filter = NSClassFromString(@"CAFilter");
  return [backdrop isSubclassOfClass:[CALayer class]] &&
    [backdrop instancesRespondToSelector:NSSelectorFromString(@"setWindowServerAware:")] &&
    [backdrop instancesRespondToSelector:NSSelectorFromString(@"setScale:")] &&
    [filter respondsToSelector:NSSelectorFromString(@"filterWithType:")];
}

@interface FoundryGlassMaterialView : NSVisualEffectView
@end
@implementation FoundryGlassMaterialView
- (BOOL)isFlipped { return YES; }
@end

@interface FoundryGlassSurface : NSView
@property(nonatomic, strong) FoundryGlassMaterialView *material;
@property(nonatomic, strong) CAShapeLayer *roundedMask;
@property(nonatomic, strong) CALayer *desktopBackdrop;
@property(nonatomic) CGFloat glassRadius;
@property(nonatomic) CGFloat maskRadius;
@property(nonatomic) CGFloat maskScale;
@property(nonatomic) BOOL backdropFailed;
- (void)layoutMaterial;
@end

@implementation FoundryGlassSurface
- (instancetype)initWithFrame:(NSRect)frame {
  if ((self = [super initWithFrame:frame])) {
    self.wantsLayer = YES;
    self.layer.masksToBounds = YES;
    self.roundedMask = [CAShapeLayer layer];
    self.layer.mask = self.roundedMask;
    self.accessibilityElement = NO;
    self.material = [[FoundryGlassMaterialView alloc] initWithFrame:self.bounds];
    self.material.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    self.material.material = NSVisualEffectMaterialUnderWindowBackground;
    self.material.state = NSVisualEffectStateActive;
    self.material.alphaValue = 0.38;
    self.material.accessibilityElement = NO;
    [self addSubview:self.material];
  }
  return self;
}
- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstResponder { return NO; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)setFrameSize:(NSSize)size {
  [super setFrameSize:size];
  [self layoutMaterial];
}
- (void)viewDidMoveToWindow {
  [super viewDidMoveToWindow];
  [self layoutMaterial];
}
- (void)viewDidChangeBackingProperties {
  [super viewDidChangeBackingProperties];
  [self layoutMaterial];
}
- (void)layoutMaterial {
  if (!self.roundedMask || !self.material) return;
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  CGFloat radius = MIN(MAX(0, self.glassRadius), MIN(self.bounds.size.width, self.bounds.size.height) / 2);
  CGFloat scale = self.window.backingScaleFactor ?: 1;
  self.roundedMask.frame = self.bounds;
  CGPathRef shape = CGPathCreateWithRoundedRect(self.bounds, radius, radius, nullptr);
  self.roundedMask.path = shape;
  CGPathRelease(shape);
  self.material.frame = self.bounds;
  // maskImage clips the WindowServer material as well as the ordinary view layer.
  if (!self.material.maskImage || self.maskRadius != radius || self.maskScale != scale) {
    CGFloat size = std::ceil(radius * 2 + 1);
    NSInteger pixels = (NSInteger)std::ceil(size * scale);
    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:nil pixelsWide:pixels pixelsHigh:pixels bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
    std::memset(bitmap.bitmapData, 0, bitmap.bytesPerRow * bitmap.pixelsHigh);
    CGContextRef context = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap].CGContext;
    CGContextScaleCTM(context, scale, scale);
    CGPathRef mask = CGPathCreateWithRoundedRect(CGRectMake(0, 0, size, size), radius, radius, nullptr);
    CGContextSetRGBFillColor(context, 1, 1, 1, 1);
    CGContextAddPath(context, mask);
    CGContextFillPath(context);
    CGPathRelease(mask);
    NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(size, size)];
    [image addRepresentation:bitmap];
    image.capInsets = NSEdgeInsetsMake(radius, radius, radius, radius);
    image.resizingMode = NSImageResizingModeStretch;
    self.material.maskImage = image;
    self.maskRadius = radius;
    self.maskScale = scale;
  }
  // These optional private Core Animation classes are capability-checked and
  // contained by the same rounded mask. Never fall back to window-wide blur.
  if (!self.backdropFailed && desktopBlurAvailable()) {
    @try {
      if (!self.desktopBackdrop) {
        CALayer *layer = [NSClassFromString(@"CABackdropLayer") layer];
        if (!layer) [NSException raise:@"FoundryBlurUnavailable" format:@"Missing backdrop layer"];
        [layer setValue:@YES forKey:@"windowServerAware"];
        [layer setValue:@1 forKey:@"scale"];
        layer.masksToBounds = YES;
        self.desktopBackdrop = layer;
        [self.layer insertSublayer:layer atIndex:0];
      }
      self.desktopBackdrop.frame = self.bounds;
      if (self.desktopBackdrop.contentsScale != scale || !self.desktopBackdrop.filters.count) {
        id filter = ((id (*)(id, SEL, id))objc_msgSend)(NSClassFromString(@"CAFilter"), NSSelectorFromString(@"filterWithType:"), @"gaussianBlur");
        if (!filter) [NSException raise:@"FoundryBlurUnavailable" format:@"Missing Gaussian filter"];
        [filter setValue:@YES forKey:@"inputNormalizeEdges"];
        // The filter radius is in points; dividing by Retina scale weakens it.
        [filter setValue:@(desktopBlurRadius) forKey:@"inputRadius"];
        self.desktopBackdrop.filters = @[filter];
        self.desktopBackdrop.contentsScale = scale;
      }
    } @catch (NSException *exception) {
      [self.desktopBackdrop removeFromSuperlayer];
      self.desktopBackdrop = nil;
      self.backdropFailed = YES;
    }
  } else if (self.desktopBackdrop) {
    [self.desktopBackdrop removeFromSuperlayer];
    self.desktopBackdrop = nil;
  }
  [CATransaction commit];
}
@end

static bool applyGlassRegions(NSView *root, NSArray *regions, bool dark) {
  if (!root.window) return false;
  NSMutableArray<FoundryGlassSurface *> *views = objc_getAssociatedObject(root, glassViewsKey);
  if (!views) {
    views = [NSMutableArray array];
    objc_setAssociatedObject(root, glassViewsKey, views, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  while (views.count > regions.count) {
    [views.lastObject removeFromSuperview];
    [views removeLastObject];
  }
  while (views.count < regions.count) {
    FoundryGlassSurface *view = [[FoundryGlassSurface alloc] initWithFrame:NSZeroRect];
    [root addSubview:view positioned:NSWindowBelow relativeTo:nil];
    [views addObject:view];
  }
  NSAppearance *appearance = [NSAppearance appearanceNamed:dark ? NSAppearanceNameVibrantDark : NSAppearanceNameVibrantLight];
  for (NSUInteger i = 0; i < regions.count; i++) {
    NSDictionary *region = regions[i];
    CGFloat x = [region[@"x"] doubleValue], y = [region[@"y"] doubleValue];
    CGFloat width = MAX(0, [region[@"width"] doubleValue]);
    CGFloat height = MAX(0, [region[@"height"] doubleValue]);
    CGFloat radius = MAX(0, [region[@"radius"] doubleValue]);
    if (!root.isFlipped) y = root.bounds.size.height - y - height;
    FoundryGlassSurface *view = views[i];
    // Preserve live resizing before Chromium's next layout reaches IPC.
    view.autoresizingMask = i == 0 ? NSViewWidthSizable | NSViewHeightSizable
      : i == 1 ? NSViewMinYMargin | NSViewMaxYMargin
      : NSViewMinXMargin | NSViewMaxXMargin | NSViewMaxYMargin;
    view.glassRadius = radius;
    view.frame = NSMakeRect(x, y, width, height);
    view.appearance = appearance;
    view.material.appearance = appearance;
    [view layoutMaterial];
  }
  return true;
}

static napi_value update(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2], result;
  napi_get_boolean(env, false, &result);
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  bool isBuffer = false;
  if (argc != 2 || napi_is_buffer(env, args[0], &isBuffer) != napi_ok || !isBuffer) return result;
  void *bytes = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, args[0], &bytes, &length) != napi_ok || length != sizeof(void *)) return result;
  void *pointer = nullptr;
  std::memcpy(&pointer, bytes, sizeof(pointer));
  if (!pointer || ![NSThread isMainThread]) return result;

  size_t textLength = 0;
  if (napi_get_value_string_utf8(env, args[1], nullptr, 0, &textLength) != napi_ok || textLength > 8192) return result;
  std::vector<char> text(textLength + 1);
  napi_get_value_string_utf8(env, args[1], text.data(), text.size(), &textLength);
  NSData *data = [NSData dataWithBytes:text.data() length:textLength];
  NSDictionary *payload = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if (![payload isKindOfClass:[NSDictionary class]]) return result;
  NSArray *regions = payload[@"regions"];
  if (![regions isKindOfClass:[NSArray class]] || regions.count > 3) return result;
  for (NSDictionary *region in regions) {
    if (![region isKindOfClass:[NSDictionary class]]) return result;
    for (NSString *key in @[@"x", @"y", @"width", @"height", @"radius"]) {
      id value = region[key];
      if (![value isKindOfClass:[NSNumber class]] || !std::isfinite([value doubleValue])) return result;
    }
  }
  napi_get_boolean(env, applyGlassRegions((__bridge NSView *)pointer, regions, [payload[@"dark"] boolValue]), &result);
  return result;
}

static napi_value initialize(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "update", NAPI_AUTO_LENGTH, update, nullptr, &fn);
  napi_set_named_property(env, exports, "update", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
