// Copyright 2022 The Chromium Authors
// CoreGraphics interface declarations are adapted from Chromium's
// ui/display/mac/test/virtual_display_util_mac.mm under the BSD license in
// licenses/chromium-display-tests-LICENSE.txt. The process lifecycle is Forhan's.
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/** Private CoreGraphics descriptor used only by an owned ephemeral CI process. */
@interface CGVirtualDisplayDescriptor : NSObject
@property(nonatomic) unsigned int vendorID;
@property(nonatomic) unsigned int productID;
@property(nonatomic) unsigned int serialNum;
@property(nonatomic) unsigned int serialNumber;
@property(strong, nonatomic) NSString *name;
@property(nonatomic) CGSize sizeInMillimeters;
@property(nonatomic) unsigned int maxPixelsWide;
@property(nonatomic) unsigned int maxPixelsHigh;
@property(nonatomic) CGPoint redPrimary;
@property(nonatomic) CGPoint greenPrimary;
@property(nonatomic) CGPoint bluePrimary;
@property(nonatomic) CGPoint whitePoint;
@property(strong, nonatomic) id queue;
@end

/** Native display mode remains separate from any renderer viewport emulation. */
@interface CGVirtualDisplayMode : NSObject
/**
 * Initialize one actual CoreGraphics display mode.
 *
 * The declaration describes the system implementation; no target program is loaded.
 * @param {unsigned int} width - Actual unscaled display width.
 * @param {unsigned int} height - Actual unscaled display height.
 * @param {double} refreshRate - Native refresh rate in hertz.
 * @returns {id} System-created mode or nil when unsupported.
 * @example
 * [mode initWithWidth:1920 height:1440 refreshRate:60];
 */
- (id)initWithWidth:(unsigned int)width height:(unsigned int)height refreshRate:(double)refreshRate;
@end

/** One unscaled mode is exposed to the native window server for this CI run. */
@interface CGVirtualDisplaySettings : NSObject
@property(strong, nonatomic) NSArray *modes;
@property(nonatomic) unsigned int hiDPI;
@property(nonatomic) unsigned int rotation;
@end

/** Retaining this system object owns the lifetime of the temporary native screen. */
@interface CGVirtualDisplay : NSObject
@property(readonly, nonatomic) unsigned int displayID;
/**
 * Create an actual native display from the supplied descriptor.
 *
 * This is an optional private system API, so unsupported CI hosts fail explicitly.
 * @param {id} descriptor - Original descriptor owned by this helper.
 * @returns {id} Native display object or nil when creation is unavailable.
 * @example
 * [display initWithDescriptor:descriptor];
 */
- (id)initWithDescriptor:(id)descriptor;
/**
 * Apply an unscaled original native mode to this display.
 *
 * The result must also be verified through independent CoreGraphics mode queries.
 * @param {id} settings - Native mode settings for the owned temporary screen.
 * @returns {BOOL} Whether the window server admitted the requested settings.
 * @example
 * [display applySettings:settings];
 */
- (BOOL)applySettings:(id)settings;
@end

/**
 * Observe original native display identities, bounds and primary ownership.
 *
 * This separate query never creates or configures a display. Setup and teardown
 * use it to verify actual window-server state independently of requested modes.
 * @returns {NSDictionary *} Current native primary identity and active bounds.
 * @example
 * NSDictionary *snapshot = inspectNativeDisplays();
 */
static NSDictionary *inspectNativeDisplays(void) {
  CGDirectDisplayID identifiers[32];
  uint32_t count = 0;
  if (CGGetActiveDisplayList(32, identifiers, &count) != kCGErrorSuccess) return nil;
  /** Each active native screen is observed before any change or after owned teardown. */
  NSMutableArray *const displays = [NSMutableArray array];
  for (uint32_t index = 0; index < count; index++) {
    /** Native bounds are physical window-server observations, not renderer metadata. */
    CGRect const bounds = CGDisplayBounds(identifiers[index]);
    [displays addObject:@{@"id": @(identifiers[index]), @"x": @(bounds.origin.x), @"y": @(bounds.origin.y),
                         @"width": @(bounds.size.width), @"height": @(bounds.size.height)}];
  }
  return @{@"primaryDisplayId": @(CGMainDisplayID()), @"displays": displays};
}

