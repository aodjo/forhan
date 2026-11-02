#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <libproc.h>
#import <unistd.h>

/**
 * Allow native input services to process events for a complete bounded interval.
 *
 * A command-line process can have no active run-loop sources. The monotonic
 * deadline still preserves the requested pacing when a run-loop iteration exits early.
 * @param {double} seconds - Positive bounded native settling interval.
 * @returns {void} Completes after the entire interval has elapsed.
 * @example
 * settle(0.07); // Seventy milliseconds between physical key pairs.
 */
static void settle(double seconds){
  /** Native elapsed uptime avoids wall-clock adjustments while input services settle. */
  double const deadline=NSProcessInfo.processInfo.systemUptime+seconds;
  while(NSProcessInfo.processInfo.systemUptime<deadline){
    CFRunLoopRunInMode(kCFRunLoopDefaultMode,MIN(0.01,deadline-NSProcessInfo.processInfo.systemUptime),false);
    usleep(1000);
  }
}

/**
 * Read the original selected input source identifier without changing it.
 *
 * The copied string remains valid after the retained native source is released.
 * @param {TISInputSourceRef} source - Actual installed input source.
 * @returns {NSString*} Original source identifier, or an empty string if absent.
 * @example
 * identifier(TISCopyCurrentKeyboardInputSource());
 */
static NSString* identifier(TISInputSourceRef source){
  if(!source)return @"";
  /** Source properties remain borrowed until their owning native reference is released. */
  CFTypeRef const value=TISGetInputSourceProperty(source,kTISPropertyInputSourceID);
  return value&&CFGetTypeID(value)==CFStringGetTypeID()?[(__bridge NSString*)value copy]:@"";
}

/**
 * Observe whether an installed source is currently enabled.
 *
 * Missing or incorrectly typed metadata cannot authorize a keyboard operation.
 * @param {TISInputSourceRef} source - Actual native source.
 * @returns {bool} Whether its actual enabled property is true.
 * @example
 * enabled(source); // No configuration is changed.
 */
static bool enabled(TISInputSourceRef source){
  /** Only an original native Boolean can establish enabled state. */
  CFTypeRef const value=TISGetInputSourceProperty(source,kTISPropertyInputSourceIsEnabled);
  return value&&CFGetTypeID(value)==CFBooleanGetTypeID()&&CFBooleanGetValue((CFBooleanRef)value);
}

/**
 * Require the exact test-owned native application to remain frontmost.
 *
 * PID, executable, bundle path and native registration are independently checked
 * before every key pair; no window in another application receives input.
 * @param {pid_t} pid - Actual process launched by the calling test.
 * @param {NSString*} executable - Exact selected packaged executable.
 * @param {NSString*} bundle - Exact selected application bundle.
 * @returns {void} Completes only while the original owned application is frontmost.
 * @throws {NSException} If native ownership or foreground identity differs.
 * @example
 * requireOwner(pid,executable,bundle);
 */
static void requireOwner(pid_t pid,NSString* executable,NSString* bundle){
  /** Native process identity is read afresh rather than inferred from a supplied filename. */
  NSRunningApplication* const application=[NSRunningApplication runningApplicationWithProcessIdentifier:pid];
  char buffer[PROC_PIDPATHINFO_MAXSIZE]={0};
  if(!application||application.terminated||proc_pidpath(pid,buffer,sizeof(buffer))<=0||
     ![[[NSString stringWithUTF8String:buffer] stringByResolvingSymlinksInPath] isEqualToString:executable]||
     ![[application.bundleURL.path stringByResolvingSymlinksInPath] isEqualToString:bundle]||
     ![application.bundleIdentifier isEqualToString:@"org.forhan.editor"]||
     NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier!=pid)
    @throw [NSException exceptionWithName:@"OwnedInputTargetUnavailable" reason:@"The exact owned Forhan application is not frontmost." userInfo:nil];
  /** Duplicate registrations prevent an input-source change from ambiguously targeting another editor. */
  NSArray<NSRunningApplication*>* const registrations=[NSRunningApplication runningApplicationsWithBundleIdentifier:application.bundleIdentifier];
  if(registrations.count!=1||registrations.firstObject.processIdentifier!=pid)
    @throw [NSException exceptionWithName:@"AmbiguousInputTarget" reason:@"More than one native application owns this bundle identity." userInfo:nil];
}

/**
 * Send physical virtual keys through the actual installed Apple Korean input method.
 *
 * This CI-only helper accepts one bounded request on stdin. It changes only the
 * selected source and sources it explicitly enables, restores their prior state
 * in finally, and never sets Unicode event text or writes document content.
 * @returns {int} Zero only when input and exact input-source restoration both succeed.
 * @throws {NSException} Native request and ownership failures are retained in the JSON report.
 * @example
 * // The TypeScript native gate supplies actual PID, bundle, executable and virtual keys.
 */
