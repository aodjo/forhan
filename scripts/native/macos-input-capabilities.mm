#import <Foundation/Foundation.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <CoreGraphics/CoreGraphics.h>

/**
 * Read one original native input-source string without resolving or changing its selection.
 *
 * Missing or differently typed native properties remain explicit JSON null values.
 * @param {TISInputSourceRef} source - Original observed native input source, possibly null.
 * @param {CFStringRef} property - Exact original Text Input Source property identifier.
 * @returns {id} Copied original string or NSNull when the source does not provide it.
 * @example
 * sourceString(current,kTISPropertyInputSourceID);
 */
static id sourceString(TISInputSourceRef source,CFStringRef property){
  if(!source)return [NSNull null];
  /** Borrowed original property bytes are copied before their owning source is released. */
  CFTypeRef const value=TISGetInputSourceProperty(source,property);
  return value&&CFGetTypeID(value)==CFStringGetTypeID()?[(__bridge NSString*)value copy]:[NSNull null];
}

/**
 * Read one original native input-source Boolean without coercing missing properties.
 *
 * Availability and false remain distinct in the retained capability observation.
 * @param {TISInputSourceRef} source - Original observed native input source, possibly null.
 * @param {CFStringRef} property - Exact original Boolean Text Input Source property identifier.
 * @returns {id} Original native Boolean or NSNull if unavailable.
 * @example
 * sourceBoolean(current,kTISPropertyInputSourceIsEnabled);
 */
static id sourceBoolean(TISInputSourceRef source,CFStringRef property){
  if(!source)return [NSNull null];
  /** The native Boolean type is verified before its value can become JSON evidence. */
  CFTypeRef const value=TISGetInputSourceProperty(source,property);
  return value&&CFGetTypeID(value)==CFBooleanGetTypeID()?@((bool)CFBooleanGetValue((CFBooleanRef)value)):[NSNull null];
}

/**
 * Describe an actual native input source without enabling, selecting or executing it.
 *
 * Only immutable original identifiers and capability properties are observed.
 * @param {TISInputSourceRef} source - Actual native input source, possibly null.
 * @returns {NSDictionary*} Original source identity and explicit available native capability values.
 * @example
 * describeSource(TISCopyCurrentKeyboardInputSource());
 */
static NSDictionary* describeSource(TISInputSourceRef source){
  return @{ @"available":@(source!=NULL),@"id":sourceString(source,kTISPropertyInputSourceID),@"category":sourceString(source,kTISPropertyInputSourceCategory),@"enabled":sourceBoolean(source,kTISPropertyInputSourceIsEnabled),@"selected":sourceBoolean(source,kTISPropertyInputSourceIsSelected),@"selectCapable":sourceBoolean(source,kTISPropertyInputSourceIsSelectCapable),@"asciiCapable":sourceBoolean(source,kTISPropertyInputSourceIsASCIICapable) };
}

/**
 * Observe native Mac input capabilities without posting events or requesting permissions.
 *
 * The helper only reads preflight permission verdicts and installed Korean source
 * metadata. A positive preflight is not treated as proof of successful native input.
 * @returns {int} Zero after complete JSON output, otherwise a serialization failure.
 * @example
 * // Compiled and executed only by the owned macOS capability CI job.
 */
int main(void){
  @autoreleasepool{
    /** Retained native source objects are released after copied observation metadata is assembled. */
    TISInputSourceRef const current=TISCopyCurrentKeyboardInputSource();
    /** All installed input sources are enumerated without enabling any disabled source. */
    CFArrayRef const sources=TISCreateInputSourceList(NULL,true);
    /** Only installed Korean source identifiers enter the bounded input capability report. */
    NSMutableArray* const korean=[NSMutableArray array];
    if(sources)for(CFIndex index=0;index<CFArrayGetCount(sources);index++){
      /** Each original source remains borrowed from its retained immutable native array. */
      TISInputSourceRef const source=(TISInputSourceRef)CFArrayGetValueAtIndex(sources,index);
      /** A typed original source identifier determines inclusion without inventing a known Korean mode ID. */
      id const identifier=sourceString(source,kTISPropertyInputSourceID);
      if([identifier isKindOfClass:[NSString class]]&&[(NSString*)identifier rangeOfString:@"Korean" options:NSCaseInsensitiveSearch].location!=NSNotFound)[korean addObject:describeSource(source)];
    }
#if defined(__arm64__)
    /** Actual native compiler architecture is independently observed from the Node runner. */
    NSString* const architecture=@"arm64";
#elif defined(__x86_64__)
    /** Actual native compiler architecture is independently observed from the Node runner. */
    NSString* const architecture=@"x64";
#else
#error Unsupported native capability architecture
#endif
    /** Permission/source observations do not constitute an actual Forhan typing regression. */
    NSDictionary* const observation=@{ @"kind":@"read-only-native-macos-input-capabilities",@"arch":architecture,@"osVersion":[NSProcessInfo processInfo].operatingSystemVersionString,@"accessibilityTrusted":@((bool)AXIsProcessTrusted()),@"postEventsAllowed":@((bool)CGPreflightPostEventAccess()),@"listenEventsAllowed":@((bool)CGPreflightListenEventAccess()),@"currentInputSource":describeSource(current),@"sourceEnumerationAvailable":@(sources!=NULL),@"installedSourceCount":@(sources?CFArrayGetCount(sources):0),@"koreanSources":korean,@"eventsPosted":@0,@"inputSourcesChanged":@0,@"permissionsRequested":@NO,@"targetApplicationLaunched":@NO,@"nativeTypingVerified":@NO };
    if(current)CFRelease(current);if(sources)CFRelease(sources);
    NSError* error=nil;
    /** Actual original JSON is written without synthesizing a successful permission or source result. */
    NSData* const bytes=[NSJSONSerialization dataWithJSONObject:observation options:NSJSONWritingPrettyPrinted error:&error];
    if(!bytes){fprintf(stderr,"Native capability JSON serialization failed.\n");return 1;}
    if(fwrite(bytes.bytes,1,bytes.length,stdout)!=bytes.length)return 1;
    fputc('\n',stdout);return 0;
  }
}
