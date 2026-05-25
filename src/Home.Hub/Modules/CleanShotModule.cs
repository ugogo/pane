using CleanShot.Core.Services;
using CleanShotW.Helpers;
using CleanShotW.Services;
using Home.Core;
using Home.Windows;
using Microsoft.UI.Dispatching;
using WinRT.Interop;

namespace Home.Hub.Modules;

public sealed class CleanShotModule : IHomeModule, IDisposable
{
    private readonly DispatcherQueue _dispatcher;
    private readonly GlobalHotkeyCoordinator _hotkeyCoordinator;
    private CaptureCoordinator? _coordinator;
    private HotkeyService? _hotkeyService;
    private IntPtr _messageWindowHandle;

    public CleanShotModule(DispatcherQueue dispatcher, GlobalHotkeyCoordinator hotkeyCoordinator)
    {
        _dispatcher = dispatcher;
        _hotkeyCoordinator = hotkeyCoordinator;
    }

    public string Id => HomeServiceCollectionExtensions.CleanShotModuleId;

    public string DisplayName => "CleanShot";

    public string Description => "Premium screenshot capture with global hotkeys.";

    public bool IsEnabled { get; private set; }

    public ModuleStatus Status { get; private set; } = ModuleStatus.Disabled;

    public Type? SettingsPageType => null;

    public CaptureCoordinator? Coordinator => _coordinator;

    public bool TryApplyHotkeys(string fullScreenShortcut, string regionShortcut, out string error)
    {
        if (_coordinator is null)
        {
            error = "Enable CleanShot first.";
            return false;
        }

        var applied = _coordinator.TryApplyHotkeys(fullScreenShortcut, regionShortcut, out error);
        if (applied)
        {
            ReregisterHotkeys();
        }

        return applied;
    }

    public void AttachMessageWindow(IntPtr hwnd)
    {
        _messageWindowHandle = hwnd;
    }

    public Task EnableAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        AppSettingsService.LoadSettings();
        SaveService.Initialize(AppSettingsService.SaveFolder);

        _coordinator = new CaptureCoordinator(_dispatcher);
        _coordinator.ApplyHotkeys = RegisterHotkeys;

        if (_messageWindowHandle != IntPtr.Zero)
        {
            RegisterHotkeys();
        }

        IsEnabled = true;
        Status = ModuleStatus.Running("Hotkeys active");
        return Task.CompletedTask;
    }

    public Task DisableAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _hotkeyCoordinator.UnregisterOwner(Id);
        _hotkeyService?.Dispose();
        _hotkeyService = null;
        _coordinator = null;
        IsEnabled = false;
        Status = ModuleStatus.Disabled;
        return Task.CompletedTask;
    }

    public bool TryHandleHotkeyMessage(int message, IntPtr wParam) =>
        _hotkeyService?.TryHandleMessage(message, wParam) ?? false;

    public void ReregisterHotkeys()
    {
        if (IsEnabled)
        {
            RegisterHotkeys();
        }
    }

    public void Dispose()
    {
        _hotkeyCoordinator.UnregisterOwner(Id);
        _hotkeyService?.Dispose();
        _hotkeyService = null;
    }

    private bool RegisterHotkeys()
    {
        if (_messageWindowHandle == IntPtr.Zero || _coordinator is null)
        {
            return false;
        }

        _hotkeyCoordinator.UnregisterOwner(Id);

        foreach (var binding in HotkeyService.BuildBindingsForTests())
        {
            _hotkeyCoordinator.TryRegister(Id, binding.Id, binding.Modifiers, binding.VirtualKey, out _);
        }

        _hotkeyService?.Dispose();
        _hotkeyService = new HotkeyService(_messageWindowHandle);
        _hotkeyService.HotkeyPressed += hotkeyId =>
        {
            switch (hotkeyId)
            {
                case HotkeyService.HotkeyFullScreen:
                    _coordinator?.BeginFullScreenCapture();
                    break;
                case HotkeyService.HotkeyRegion:
                    _coordinator?.BeginRegionCapture();
                    break;
            }
        };

        return _hotkeyService.Register();
    }
}
