#include <node_api.h>
#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <cmath>
#include <cstring>
#include <vector>

// Public AppKit views stay behind Chromium. No screen capture or private APIs.
static const void *glassViewsKey = &glassViewsKey;

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

  NSView *root = (__bridge NSView *)pointer;
  if (!root.window) return result;
  NSMutableArray<NSView *> *views = objc_getAssociatedObject(root, glassViewsKey);
  if (!views) {
    views = [NSMutableArray array];
    objc_setAssociatedObject(root, glassViewsKey, views, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  while (views.count > regions.count) {
    [views.lastObject removeFromSuperview];
    [views removeLastObject];
  }
  while (views.count < regions.count) {
    NSView *view;
    if (@available(macOS 26.0, *)) {
      NSGlassEffectView *glass = [[NSGlassEffectView alloc] initWithFrame:NSZeroRect];
      glass.style = NSGlassEffectViewStyleRegular;
      view = glass;
    } else {
      NSVisualEffectView *frost = [[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
      frost.blendingMode = NSVisualEffectBlendingModeBehindWindow;
      frost.material = NSVisualEffectMaterialUnderWindowBackground;
      frost.state = NSVisualEffectStateActive;
      view = frost;
    }
    [root addSubview:view positioned:NSWindowBelow relativeTo:nil];
    [views addObject:view];
  }
  NSAppearance *appearance = [NSAppearance appearanceNamed:[payload[@"dark"] boolValue] ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
  for (NSUInteger i = 0; i < regions.count; i++) {
    NSDictionary *region = regions[i];
    CGFloat x = [region[@"x"] doubleValue], y = [region[@"y"] doubleValue];
    CGFloat width = MAX(0, [region[@"width"] doubleValue]);
    CGFloat height = MAX(0, [region[@"height"] doubleValue]);
    CGFloat radius = MAX(0, [region[@"radius"] doubleValue]);
    if (!root.isFlipped) y = root.bounds.size.height - y - height;
    NSView *view = views[i];
    // Follow AppKit's live resize before Chromium's next layout reaches IPC.
    // Main panel stretches; the rail stays centered; the dock stays bottom-centered.
    view.autoresizingMask = i == 0 ? NSViewWidthSizable | NSViewHeightSizable
      : i == 1 ? NSViewMinYMargin | NSViewMaxYMargin
      : NSViewMinXMargin | NSViewMaxXMargin | NSViewMaxYMargin;
    view.frame = NSMakeRect(x, y, width, height);
    view.appearance = appearance;
    if (@available(macOS 26.0, *)) {
      ((NSGlassEffectView *)view).cornerRadius = radius;
    } else {
      view.wantsLayer = YES;
      view.layer.cornerRadius = radius;
      view.layer.masksToBounds = YES;
    }
  }
  napi_get_boolean(env, true, &result);
  return result;
}

static napi_value initialize(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "update", NAPI_AUTO_LENGTH, update, nullptr, &fn);
  napi_set_named_property(env, exports, "update", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