/**
 * Maintain one real temporary macOS CI screen until its owner requests cleanup.
 *
 * The helper refuses ordinary local machines, retains the display object while
 * tests run while preserving the existing primary screen and native origins.
 * A private stop file and a ninety-minute deadline bound the process lifetime.
 * @param {int} argc - Argument count, including the executable name.
 * @param {char **} argv - Private owner directory and unique invocation nonce.
 * @returns {int} Zero after owned cleanup, or a nonzero setup/cleanup failure code.
 * @example
 * // CI invokes the compiled helper with its own temporary directory and nonce.
 */
int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (strcmp(getenv("GITHUB_ACTIONS") ?: "", "true") != 0) return 10;
    if (argc == 2 && strcmp(argv[1], "--inspect") == 0) {
      /** Independent native snapshots remain available before creation and after the actor exits. */
      NSDictionary *const snapshot = inspectNativeDisplays();
      if (!snapshot) return 13;
      /** Only bounded native display metadata is written to the original caller. */
      NSData *const encoded = [NSJSONSerialization dataWithJSONObject:snapshot options:0 error:nil];
      fwrite(encoded.bytes, 1, encoded.length, stdout);
      return 0;
    }
    if (argc != 3) return 10;
    /** Exact invocation identity is shared only with the owning TypeScript setup. */
    NSString *const directory = [NSString stringWithUTF8String:argv[1]];
    /** A distinct nonce prevents cleanup from attaching to another helper invocation. */
    NSString *const nonce = [NSString stringWithUTF8String:argv[2]];
    if (![directory.lastPathComponent hasPrefix:@"forhan-ci-native-display-"] || nonce.length != 36) return 11;
    /** Dynamic class lookup avoids assuming private API symbols are exposed by an SDK. */
    Class const descriptorClass = NSClassFromString(@"CGVirtualDisplayDescriptor");
    /** The display object is optional on headless or unsupported native CI hosts. */
    Class const displayClass = NSClassFromString(@"CGVirtualDisplay");
    /** The mode class describes actual window-server dimensions rather than screenshots. */
    Class const modeClass = NSClassFromString(@"CGVirtualDisplayMode");
    /** Original settings are applied without HiDPI scaling. */
    Class const settingsClass = NSClassFromString(@"CGVirtualDisplaySettings");
    if (!descriptorClass || !displayClass || !modeClass || !settingsClass) return 12;
    /** Native screen dimensions exceed the largest 1440-by-1100 fixture plus system chrome. */
    unsigned int const width = 1920, height = 1440;
    /** Only this invocation owns the descriptor, display, mode and lifecycle marker. */
    CGVirtualDisplayDescriptor *const descriptor = [[descriptorClass alloc] init];
    descriptor.name = [@"Forhan CI " stringByAppendingString:nonce];
    descriptor.queue = dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);
    descriptor.vendorID = 505;
    descriptor.productID = 1;
    descriptor.serialNum = (unsigned int)getpid();
    descriptor.serialNumber = descriptor.serialNum;
    descriptor.maxPixelsWide = width;
    descriptor.maxPixelsHigh = height;
    descriptor.sizeInMillimeters = CGSizeMake(width * 25.4 / 96, height * 25.4 / 96);
    descriptor.redPrimary = CGPointMake(0.64, 0.33);
    descriptor.greenPrimary = CGPointMake(0.30, 0.60);
    descriptor.bluePrimary = CGPointMake(0.15, 0.06);
    descriptor.whitePoint = CGPointMake(0.3127, 0.3290);
    /** The precise native object owns this temporary display until the helper exits. */
    __attribute__((objc_precise_lifetime)) CGVirtualDisplay *const display = [[displayClass alloc] initWithDescriptor:descriptor];
    if (!display) return 14;
    /** One original native mode is retained without synthesized display scale. */
    CGVirtualDisplayMode *const mode = [[modeClass alloc] initWithWidth:width height:height refreshRate:60];
    /** Native mode settings never modify the application's source or expected pixel coordinates. */
    CGVirtualDisplaySettings *const settings = [[settingsClass alloc] init];
    settings.hiDPI = 0;
    settings.rotation = 0;
    settings.modes = @[mode];
    if (![display applySettings:settings]) return 15;
    /** Native display identity is observed from the actual system-owned object. */
    CGDirectDisplayID const identifier = display.displayID;
      /** The window server may publish a new screen asynchronously after mode admission. */
      NSDate *const admissionDeadline = [NSDate dateWithTimeIntervalSinceNow:15];
      while (!CGDisplayIsActive(identifier) && [admissionDeadline timeIntervalSinceNow] > 0)
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
      if (!CGDisplayIsActive(identifier)) return 16;
      /** Advertising a mode does not guarantee that a new native screen selects it immediately. */
      NSDate *const modeDeadline = [NSDate dateWithTimeIntervalSinceNow:5];
      BOOL applied = NO;
      while (!applied && [modeDeadline timeIntervalSinceNow] > 0) {
        /** Only modes published for this exact owned native display are eligible. */
        CFArrayRef const available = CGDisplayCopyAllDisplayModes(identifier, NULL);
        if (available) {
          for (CFIndex index = 0; index < CFArrayGetCount(available); index++) {
            /** Logical and physical dimensions independently reject synthesized HiDPI modes. */
            CGDisplayModeRef const candidate = (CGDisplayModeRef)CFArrayGetValueAtIndex(available, index);
            if (CGDisplayModeGetWidth(candidate) != width || CGDisplayModeGetHeight(candidate) != height ||
                CGDisplayModeGetPixelWidth(candidate) != width || CGDisplayModeGetPixelHeight(candidate) != height) continue;
            applied = CGDisplaySetDisplayMode(identifier, candidate, NULL) == kCGErrorSuccess;
            if (applied) break;
          }
          CFRelease(available);
        }
        if (!applied) [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
      }
      if (!applied) return 17;
      /** A successful mode request can precede the window server replacing its initial one-pixel placeholder. */
      NSDate *const observationDeadline = [NSDate dateWithTimeIntervalSinceNow:15];
      CGDisplayModeRef observed = NULL;
      while ([observationDeadline timeIntervalSinceNow] > 0) {
        observed = CGDisplayCopyDisplayMode(identifier);
        if (observed && CGDisplayModeGetWidth(observed) == width && CGDisplayModeGetHeight(observed) == height &&
            CGDisplayModeGetPixelWidth(observed) == width && CGDisplayModeGetPixelHeight(observed) == height) break;
        if (observed) CGDisplayModeRelease(observed);
        observed = NULL;
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
      }
      /** Failure retains the last actual native mode for diagnostics instead of reporting requested dimensions. */
      if (!observed) observed = CGDisplayCopyDisplayMode(identifier);
      if (!observed) return 20;
      /** Readiness records physical and logical dimensions separately to reject HiDPI emulation. */
      NSDictionary *const observation = @{
        @"kind": @"owned-native-ci-virtual-display",
        @"nonce": nonce, @"pid": @(getpid()), @"displayId": @(identifier),
        @"primaryDisplayId": @(CGMainDisplayID()),
        @"width": @(CGDisplayModeGetWidth(observed)), @"height": @(CGDisplayModeGetHeight(observed)),
        @"pixelWidth": @(CGDisplayModeGetPixelWidth(observed)), @"pixelHeight": @(CGDisplayModeGetPixelHeight(observed))
      };
      CGDisplayModeRelease(observed);
      /** Original observed mode metadata remains available in the owned helper log on readiness failure. */
      NSData *const ready = [NSJSONSerialization dataWithJSONObject:observation options:0 error:nil];
      fwrite(ready.bytes, 1, ready.length, stdout);fputc('\n', stdout);fflush(stdout);
      if ([observation[@"width"] unsignedIntValue] != width || [observation[@"height"] unsignedIntValue] != height ||
          [observation[@"pixelWidth"] unsignedIntValue] != width || [observation[@"pixelHeight"] unsignedIntValue] != height) return 21;
      /** The owner sees readiness only after independent actual window-server verification. */
      if (![ready writeToFile:[directory stringByAppendingPathComponent:@"ready.json"] atomically:YES]) return 22;
      /** This private marker belongs to the invocation whose nonce appears in the ready record. */
      NSString *const stop = [directory stringByAppendingPathComponent:@"stop"];
      /** An independent lifetime cap prevents orphaned native displays when a CI job is interrupted. */
      NSDate *const lifetimeDeadline = [NSDate dateWithTimeIntervalSinceNow:90 * 60];
      while (![[NSFileManager defaultManager] fileExistsAtPath:stop] && [lifetimeDeadline timeIntervalSinceNow] > 0)
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.25]];
    return 0;
  }
}
