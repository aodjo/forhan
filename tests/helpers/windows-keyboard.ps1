param([int]$OwnerProcess,[string]$OwnerStartTicks,[string]$WindowHandle,[ValidateSet('focus','inspect','keys')][string]$Action='inspect',[string]$Keys='',[Parameter(Mandatory=$true)][string]$ExpectedExecutable,[Parameter(Mandatory=$true)][string]$ProfileDirectory)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
/** Native keyboard interop is used only by an explicit Windows IME regression. */
public static class ForhanImeNative {
 /** Exact x64 INPUT layout reserves the full native union without Unicode injection. */
 [StructLayout(LayoutKind.Explicit,Size=40)] public struct Input {
  [FieldOffset(0)] public uint Type;
  [FieldOffset(8)] public ushort Key;
  [FieldOffset(10)] public ushort Scan;
  [FieldOffset(12)] public uint Flags;
 }
 /** Native physical caret bounds are observed without redirecting input. */
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 /** Native cursor coordinates remain unchanged after an owned title-bar activation. */
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 /**
  * Activate only the verified generated application through its visible title bar.
  *
  * Requesting foreground activation targets only the verified owned frame and
  * succeeds only after actual foreground ownership agrees. Raising a background
  * frame alone does not prove that its title bar is exposed. A background
  * fixture may be exposed temporarily above other frames, restoring its exact
  * prior topmost state before return. Every click still requires exact process
  * and root-frame ownership. No foreign window receives input or a state change.
  * @param {IntPtr} window - Previously verified generated application frame.
  * @param {uint} expected - Previously verified process identifier.
  * @returns {void} Clicks only an acknowledged owned title bar and restores an unmoved cursor.
  * @throws {InvalidOperationException} If the frame, hit target or native observation differs.
  * @example
  * ForhanImeNative.FocusOwned(window, process);
  */
 public static void FocusOwned(IntPtr window,uint expected){
  uint actual;GetWindowThreadProcessId(window,out actual);
  if(actual!=expected)throw new InvalidOperationException("Owned activation process changed.");
  if(GetForegroundWindow()==window)return;
  if(SetForegroundWindow(window)){
   for(int attempt=0;attempt<20;attempt++){
    if(GetForegroundWindow()==window)return;
    System.Threading.Thread.Sleep(10);
   }
  }
  Rect bounds;Point previous;
  if(!GetWindowRect(window,out bounds)||bounds.Right-bounds.Left<200||bounds.Bottom-bounds.Top<100||!GetCursorPos(out previous))throw new InvalidOperationException("Owned frame geometry is unavailable.");
  Point target=new Point();IntPtr hit=IntPtr.Zero;bool restoreTopmost=false;
  try{
   if(!SetWindowPos(window,IntPtr.Zero,0,0,0,0,0x13))throw new InvalidOperationException("Owned frame could not be raised.");
   bool exposed=WaitOwnedTitle(window,expected,80,out bounds,out target,out hit,out actual);
   if(!exposed){
    bool originallyTopmost=(GetWindowLongPtr(window,-20).ToInt64()&8)!=0;
    if(!SetWindowPos(window,new IntPtr(-1),0,0,0,0,0x13))throw new InvalidOperationException("Owned fixture could not be temporarily exposed.");
    restoreTopmost=!originallyTopmost;
    exposed=WaitOwnedTitle(window,expected,40,out bounds,out target,out hit,out actual);
   }
   if(!exposed){
    uint foregroundProcess;GetWindowThreadProcessId(GetForegroundWindow(),out foregroundProcess);
    throw new InvalidOperationException("Owned title bar remains obstructed; no click was sent. Bounds="+bounds.Left+","+bounds.Top+","+bounds.Right+","+bounds.Bottom+"; target="+target.X+","+target.Y+"; hitProcess="+actual+"; hitRoot="+GetAncestor(hit,2).ToInt64()+"; expectedRoot="+window.ToInt64()+"; foregroundProcess="+foregroundProcess);
   }
   try{
    if(!SetCursorPos(target.X,target.Y))throw new InvalidOperationException("Owned title-bar cursor placement failed.");
    hit=WindowFromPoint(target);GetWindowThreadProcessId(hit,out actual);
    if(actual!=expected||GetAncestor(hit,2)!=window)throw new InvalidOperationException("Owned title-bar ownership changed; no click was sent.");
    mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);
    System.Threading.Thread.Sleep(80);
   }finally{Point current;if(GetCursorPos(out current)&&current.X==target.X&&current.Y==target.Y)SetCursorPos(previous.X,previous.Y);}
  }finally{
   if(restoreTopmost){
    GetWindowThreadProcessId(window,out actual);
    if(actual==expected){
     if(!SetWindowPos(window,new IntPtr(-2),0,0,0,0,0x13)||(GetWindowLongPtr(window,-20).ToInt64()&8)!=0)throw new InvalidOperationException("Owned fixture topmost state was not restored.");
    }else if(actual!=0)throw new InvalidOperationException("Owned fixture identity changed before restoring stacking state.");
   }
  }
 }
 /**
  * Wait for the exact original title-bar point to belong to the owned frame.
  *
  * Bounds and both process/root hit ownership are re-read on every observation.
  * No pointer, keyboard, application or foreign-window state changes here.
  * @param {IntPtr} window - Exact original isolated application frame.
  * @param {uint} expected - Original verified native process identifier.
  * @param {int} attempts - Maximum bounded25ms observation count.
  * @param {Rect} bounds - Receives actual original frame bounds.
  * @param {Point} target - Receives actual title-bar activation coordinates.
  * @param {IntPtr} hit - Receives actual window beneath the activation point.
  * @param {uint} actual - Receives actual hit-window process ownership.
  * @returns {bool} Whether the exact native hit acknowledges original ownership.
  * @throws {InvalidOperationException} If original frame ownership or geometry disappears.
  * @example
  * // FocusOwned never clicks until this original native observation succeeds.
  */
 private static bool WaitOwnedTitle(IntPtr window,uint expected,int attempts,out Rect bounds,out Point target,out IntPtr hit,out uint actual){
  bounds=new Rect();target=new Point();hit=IntPtr.Zero;actual=0;
  for(int attempt=0;attempt<attempts;attempt++){
   uint owner;GetWindowThreadProcessId(window,out owner);
   if(owner!=expected)throw new InvalidOperationException("Owned activation process changed while awaiting native exposure.");
   if(!GetWindowRect(window,out bounds))throw new InvalidOperationException("Owned frame geometry disappeared while awaiting native exposure.");
   target=new Point{X=bounds.Left+(bounds.Right-bounds.Left)/2,Y=bounds.Top+12};
   hit=WindowFromPoint(target);GetWindowThreadProcessId(hit,out actual);
   if(actual==expected&&GetAncestor(hit,2)==window)return true;
   System.Threading.Thread.Sleep(25);
  }
  return false;
 }
 /**
  * Read actual owned frame bounds.
  *
  * The caller rejects missing or implausible geometry before activation.
  * @param {IntPtr} window - Verified frame handle.
  * @param {Rect} bounds - Receives original screen coordinates.
  * @returns {bool} Whether the frame bounds were observed.
  * @example
  * ForhanImeNative.GetWindowRect(window,out bounds);
  */
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window,out Rect bounds);
 /**
  * Request foreground activation for the exact verified owned application.
  *
  * Windows may deny activation. The caller still observes actual foreground
  * ownership and retains its exact guarded owned-title-bar fallback.
  * @param {IntPtr} window - Previously verified isolated application frame.
  * @returns {bool} Whether Windows accepted the foreground request.
  * @example
  * ForhanImeNative.SetForegroundWindow(window); // Observe GetForegroundWindow before accepting focus.
  */
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
 /**
  * Read only the original owned frame's extended window styles.
  *
  * The topmost bit is retained before temporary exposure and independently
  * rechecked after restoring this same isolated application frame.
  * @param {IntPtr} window - Exact original verified owned frame.
  * @param {int} index - Extended-style slotGWL_EXSTYLE, always negative20.
  * @returns {IntPtr} Original native extended-style flags.
  * @example
  * (ForhanImeNative.GetWindowLongPtr(window,-20).ToInt64()&8)!=0; // Actual original topmost state.
  */
 [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr window,int index);
 /**
  * Raise the owned frame without changing size, position or activation.
  *
  * Normal raising and temporary owned topmost exposure both preserve frame
  * geometry and avoid requesting activation. Any temporary topmost state is
  * restored before the caller accepts keyboard ownership.
  * @param {IntPtr} window - Verified generated frame.
  * @param {IntPtr} after - Requested native stacking position.
  * @param {int} x - Unused horizontal coordinate.
  * @param {int} y - Unused vertical coordinate.
  * @param {int} width - Unused frame width.
  * @param {int} height - Unused frame height.
  * @param {uint} flags - Native no-move, no-size and no-activate flags.
  * @returns {bool} Whether native stacking succeeded.
  * @example
  * ForhanImeNative.SetWindowPos(window,IntPtr.Zero,0,0,0,0,0x13);
  */
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
 /**
  * Observe the window under an activation point.
  *
  * A click is allowed only when both native process and root frame match.
  * @param {Point} point - Actual physical screen point.
  * @returns {IntPtr} Window owning that point.
  * @example
  * ForhanImeNative.WindowFromPoint(point);
  */
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 /**
  * Observe the root frame of an actual hit target.
  *
  * Child controls cannot redirect activation into another root window.
  * @param {IntPtr} window - Actual hit window.
  * @param {uint} flags - Native ancestor mode, always GA_ROOT here.
  * @returns {IntPtr} Observed root frame.
  * @example
  * ForhanImeNative.GetAncestor(hit,2);
  */
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window,uint flags);
 /**
  * Read the cursor before an owned activation.
  *
  * Original coordinates are restored after the bounded mouse dispatch.
  * @param {Point} point - Receives original physical coordinates.
  * @returns {bool} Whether the cursor position was observed.
  * @example
  * ForhanImeNative.GetCursorPos(out point);
  */
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
 /**
  * Move the cursor to an independently verified owned title bar or its saved position.
  *
  * No unverified control or unrelated application receives an activation click.
  * @param {int} x - Physical horizontal screen coordinate.
  * @param {int} y - Physical vertical screen coordinate.
  * @returns {bool} Whether the cursor movement succeeded.
  * @example
  * ForhanImeNative.SetCursorPos(point.X,point.Y);
  */
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 /**
  * Send the balanced mouse activation after native hit ownership is verified.
  *
  * Only one left-button down and up pair is submitted; keyboard text is never injected.
  * @param {uint} flags - Native left-button transition.
  * @param {uint} x - Unused relative horizontal coordinate.
  * @param {uint} y - Unused relative vertical coordinate.
  * @param {uint} data - Unused wheel data.
  * @param {UIntPtr} extra - Empty caller data.
  * @returns {void} Submits one native mouse transition.
  * @example
  * // FocusOwned submits both transitions before restoring the pointer.
  */
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 /** Native GUI-thread information establishes the actual owned focus window. */
 [StructLayout(LayoutKind.Sequential)] public struct Gui {public uint Size,Flags;public IntPtr Active,Focus,Capture,MenuOwner,MoveSize,Caret;public Rect Bounds;}
 /**
 * Observe the actual foreground window.
 *
 * This read-only Win32 call cannot move focus or activate an unrelated window.
 * @returns {IntPtr} Current foreground native handle or zero.
 * @example
 * ForhanImeNative.GetForegroundWindow();
 */
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 /**
 * Read the native window owner.
 *
 * The exact process and GUI thread establish input ownership before any key is sent.
 * @param {IntPtr} window - Explicit native application or focus window.
 * @param {uint} process - Receives the actual owning process identifier.
 * @returns {uint} Actual GUI thread identifier, or zero for an invalid handle.
 * @example
 * ForhanImeNative.GetWindowThreadProcessId(window, out process);
 */
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
 /**
 * Read the installed input layouts.
 *
 * This observation enumerates current layouts without loading a layout or changing system preferences.
 * @param {int} count - Maximum number of handles accepted by the buffer.
 * @param {IntPtr[]} layouts - Receives installed native layout handles.
 * @returns {int} Copied layout count or the required count when the buffer size is zero.
 * @example
 * ForhanImeNative.GetKeyboardLayoutList(0, null);
 */
 [DllImport("user32.dll")] public static extern int GetKeyboardLayoutList(int count,[Out] IntPtr[] layouts);
 /**
 * Read the selected thread input layout.
 *
 * The owning GUI thread is inspected independently of the helper thread and global preferences.
 * @param {uint} thread - Actual GUI thread belonging to the selected application.
 * @returns {IntPtr} Active input layout handle for the observed thread.
 * @example
 * ForhanImeNative.GetKeyboardLayout(thread);
 */
 [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint thread);
 /**
 * Observe input focus in one GUI thread.
 *
 * Only a previously verified application thread is queried; the call never redirects input.
 * @param {uint} thread - Actual owned GUI thread.
 * @param {Gui} info - Initialized structure receiving native focus and caret information.
 * @returns {bool} Whether the actual thread information was available.
 * @example
 * ForhanImeNative.GetGUIThreadInfo(thread, ref info);
 */
 [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint thread,ref Gui info);
 /**
 * Read the compatibility IME window.
 *
 * The input focus belongs to the selected application. This query does not set conversion or open state.
 * @param {IntPtr} window - Verified native input focus window.
 * @returns {IntPtr} Default compatibility IME handle or zero.
 * @example
 * ForhanImeNative.ImmGetDefaultIMEWnd(focus);
 */
 [DllImport("imm32.dll")] public static extern IntPtr ImmGetDefaultIMEWnd(IntPtr window);
 /**
 * Bound a native IME status observation.
 *
 * The only caller reads open status with a one-second deadline; no unbounded native message is sent.
 * @param {IntPtr} window - Verified compatibility IME window.
 * @param {uint} message - Native read-only status message identifier.
 * @param {UIntPtr} word - IME query identifier.
 * @param {IntPtr} value - Query-specific argument.
 * @param {uint} flags - Native timeout behavior.
 * @param {uint} timeout - Maximum wait in milliseconds.
 * @param {UIntPtr} result - Receives the original native response.
 * @returns {IntPtr} Nonzero when the original native query completed.
 * @example
 * ForhanImeNative.SendMessageTimeout(window, 0x0283, new UIntPtr(5), IntPtr.Zero, 2, 1000, out result);
 */
 [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr window,uint message,UIntPtr word,IntPtr value,uint flags,uint timeout,out UIntPtr result);
 /**
 * Submit balanced native keyboard transitions.
 *
 * The caller uses virtual keys processed by the installed input method. Completed Unicode text and DOM events are never injected.
 * @param {uint} count - Number of native transitions in the request.
 * @param {Input[]} inputs - Original ordered key-down and key-up structures.
 * @param {int} size - Exact x64 native structure size.
 * @returns {uint} Number of native transitions actually accepted.
 * @example
 * ForhanImeNative.SendInput((uint)inputs.Length, inputs, 40);
 */
 [DllImport("user32.dll",SetLastError=true)] public static extern uint SendInput(uint count,Input[] inputs,int size);
 /**
 * Observe a physical modifier state.
 *
 * Held user modifiers cause the entire request to stop before synthesized input is submitted.
 * @param {int} key - Modifier virtual-key identifier.
 * @returns {short} Original native key state with the high bit indicating a held key.
 * @example
 * ForhanImeNative.GetAsyncKeyState(0x11);
 */
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
 /**
 * Resolve a native virtual key.
 *
 * The original keyboard mapping supplies the scan code while the virtual key retains its operating-system meaning.
 * @param {uint} key - Native virtual-key identifier.
 * @param {uint} map - Native mapping mode.
 * @returns {uint} Original mapped scan code.
 * @example
 * ForhanImeNative.MapVirtualKey(key, 0);
 */
 [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint key,uint map);
 /**
  * Send one native virtual key with matched down and up transitions.
  *
  * This x64-only observer never injects completed Unicode characters. Every
  * physical key is released in the same atomic native input request.
  * @param {ushort} key - Physical Windows virtual key.
  * @returns {void} Inserts both actual native keyboard transitions.
  * @throws {InvalidOperationException} If the host ABI or native injection fails.
  * @example
  * ForhanImeNative.Press(0x52); // Physical R key, interpreted by the active IME.
  */
 public static void Press(ushort key){PressChord(new ushort[]{key});}
 /**
  * Send a complete native chord as one balanced operating-system input batch.
  *
  * Modifier presses and releases remain in a single ordered native request.
  * @param {ushort[]} keys - Native modifier keys followed by the final key.
  * @returns {void} Inserts every down transition and its reverse-order release.
  * @throws {InvalidOperationException} If native input is not fully accepted.
  * @example
  * ForhanImeNative.PressChord(new ushort[]{0x11,0x5a}); // Actual Ctrl+Z.
  */
 public static void PressChord(ushort[] keys){
  if(IntPtr.Size!=8)throw new InvalidOperationException("The controlled input ABI requires x64.");
  Input[] inputs=new Input[keys.Length*2];
  for(int index=0;index<keys.Length;index++){
   ushort key=keys[index];uint extended=key>=0x21&&key<=0x2e?1u:0u;
   Input down=new Input{Type=1,Key=key,Scan=(ushort)MapVirtualKey(key,0),Flags=extended};
   Input up=down;up.Flags|=2;inputs[index]=down;inputs[inputs.Length-index-1]=up;
  }
  if(SendInput((uint)inputs.Length,inputs,40)!=inputs.Length)throw new InvalidOperationException("Native keyboard input was rejected.");
 }
}
'@
$imeProcess=Get-Process -Id $OwnerProcess -ErrorAction Stop
if($OwnerStartTicks -and $imeProcess.StartTime.Ticks.ToString() -ne $OwnerStartTicks){throw 'Owned native process start time changed.'}
$imeDescriptor=Get-CimInstance Win32_Process -Filter ('ProcessId='+$OwnerProcess)
if(-not [string]::Equals([IO.Path]::GetFullPath($imeProcess.Path),[IO.Path]::GetFullPath($ExpectedExecutable),[StringComparison]::OrdinalIgnoreCase)){throw 'The native input executable differs from the selected application.'}
if(-not $imeDescriptor.CommandLine.Contains('--user-data-dir='+$ProfileDirectory) -and -not $imeDescriptor.CommandLine.Contains('--user-data-dir="'+$ProfileDirectory+'"')){throw 'The actual native command line does not contain the generated owned profile.'}
$imeWindow=[IntPtr]::new([long]$WindowHandle)
$imeActual=[uint32]0
$imeThread=[ForhanImeNative]::GetWindowThreadProcessId($imeWindow,[ref]$imeActual)
if($imeActual -ne $OwnerProcess -or $imeThread -eq 0){throw ('The native input target is not the owned process: expected='+$OwnerProcess+' actual='+$imeActual+' window='+$WindowHandle+' thread='+$imeThread)}
if($Action -eq 'focus'){
 foreach($imeModifier in @(0x10,0x11,0x12,0x5b,0x5c)){if(([ForhanImeNative]::GetAsyncKeyState($imeModifier) -band 0x8000) -ne 0){throw 'A physical modifier is held; owned activation is canceled.'}}
 [ForhanImeNative]::FocusOwned($imeWindow,[uint32]$OwnerProcess)
}
if([ForhanImeNative]::GetForegroundWindow() -ne $imeWindow){
 $imeForeground=[ForhanImeNative]::GetForegroundWindow();$imeForegroundProcess=[uint32]0
 [void][ForhanImeNative]::GetWindowThreadProcessId($imeForeground,[ref]$imeForegroundProcess)
 throw ('The owned application does not own foreground focus; no keys were sent. expectedWindow='+$WindowHandle+' expectedProcess='+$OwnerProcess+' foregroundWindow='+$imeForeground.ToInt64()+' foregroundProcess='+$imeForegroundProcess)
}
$imeGui=[ForhanImeNative+Gui]::new();$imeGui.Size=[Runtime.InteropServices.Marshal]::SizeOf($imeGui)
if(-not [ForhanImeNative]::GetGUIThreadInfo($imeThread,[ref]$imeGui)){throw 'The owned native focus could not be observed.'}
$imeFocusProcess=[uint32]0
[void][ForhanImeNative]::GetWindowThreadProcessId($imeGui.Focus,[ref]$imeFocusProcess)
if($imeFocusProcess -ne $OwnerProcess){throw 'The input focus is outside the owned native process.'}
$imeLayouts=[IntPtr[]]::new([ForhanImeNative]::GetKeyboardLayoutList(0,$null))
[void][ForhanImeNative]::GetKeyboardLayoutList($imeLayouts.Length,$imeLayouts)
$imeLayout=[ForhanImeNative]::GetKeyboardLayout($imeThread)
$imeDefault=[ForhanImeNative]::ImmGetDefaultIMEWnd($imeGui.Focus)
$imeOpen=[UIntPtr]::Zero
if($imeDefault -ne [IntPtr]::Zero){[void][ForhanImeNative]::SendMessageTimeout($imeDefault,0x0283,[UIntPtr]::new(5),[IntPtr]::Zero,2,1000,[ref]$imeOpen)}
if($Action -eq 'keys'){
 if(($imeLayout.ToInt64() -band 0xffff) -ne 0x0412){throw 'The owned GUI thread does not have an active Korean input layout.'}
 foreach($imeModifier in @(0x10,0x11,0x12,0x5b,0x5c)){if(([ForhanImeNative]::GetAsyncKeyState($imeModifier) -band 0x8000) -ne 0){throw 'A physical modifier is held; no owned input is allowed.'}}
 foreach($imeKey in ($Keys -split ',')){
  $imeCurrent=Get-Process -Id $OwnerProcess -ErrorAction Stop
  if($imeCurrent.StartTime.Ticks -ne $imeProcess.StartTime.Ticks -or [ForhanImeNative]::GetForegroundWindow() -ne $imeWindow){throw 'Native input ownership changed; remaining input was canceled.'}
  $imeChord=[uint16[]]@($imeKey -split '\+' | ForEach-Object { [uint16]::Parse($_,[Globalization.CultureInfo]::InvariantCulture) })
  [ForhanImeNative]::PressChord($imeChord)
  Start-Sleep -Milliseconds 35
 }
}
@{process=$OwnerProcess;startTicks=$imeProcess.StartTime.Ticks.ToString();thread=$imeThread;window=$WindowHandle;focus=$imeGui.Focus.ToInt64().ToString();layout=$imeLayout.ToInt64().ToString('x');installedLayouts=@($imeLayouts|ForEach-Object {$_.ToInt64().ToString('x')});openStatus=$imeOpen.ToUInt64();action=$Action;keys=$Keys}|ConvertTo-Json -Depth 4 -Compress
