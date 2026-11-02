#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <limits.h>
#include <math.h>

/**
 * Copy one original native accessibility property.
 *
 * Missing or inaccessible attributes remain null instead of inferred expected values.
 * @param {AXUIElementRef} element - Actual observed native application element.
 * @param {CFStringRef} name - Original public accessibility attribute name.
 * @returns {CFTypeRef} Retained original value or null; the caller releases a returned value.
 * @example
 * CFTypeRef value=attribute(window,kAXPositionAttribute);
 */
static CFTypeRef attribute(AXUIElementRef element,CFStringRef name){
  CFTypeRef value=NULL;
  return element&&AXUIElementCopyAttributeValue(element,name,&value)==kAXErrorSuccess?value:NULL;
}

/**
 * Read the actual screen-space frame of a native accessibility element.
 *
 * Both original position and size must be available before a frame is reported.
 * @param {AXUIElementRef} element - Actual owned native window or standard window button.
 * @returns {id} Original numeric frame or explicit null when native geometry is unavailable.
 * @example
 * frame(closeButton); // Reads the real native control, never a DOM imitation.
 */
static id frame(AXUIElementRef element){
  /** Retained native geometry is decoded only after its AXValue type is checked. */
  CFTypeRef const position=attribute(element,kAXPositionAttribute),size=attribute(element,kAXSizeAttribute);
  CGPoint point={0,0};CGSize dimensions={0,0};
  bool const valid=position&&size&&CFGetTypeID(position)==AXValueGetTypeID()&&CFGetTypeID(size)==AXValueGetTypeID()&&AXValueGetValue((AXValueRef)position,kAXValueCGPointType,&point)&&AXValueGetValue((AXValueRef)size,kAXValueCGSizeType,&dimensions);
  if(position)CFRelease(position);if(size)CFRelease(size);
  return valid?@{@"x":@(point.x),@"y":@(point.y),@"width":@(dimensions.width),@"height":@(dimensions.height)}:[NSNull null];
}

/**
 * Observe actual AppKit standard window buttons for an explicitly selected native process.
 *
 * Read-only accessibility and Window Server metadata establish native button
 * identity, real left-side geometry and an exact window ID for original screenshots.
 * No input, accessibility action, application mutation or permission request occurs.
 * @param {int} argc - Actual argument count.
 * @param {char**} argv - Original program and positive selected native PID.
 * @returns {int} Zero after complete native observation, otherwise an unavailable native prerequisite.
 * @example
 * // The regression supplies the actual process launched through Playwright's native application API.
 */
int main(int argc,char** argv){
  @autoreleasepool{
    if(argc!=2||!AXIsProcessTrusted())return 2;
    char* end=NULL;
    /** The exact original positive process identifier selects a read-only native observation target. */
    long const parsed=strtol(argv[1],&end,10);
    if(parsed<=0||parsed>INT_MAX||!end||*end)return 2;
    /** Native application identity remains independent from any expected renderer result. */
    pid_t const pid=(pid_t)parsed;
    NSRunningApplication* const application=[NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if(!application||application.terminated)return 3;
    /** Retained native application and main-window objects supply original accessibility metadata. */
    AXUIElementRef const native=AXUIElementCreateApplication(pid);
    CFTypeRef const window=attribute(native,kAXMainWindowAttribute);
    if(!window||CFGetTypeID(window)!=AXUIElementGetTypeID()){if(window)CFRelease(window);CFRelease(native);return 4;}
    /** Original screen-space coordinates distinguish real titlebar controls from page content. */
    id const bounds=frame((AXUIElementRef)window);
    NSMutableArray* const buttons=[NSMutableArray array];
    /** Public named standard-window attributes identify close, minimize and zoom controls. */
    CFStringRef const attributes[]={kAXCloseButtonAttribute,kAXMinimizeButtonAttribute,kAXZoomButtonAttribute};
    for(int index=0;index<3;index++){
      /** Every actual native element is independently observed and released. */
      CFTypeRef const button=attribute((AXUIElementRef)window,attributes[index]);
      NSMutableDictionary* const observation=[@{@"attribute":(__bridge NSString*)attributes[index],@"present":@(button&&CFGetTypeID(button)==AXUIElementGetTypeID())} mutableCopy];
      if([observation[@"present"] boolValue]){
        /** Original role, enabled state and actual native geometry are never supplied by the renderer. */
        CFTypeRef const role=attribute((AXUIElementRef)button,kAXRoleAttribute),enabled=attribute((AXUIElementRef)button,kAXEnabledAttribute);
        observation[@"frame"]=frame((AXUIElementRef)button);
        observation[@"role"]=role&&CFGetTypeID(role)==CFStringGetTypeID()?(__bridge NSString*)role:(id)[NSNull null];
        observation[@"enabled"]=enabled&&CFGetTypeID(enabled)==CFBooleanGetTypeID()?@((bool)CFBooleanGetValue((CFBooleanRef)enabled)):(id)[NSNull null];
        if(role)CFRelease(role);if(enabled)CFRelease(enabled);
      }
      [buttons addObject:observation];if(button)CFRelease(button);
    }
    /** Actual Window Server ownership identifies the selected native window for an unmodified screenshot. */
    NSArray* const windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly,kCGNullWindowID));
    NSMutableArray* const identifiers=[NSMutableArray array];
    if([bounds isKindOfClass:[NSDictionary class]])for(NSDictionary* const item in windows){
      if([item[(id)kCGWindowOwnerPID] intValue]!=pid||[item[(id)kCGWindowLayer] intValue]!=0)continue;
      CGRect rectangle;
      if(!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)item[(id)kCGWindowBounds],&rectangle))continue;
      if(fabs(rectangle.origin.x-[bounds[@"x"] doubleValue])<2&&fabs(rectangle.origin.y-[bounds[@"y"] doubleValue])<2&&fabs(rectangle.size.width-[bounds[@"width"] doubleValue])<2&&fabs(rectangle.size.height-[bounds[@"height"] doubleValue])<2)[identifiers addObject:item[(id)kCGWindowNumber]];
    }
    /** Complete original native output does not claim that a screenshot alone verifies control identity. */
    NSDictionary* const report=@{@"kind":@"actual-macos-standard-window-buttons",@"pid":@(pid),@"executable":application.executableURL.path?:@"",@"bundleId":application.bundleIdentifier?:@"",@"frontmost":@(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier==pid),@"window":bounds,@"buttons":buttons,@"windowIds":identifiers,@"permissionsRequested":@NO,@"eventsPosted":@0};
    CFRelease(window);CFRelease(native);
    NSData* const bytes=[NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:nil];
    if(!bytes||fwrite(bytes.bytes,1,bytes.length,stdout)!=bytes.length)return 5;
    fputc('\n',stdout);return 0;
  }
}
