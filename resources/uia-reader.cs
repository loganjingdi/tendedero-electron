// UIA 取词助手：读取前台窗口焦点元素的选中文本并打印到 stdout。
// 通过 uiautomationcore.dll 的扁平 API + 最小 COM 互操作实现。
// 注意：不能用 .NET 托管的 System.Windows.Automation 包装器——其 TextPatternRange.GetText
// 在本机对任何 provider（记事本/Edge）都会 AccessViolation（已知缺陷）。
// 由 uia-reader.js 用系统自带的 csc.exe 编译。退出码：0=读到文本 1=没有选中文本 2=异常。
using System;
using System.Text;
using System.Runtime.InteropServices;

class UiaReader
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);

    // uiautomationcore.dll 扁平 API（Win10 1803+）
    [DllImport("uiautomationcore.dll")] static extern int UiaGetFocusedElement(out IntPtr hnode);
    [DllImport("uiautomationcore.dll")] static extern int UiaElementFromHandle(IntPtr hwnd, out IntPtr hnode);
    [DllImport("uiautomationcore.dll")] static extern int UiaGetPatternProvider(IntPtr hnode, int patternId, out IntPtr phobj);
    [DllImport("uiautomationcore.dll")] static extern int UiaNodeRelease(IntPtr hnode);
    [DllImport("uiautomationcore.dll")] static extern int UiaPatternRelease(IntPtr hobj);

    const int UIA_TextPatternId = 10014;

    // COM 接口（仅用到 GetSelection / Length / GetElement / GetText 四个方法；
    // 其余方法只占 vtable 槽位，顺序必须与 uiautomationcore.idl 一致）
    [ComImport, Guid("32eba289-3583-42c9-9c59-3b6d9a1e9a6a"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IUIAutomationTextPattern
    {
        void _RangeFromPoint();   // 1
        void _RangeFromChild();   // 2
        [return: MarshalAs(UnmanagedType.Interface)]
        IUIAutomationTextRangeArray GetSelection(); // 3
    }

    [ComImport, Guid("ce4ae76a-e717-4c98-81ea-47371d028eb6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IUIAutomationTextRangeArray
    {
        int Length { get; } // 1 get_Length
        [return: MarshalAs(UnmanagedType.Interface)]
        IUIAutomationTextRange GetElement(int index); // 2
    }

    [ComImport, Guid("a543cc6a-f4ae-494b-8239-c814481187a8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IUIAutomationTextRange
    {
        void _1();  // Clone
        void _2();  // Compare
        void _3();  // CompareEndpoints
        void _4();  // ExpandToEnclosingUnit
        void _5();  // FindAttribute
        void _6();  // FindText
        void _7();  // GetAttributeValue
        void _8();  // GetBoundingRectangles
        void _9();  // GetEnclosingElement
        [return: MarshalAs(UnmanagedType.BStr)]
        string GetText(int maxLength); // 10
        void _11(); // Move
        void _12(); // MoveEndpointByUnit
        void _13(); // MoveEndpointByRange
        void _14(); // Select
        void _15(); // AddToSelection
        void _16(); // RemoveFromSelection
        void _17(); // ScrollIntoView
        void _18(); // GetChildren
        void _19(); // ShowContextMenu
    }

    static void Dbg(string m) { Console.Error.WriteLine("[uia] " + m); Console.Error.Flush(); }

    [STAThread]
    static int Main()
    {
        try
        {
            Console.OutputEncoding = Encoding.UTF8;
            IntPtr hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return 1;

            // 控制台/Windows Terminal 的 UIA provider 有已知 bug，直接跳过交给 OCR
            var cls = new StringBuilder(256);
            GetClassName(hwnd, cls, cls.Capacity);
            string className = cls.ToString();
            Dbg("hwnd=" + hwnd + " class=" + className);
            if (className == "ConsoleWindowClass" || className == "CASCADIA_HOSTING_WINDOW_CLASS") return 1;

            // 焦点元素优先；拿不到退回整个前台窗口的根元素
            IntPtr node;
            if (UiaGetFocusedElement(out node) != 0 || node == IntPtr.Zero)
            {
                Dbg("focused 失败，退回根元素");
                if (UiaElementFromHandle(hwnd, out node) != 0 || node == IntPtr.Zero) return 1;
            }

            IntPtr pat;
            int hr = UiaGetPatternProvider(node, UIA_TextPatternId, out pat);
            UiaNodeRelease(node);
            if (hr != 0 || pat == IntPtr.Zero)
            {
                Dbg("无 TextPattern, hr=" + hr);
                return 1;
            }

            string result = null;
            try
            {
                var tp = (IUIAutomationTextPattern)Marshal.GetObjectForIUnknown(pat);
                var ranges = tp.GetSelection();
                int count = ranges == null ? -1 : ranges.Length;
                Dbg("selection ranges=" + count);
                if (ranges != null)
                {
                    var sb = new StringBuilder();
                    for (int i = 0; i < count; i++)
                    {
                        var r = ranges.GetElement(i);
                        string t = null;
                        try { t = r.GetText(2000); } catch { /* 单个 range 失败继续下一个 */ }
                        Dbg("range " + i + " textlen=" + (t == null ? -1 : t.Length));
                        if (!string.IsNullOrEmpty(t)) sb.Append(t).Append('\n');
                    }
                    string all = sb.ToString().Trim();
                    if (all.Length > 0) result = all;
                }
            }
            catch { /* 模式调用失败 → 交给 OCR */ }
            UiaPatternRelease(pat);

            if (result != null) { Console.Write(result); return 0; }
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 2;
        }
    }
}
