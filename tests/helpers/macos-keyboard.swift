import AppKit
import Carbon
import ApplicationServices

/**
 * Read an actual input-source string property without changing system preferences.
 *
 * @param {TISInputSource} source - Native input-source object.
 * @param {CFString} key - Carbon property name.
 * @returns {String} Original property string, or an empty missing value.
 * @example sourceString(source, kTISPropertyInputSourceID)
 */
func sourceString(_ source: TISInputSource, _ key: CFString) -> String {
    guard let pointer = TISGetInputSourceProperty(source, key) else { return "" }
    return Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String
}

/**
 * Read a native input-source Boolean property without changing its enabled state.
 *
 * Parent input methods and their child modes have independent enabled flags.
 * @param {TISInputSource} source - Native parent or mode being inspected.
 * @param {CFString} key - Native Boolean property identifier.
 * @returns {Bool} Original native property, or false when absent.
 * @example sourceBoolean(source, kTISPropertyInputSourceIsEnabled)
 */
func sourceBoolean(_ source: TISInputSource, _ key: CFString) -> Bool {
    guard let pointer = TISGetInputSourceProperty(source, key) else { return false }
    return CFBooleanGetValue(Unmanaged<CFBoolean>.fromOpaque(pointer).takeUnretainedValue())
}

/** Actual host observations are written even when native event access is unavailable. */
var report: [String: Any] = ["kind": "actual-macOS-Carbon-CGEvent-keyboard", "postEventAccess": CGPreflightPostEventAccess()]
do {
    /** Structured arguments contain only an owned process, physical key codes and a key interval. */
    let arguments = CommandLine.arguments
    guard arguments.count == 5, let targetPID = Int32(arguments[1]), let delay = UInt32(arguments[3]) else {
        throw NSError(domain: "ForhanKeyboard", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected owned PID, key JSON, interval and report path."])
    }
    /** Original native input-source objects are retained through deterministic preference restoration. */
    let original = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
    /** All actual installed input modes are inspected, including disabled Korean modes. */
    let sources = TISCreateInputSourceList(nil, true).takeRetainedValue() as! [TISInputSource]
    report["originalInputSource"] = sourceString(original, kTISPropertyInputSourceID)
    report["installedInputSources"] = sources.map { sourceString($0, kTISPropertyInputSourceID) }
    /** The selected application must exist before any global keyboard state can change. */
    guard let application = NSRunningApplication(processIdentifier: targetPID) else {
        throw NSError(domain: "ForhanKeyboard", code: 2, userInfo: [NSLocalizedDescriptionKey: "The owned application is absent."])
    }
    report["pid"] = targetPID
    report["executable"] = application.executableURL?.path ?? ""
    guard CGPreflightPostEventAccess() else {
        throw NSError(domain: "ForhanKeyboard", code: 3, userInfo: [NSLocalizedDescriptionKey: "Native event-post access is unavailable; no permission prompt or synthetic input substitute was used."])
    }
    /** The actual Apple two-set mode is selected by its native identifier, never by expected output text. */
    guard let korean = sources.first(where: { sourceString($0, kTISPropertyInputSourceID) == "com.apple.inputmethod.Korean.2SetKorean" }) else {
        throw NSError(domain: "ForhanKeyboard", code: 4, userInfo: [NSLocalizedDescriptionKey: "The Apple two-set Korean input source is absent."])
    }
    /** A disabled parent prevents selecting an enabled child mode on clean macOS runners. */
    guard let parent = sources.first(where: { sourceString($0, kTISPropertyInputSourceID) == "com.apple.inputmethod.Korean" }) else {
        throw NSError(domain: "ForhanKeyboard", code: 8, userInfo: [NSLocalizedDescriptionKey: "The Apple Korean parent input method is absent."])
    }
    /** Previously disabled parent and mode sources must both return to their original enabled states. */
    let wasEnabled = sourceBoolean(korean, kTISPropertyInputSourceIsEnabled)
    let parentWasEnabled = sourceBoolean(parent, kTISPropertyInputSourceIsEnabled)
    report["modeInitiallyEnabled"] = wasEnabled
    report["parentInitiallyEnabled"] = parentWasEnabled
    defer {
        report["restoreInputSourceStatus"] = TISSelectInputSource(original)
        if !wasEnabled { report["disableTemporaryInputSourceStatus"] = TISDisableInputSource(korean) }
        if !parentWasEnabled { report["disableTemporaryParentStatus"] = TISDisableInputSource(parent) }
        report["restoredInputSource"] = sourceString(TISCopyCurrentKeyboardInputSource().takeRetainedValue(), kTISPropertyInputSourceID)
    }
    if !parentWasEnabled {
        /** Parent activation uses Carbon's normal input-source service and is restored by the owned probe. */
        let enableParent = TISEnableInputSource(parent)
        report["enableParentStatus"] = enableParent
        guard enableParent == noErr else {
            throw NSError(domain: "ForhanKeyboard", code: 9, userInfo: [NSLocalizedDescriptionKey: "The actual Korean parent input method could not be enabled."])
        }
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.2))
    }
    if !wasEnabled, TISEnableInputSource(korean) != noErr {
        throw NSError(domain: "ForhanKeyboard", code: 5, userInfo: [NSLocalizedDescriptionKey: "The actual Korean input source could not be enabled."])
    }
    application.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.3))
    /** The real Carbon status is retained before any source-selection assertion. */
    let selectStatus = TISSelectInputSource(korean)
    report["selectInputSourceStatus"] = selectStatus
    guard selectStatus == noErr else {
        throw NSError(domain: "ForhanKeyboard", code: 6, userInfo: [NSLocalizedDescriptionKey: "The actual Korean input source could not be selected."])
    }
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.3))
    report["selectedInputSource"] = sourceString(TISCopyCurrentKeyboardInputSource().takeRetainedValue(), kTISPropertyInputSourceID)
    /** Numeric physical key positions are parsed separately from the independent expected Korean source. */
    let keys = try JSONSerialization.jsonObject(with: Data(arguments[2].utf8)) as! [UInt16]
    /** Native event ownership is verified before every physical key pair. */
    var posted = 0
    for key in keys {
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == targetPID else {
            throw NSError(domain: "ForhanKeyboard", code: 7, userInfo: [NSLocalizedDescriptionKey: "The foreground application changed; keyboard dispatch stopped."])
        }
        /** Both events retain their real virtual key and pass through the system input method. */
        let down = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true)!
        let up = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: false)!
        down.post(tap: .cghidEventTap)
        usleep(2_000)
        up.post(tap: .cghidEventTap)
        posted += 1
        usleep(delay * 1_000)
    }
    report["postedKeys"] = posted
    report["completed"] = true
} catch {
    report["completed"] = false
    report["failure"] = error.localizedDescription
}
/** Only the explicitly supplied owned evidence path receives host observations. */
let bytes = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
if CommandLine.arguments.count == 5 { try bytes.write(to: URL(fileURLWithPath: CommandLine.arguments[4])) }
print(String(data: bytes, encoding: .utf8)!)
exit(report["completed"] as? Bool == true ? 0 : 1)
