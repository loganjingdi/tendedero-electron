// UIA 崩溃定位（临时调试）：
// stage 0=无UIA 1=FromHandle 2=FocusedElement 3=树遍历 4=以上全部
// stage 5=TextPattern.TryGetCurrentPattern+GetSelection+GetText（焦点元素）
// stage 6=完整 reader 逻辑（焦点 + 树遍历找 selection）
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
using System.Windows.Automation;

class UiaDbg
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);

    static void P(string m) { Console.Error.WriteLine(m); Console.Error.Flush(); }

    
    static int Main(string[] args)
    {
        int stage = args.Length > 0 ? int.Parse(args[0]) : 6;
        P("start stage=" + stage);
        try
        {
            if (stage == 0) { P("no-uia ok"); return 0; }
            IntPtr hwnd = GetForegroundWindow();
            var cls = new StringBuilder(256);
            GetClassName(hwnd, cls, cls.Capacity);
            P("hwnd=" + hwnd + " class=" + cls);
            AutomationElement root = AutomationElement.FromHandle(hwnd);
            AutomationElement f = AutomationElement.FocusedElement;
            P("focused=" + (f == null ? "(null)" : f.Current.Name));
            if (stage <= 2) return 0;
            TreeWalker walker = TreeWalker.ControlViewWalker;
            if (stage == 3) return 0;
            if (stage == 4) { P("all basic passed"); return 0; }

            // stage 5: 焦点元素上的 TextPattern
            P("trying pattern on focused");
            object pattern;
            bool has = f.TryGetCurrentPattern(TextPattern.Pattern, out pattern);
            P("pattern=" + has);
            if (!has) return 0;
            P("getselection...");
            var ranges = ((TextPattern)pattern).GetSelection();
            P("ranges=" + (ranges == null ? "null" : ranges.Length.ToString()));
            if (ranges != null && ranges.Length > 0)
            {
                P("gettext...");
                string t = ranges[0].GetText(2000);
                P("text len=" + t.Length);
            }
            if (stage == 5) return 0;

            // stage 6: 树遍历找 selection
            P("tree walk start");
            var stack = new Stack<AutomationElement>();
            stack.Push(root);
            int visited = 0;
            while (stack.Count > 0 && visited < 3000)
            {
                AutomationElement el = stack.Pop();
                visited++;
                object p2;
                if (el.TryGetCurrentPattern(TextPattern.Pattern, out p2))
                {
                    var r2 = ((TextPattern)p2).GetSelection();
                    if (r2 != null && r2.Length > 0)
                    {
                        string t2 = r2[0].GetText(2000);
                        if (!string.IsNullOrEmpty(t2)) { P("found: " + t2.Substring(0, Math.Min(50, t2.Length))); return 0; }
                    }
                }
                AutomationElement child = walker.GetFirstChild(el);
                while (child != null)
                {
                    stack.Push(child);
                    child = walker.GetNextSibling(child);
                }
            }
            P("tree walk done, nothing found, visited=" + visited);
            return 0;
        }
        catch (Exception ex)
        {
            P("CAUGHT: " + ex.GetType().FullName + ": " + ex.Message);
            return 2;
        }
    }
}
