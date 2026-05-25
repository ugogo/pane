using CleanShotW.Helpers;

namespace CleanShotW.Services;

internal sealed class HotkeyService : IDisposable
{
    public const int HotkeyFullScreen = 1;
    public const int HotkeyRegion = 2;

    private readonly IntPtr _hwnd;
    private readonly GlobalHotkeyHook _hook;
    private bool _hasActiveBindings;

    public HotkeyService(IntPtr hwnd)
    {
        _hwnd = hwnd;
        _hook = new GlobalHotkeyHook(hwnd);
    }

    public event Action<int>? HotkeyPressed;

    public bool Register()
    {
        UnregisterAll();

        var bindings = BuildBindings();
        var hookBindings = new List<HotkeyBinding>();
        _hasActiveBindings = false;

        foreach (var binding in bindings)
        {
            if (Win32Helper.RegisterHotKey(_hwnd, binding.Id, binding.Modifiers, binding.VirtualKey))
            {
                _hasActiveBindings = true;
                AppLog.Info($"Hotkey registered via API: {HotkeyParser.Format(binding.Modifiers, binding.VirtualKey)} (id {binding.Id})");
                continue;
            }

            hookBindings.Add(binding);
            AppLog.Info($"Hotkey API busy, using hook override: {HotkeyParser.Format(binding.Modifiers, binding.VirtualKey)} (id {binding.Id})");
        }

        if (hookBindings.Count > 0)
        {
            _hook.SetBindings(hookBindings);
            _hasActiveBindings = true;
        }
        else
        {
            _hook.Clear();
        }

        return _hasActiveBindings;
    }

    public bool TryHandleMessage(int message, IntPtr wParam)
    {
        if (message != Win32Helper.WmHotkey)
        {
            return false;
        }

        var hotkeyId = wParam.ToInt32();
        HotkeyPressed?.Invoke(hotkeyId);
        return true;
    }

    public void Unregister()
    {
        UnregisterAll();
    }

    private void UnregisterAll()
    {
        Win32Helper.UnregisterHotKey(_hwnd, HotkeyFullScreen);
        Win32Helper.UnregisterHotKey(_hwnd, HotkeyRegion);
        _hook.Clear();
        _hasActiveBindings = false;
    }

    internal static IReadOnlyList<HotkeyBinding> BuildBindingsForTests() => BuildBindings();

    private static List<HotkeyBinding> BuildBindings()
    {
        var bindings = new List<HotkeyBinding>(2)
        {
            new(HotkeyFullScreen, HotkeyConfiguration.FullScreenModifiers, HotkeyConfiguration.FullScreenKey),
        };

        if (!UsesSameCombo(
            HotkeyConfiguration.FullScreenModifiers,
            HotkeyConfiguration.FullScreenKey,
            HotkeyConfiguration.RegionModifiers,
            HotkeyConfiguration.RegionKey))
        {
            bindings.Add(new HotkeyBinding(
                HotkeyRegion,
                HotkeyConfiguration.RegionModifiers,
                HotkeyConfiguration.RegionKey));
        }

        return bindings;
    }

    private static bool UsesSameCombo(uint firstModifiers, uint firstKey, uint secondModifiers, uint secondKey) =>
        firstModifiers == secondModifiers && firstKey == secondKey;

    public void Dispose()
    {
        UnregisterAll();
        _hook.Dispose();
    }
}
