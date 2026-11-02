#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>

/** A plain AppKit text view calibrates the native input transport independently of Electron and Forhan. */
@interface ForhanImeControl : NSObject<NSApplicationDelegate>
/** The test-owned native window must remain alive while physical input is processed. */
@property(strong) NSWindow* window;
/** Original native text and marked-text state come from this ordinary AppKit text view. */
@property(strong) NSTextView* text;
/** Only this invocation's explicit generated directory receives native observations and its stop request. */
@property(copy) NSString* directory;
/** Original real native events are passively retained without replacing their content. */
@property(strong) NSMutableArray* events;
@end

@implementation ForhanImeControl
/**
 * Present a test-owned ordinary native text editor for independent input calibration.
 *
 * No Forhan source or Chromium input handling participates in this native control.
 * @param {NSNotification*} notification - Original native application launch notification.
 * @returns {void} Shows and focuses the ordinary native text view.
 * @example
 * // NSApplication invokes this delegate during the actual control application's launch.
 */
-(void)applicationDidFinishLaunching:(NSNotification*)notification{
  self.events=[NSMutableArray array];
  self.window=[[NSWindow alloc] initWithContentRect:NSMakeRect(200,200,640,240) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable backing:NSBackingStoreBuffered defer:NO];
  self.window.title=@"Forhan owned native IME calibration";
  self.text=[[NSTextView alloc] initWithFrame:self.window.contentView.bounds];
  self.text.richText=NO;self.window.contentView=self.text;
  [self.window makeKeyAndOrderFront:nil];[self.window makeFirstResponder:self.text];
  [NSApp activateIgnoringOtherApps:YES];
  [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:
    /**
     * Retain original native key metadata without intercepting or changing input.
     *
     * Returning the original event preserves AppKit's own IME processing.
     * @param {NSEvent*} event - Actual received native event.
     * @returns {NSEvent*} The unchanged original event.
     * @example
     * // Completed Unicode is never supplied by the calibration observer.
     */
    ^NSEvent*(NSEvent* event){[self.events addObject:@{@"keyCode":@(event.keyCode),@"characters":event.characters?:@""}];return event;}
  ];
  [NSTimer scheduledTimerWithTimeInterval:0.1 target:self selector:@selector(observe:) userInfo:nil repeats:YES];
  [self observe:nil];
}

/**
 * Retain real native text, selected context and source state without mutating input.
 *
 * A generated stop file requests ordinary termination of this owned control app.
 * @param {NSTimer*} timer - Actual periodic native observation timer, optionally nil at startup.
 * @returns {void} Writes the original observation or performs the requested normal exit.
 * @example
 * // The parent reads this original report after the guarded physical key request.
 */
-(void)observe:(NSTimer*)timer{
  if([[NSFileManager defaultManager] fileExistsAtPath:[self.directory stringByAppendingPathComponent:@"stop"]]){[NSApp terminate:nil];return;}
  /** Actual AppKit context metadata is observed inside the application receiving physical input. */
  NSDictionary* const report=@{@"kind":@"actual-owned-appkit-ime-control",@"pid":@(NSProcessInfo.processInfo.processIdentifier),@"text":self.text.string,@"marked":@(self.text.hasMarkedText),@"contextSource":self.text.inputContext.selectedKeyboardInputSource?:[NSNull null],@"frontmost":@(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier==NSProcessInfo.processInfo.processIdentifier),@"events":self.events};
  /** Atomic replacement prevents a parent read from accepting partially serialized native state. */
  NSData* const bytes=[NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:nil];
  [bytes writeToFile:[self.directory stringByAppendingPathComponent:@"control-state.json"] atomically:YES];
}
@end

/**
 * Execute an isolated ordinary native text control on a CI-owned Mac.
 *
 * The only argument is its generated evidence directory; no expected Unicode enters this application.
 * @param {int} argc - Actual argument count.
 * @param {char**} argv - Original executable and owned output directory.
 * @returns {int} Zero after ordinary native termination, otherwise invalid arguments.
 * @example
 * // The TypeScript gate launches the generated org.forhan.ime-control bundle.
 */
int main(int argc,char** argv){
  @autoreleasepool{
    if(argc!=2)return 2;
    [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    /** A retained delegate owns the actual native window through the entire normal application loop. */
    ForhanImeControl* const delegate=[ForhanImeControl new];
    delegate.directory=[NSString stringWithUTF8String:argv[1]];NSApp.delegate=delegate;
    [NSApp run];return 0;
  }
}