int main(void){
  @autoreleasepool{
    /** Original native outcomes remain available even when input or restoration fails. */
    NSMutableDictionary* const report=[@{@"kind":@"actual-macos-korean-virtual-key-input",@"eventsPosted":@0,@"permissionsRequested":@NO,@"unicodeTextInjected":@NO,@"restored":@NO,@"success":@NO} mutableCopy];
    /** Every retained source is restored before its native object is released. */
    TISInputSourceRef const original=TISCopyCurrentKeyboardInputSource();
    CFArrayRef const sources=TISCreateInputSourceList(NULL,true);
    /** Only sources actually enabled by this invocation may be disabled during cleanup. */
    NSMutableArray* const newlyEnabled=[NSMutableArray array];
    CGEventSourceRef eventSource=NULL;
    bool succeeded=false;
    @try{
      if(!original||!sources)@throw [NSException exceptionWithName:@"MissingInputSources" reason:@"Native input-source enumeration failed." userInfo:nil];
      report[@"originalSource"]=identifier(original);
      if(!AXIsProcessTrusted()||!CGPreflightPostEventAccess())@throw [NSException exceptionWithName:@"NativePermissionUnavailable" reason:@"The CI host has not granted native event permission." userInfo:nil];
      /** JSON input remains data and never passes through a command shell. */
      NSData* const input=[[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
      if(input.length>16384)@throw [NSException exceptionWithName:@"InvalidRequest" reason:@"The native input request exceeds its bounded size." userInfo:nil];
      NSError* error=nil;
      /** Only finite known virtual keys and an actual selected bundle can authorize native input. */
      NSDictionary* const request=[NSJSONSerialization JSONObjectWithData:input options:0 error:&error];
      if(![request isKindOfClass:[NSDictionary class]])@throw [NSException exceptionWithName:@"InvalidRequest" reason:@"Expected a native JSON request." userInfo:nil];
      /** The caller supplies the actual owned application, not the expected resulting Unicode. */
      pid_t const pid=[request[@"pid"] intValue];
      NSString* const executable=[request[@"executable"] stringByResolvingSymlinksInPath];
      NSString* const bundle=[request[@"bundle"] stringByResolvingSymlinksInPath];
      NSArray* const keys=request[@"keys"];
      NSInteger const delay=[request[@"delayMs"] integerValue];
      if(pid<=0||![executable isKindOfClass:[NSString class]]||![bundle isKindOfClass:[NSString class]]||![keys isKindOfClass:[NSArray class]]||keys.count<1||keys.count>200||delay<10||delay>100)
        @throw [NSException exceptionWithName:@"InvalidRequest" reason:@"Native owner, key count or pacing is invalid." userInfo:nil];
      /** Actual ANSI key positions select the Korean two-set input method's own composition rules. */
      NSDictionary* const codes=@{@"r":@(kVK_ANSI_R),@"k":@(kVK_ANSI_K),@"s":@(kVK_ANSI_S),@"e":@(kVK_ANSI_E),@"g":@(kVK_ANSI_G),@"m":@(kVK_ANSI_M),@"f":@(kVK_ANSI_F),@"w":@(kVK_ANSI_W),@"h":@(kVK_ANSI_H),@"q":@(kVK_ANSI_Q),@"SPACE":@(kVK_Space),@"BACKSPACE":@(kVK_Delete),@"RETURN":@(kVK_Return),@"LEFT":@(kVK_LeftArrow),@"RIGHT":@(kVK_RightArrow)};
      for(/** Every key is validated before any source state changes or input is posted. */ id const key in keys)
        if(![key isKindOfClass:[NSString class]]||!codes[key])@throw [NSException exceptionWithName:@"InvalidKey" reason:@"An unknown physical key was requested." userInfo:nil];
      requireOwner(pid,executable,bundle);
      /** The exact IDs were observed in both real Mac capability reports before this gate was written. */
      TISInputSourceRef target=NULL;
      for(CFIndex index=0;index<CFArrayGetCount(sources);index++){
        /** Only the installed Apple Korean parent and its observed two-set mode can be enabled. */
        TISInputSourceRef const source=(TISInputSourceRef)CFArrayGetValueAtIndex(sources,index);
        NSString* const name=identifier(source);
        if(![name isEqualToString:@"com.apple.inputmethod.Korean"]&&![name isEqualToString:@"com.apple.inputmethod.Korean.2SetKorean"])continue;
        if(!enabled(source)){
          /** Original status and identity are retained before interpreting a native enable result. */
          OSStatus const status=TISEnableInputSource(source);
          [newlyEnabled addObject:@{@"id":name,@"status":@(status),@"source":[NSValue valueWithPointer:source]}];
          if(status!=noErr)@throw [NSException exceptionWithName:@"EnableInputSourceFailed" reason:[NSString stringWithFormat:@"Native enable failed for %@: %d",name,(int)status] userInfo:nil];
        }
        if([name isEqualToString:@"com.apple.inputmethod.Korean.2SetKorean"])target=source;
      }
      if(!target)@throw [NSException exceptionWithName:@"KoreanInputSourceUnavailable" reason:@"The installed Apple Korean two-set source was not found." userInfo:nil];
      requireOwner(pid,executable,bundle);
      /** A native API result cannot substitute for the independently observed selected source. */
      OSStatus const selected=TISSelectInputSource(target);
      report[@"selectStatus"]=@(selected);
      settle(1.0);
      TISInputSourceRef const current=TISCopyCurrentKeyboardInputSource();
      report[@"selectedSource"]=identifier(current);
      if(current)CFRelease(current);
      if(selected!=noErr||![report[@"selectedSource"] isEqualToString:@"com.apple.inputmethod.Korean.2SetKorean"])
        @throw [NSException exceptionWithName:@"SelectInputSourceFailed" reason:@"Actual Korean input-source selection did not agree with the native request." userInfo:nil];
      report[@"ownerPid"]=@(pid);report[@"executable"]=executable;report[@"bundle"]=bundle;report[@"keys"]=keys;
      eventSource=CGEventSourceCreate(kCGEventSourceStatePrivate);
      if(!eventSource)@throw [NSException exceptionWithName:@"EventSourceUnavailable" reason:@"A native keyboard event source could not be allocated." userInfo:nil];
      for(/** Native physical key pairs never contain expected Unicode text. */ NSString* const key in keys){
        requireOwner(pid,executable,bundle);
        /** Both events are allocated before keydown so a failed allocation cannot leave a key held. */
        CGEventRef const down=CGEventCreateKeyboardEvent(eventSource,[codes[key] unsignedShortValue],true);
        CGEventRef const up=CGEventCreateKeyboardEvent(eventSource,[codes[key] unsignedShortValue],false);
        if(!down||!up){if(down)CFRelease(down);if(up)CFRelease(up);@throw [NSException exceptionWithName:@"EventAllocationFailed" reason:@"Native keyboard event allocation failed." userInfo:nil];}
        CGEventSetFlags(down,0);CGEventSetFlags(up,0);
        CGEventPost(kCGHIDEventTap,down);CGEventPost(kCGHIDEventTap,up);
        CFRelease(down);CFRelease(up);
        report[@"eventsPosted"]=@([report[@"eventsPosted"] integerValue]+2);
        settle(delay/1000.0);
      }
      settle(0.3);
      succeeded=true;
    }@catch(NSException* exception){report[@"failure"]=exception.reason?:exception.name;}
    @finally{
      if(eventSource)CFRelease(eventSource);
      /** Original selection is restored even when a source enable or foreground check failed. */
      OSStatus const restored=original?TISSelectInputSource(original):paramErr;
      settle(0.3);
      TISInputSourceRef const current=TISCopyCurrentKeyboardInputSource();
      report[@"restoreStatus"]=@(restored);report[@"restoredSource"]=identifier(current);
      if(current)CFRelease(current);
      bool cleanup=restored==noErr&&[report[@"restoredSource"] isEqualToString:report[@"originalSource"]];
      /** Cleanup only disables sources whose previously disabled state was recorded by this invocation. */
      NSMutableArray* const changes=[NSMutableArray array];
      for(NSDictionary* const item in [newlyEnabled reverseObjectEnumerator]){
        /** Native source status is observed after restoring the original selection. */
        TISInputSourceRef const source=(TISInputSourceRef)[item[@"source"] pointerValue];
        OSStatus const disabled=enabled(source)?TISDisableInputSource(source):noErr;
        bool const reverted=!enabled(source);
        [changes addObject:@{@"id":item[@"id"],@"enableStatus":item[@"status"],@"disableStatus":@(disabled),@"originalDisabledStateRestored":@(reverted)}];
        cleanup=cleanup&&disabled==noErr&&reverted;
      }
      report[@"sourceChanges"]=changes;report[@"restored"]=@(cleanup);report[@"success"]=@(succeeded&&cleanup);
      if(original)CFRelease(original);if(sources)CFRelease(sources);
    }
    /** Full original native output remains available on both successful and failed requests. */
    NSData* const output=[NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:nil];
    if(!output||fwrite(output.bytes,1,output.length,stdout)!=output.length)return 1;
    fputc('\n',stdout);return [report[@"success"] boolValue]?0:1;
  }
}
