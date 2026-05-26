using CleanShot.Core.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using Home.Core;
using Home.Core.Modules;
using Home.Hub.Modules;
using Home.Hub.Navigation;
using Home.Windows;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Home.Hub.ViewModels;

public sealed partial class MainViewModel : ObservableObject
{
    private readonly ModuleRegistry _registry;
    private readonly GlobalHotkeyCoordinator _hotkeyCoordinator;
    private readonly CleanShotModule _cleanShotModule;
    private HubSettings _settings;
    private IReadOnlyList<ShortcutItemViewModel> _shortcuts = [];

    public MainViewModel(
        ModuleRegistry registry,
        GlobalHotkeyCoordinator hotkeyCoordinator,
        CleanShotModule cleanShotModule)
    {
        _registry = registry;
        _hotkeyCoordinator = hotkeyCoordinator;
        _cleanShotModule = cleanShotModule;
        _settings = HubSettingsStore.Load();
        Modules = _registry.Modules
            .Select(module => new ModuleItemViewModel(module, ToggleModuleAsync))
            .ToList();
        RefreshHomeDashboard();
    }

    public IReadOnlyList<ModuleItemViewModel> Modules { get; }

    public IReadOnlyList<ModuleItemViewModel> QuickAccessModules =>
        Modules.Where(module => module.HasSettingsPage).ToList();

    public IReadOnlyList<ShortcutItemViewModel> Shortcuts => _shortcuts;

    public string ModuleStatusSummary
    {
        get
        {
            var enabledCount = Modules.Count(module => module.IsEnabled);
            return enabledCount switch
            {
                0 => "No utilities running in the background",
                1 => "1 utility running in the background",
                _ => $"{enabledCount} utilities running in the background",
            };
        }
    }

    public string? HotkeyConflictText { get; private set; }

    public Visibility HotkeyConflictVisibility =>
        string.IsNullOrWhiteSpace(HotkeyConflictText) ? Visibility.Collapsed : Visibility.Visible;

    public bool RunAtStartup
    {
        get => _settings.RunAtStartup;
        set
        {
            if (_settings.RunAtStartup == value)
            {
                return;
            }

            _settings.RunAtStartup = value;
            OnPropertyChanged();
            PersistSettings();
            HubStartupService.Apply(value);
        }
    }

    public bool StartMinimizedToTray
    {
        get => _settings.StartMinimizedToTray;
        set
        {
            if (_settings.StartMinimizedToTray == value)
            {
                return;
            }

            _settings.StartMinimizedToTray = value;
            OnPropertyChanged();
            PersistSettings();
        }
    }

    public void RefreshHomeDashboard()
    {
        RefreshShortcuts();
        OnPropertyChanged(nameof(ModuleStatusSummary));
        OnPropertyChanged(nameof(QuickAccessModules));
    }

    public void RefreshHotkeyConflicts()
    {
        _hotkeyCoordinator.ClearConflicts();

        if (_cleanShotModule.IsEnabled)
        {
            _cleanShotModule.ReregisterHotkeys();
        }

        var conflicts = _hotkeyCoordinator.ActiveConflicts;
        HotkeyConflictText = conflicts.Count == 0 ? null : string.Join(" ", conflicts.Distinct());
        OnPropertyChanged(nameof(HotkeyConflictText));
        OnPropertyChanged(nameof(HotkeyConflictVisibility));
    }

    public void SyncModuleStates()
    {
        foreach (var item in Modules)
        {
            item.SyncFromModule();
        }

        RefreshHomeDashboard();
    }

    private void RefreshShortcuts()
    {
        var shortcuts = new List<ShortcutItemViewModel>();
        var cleanShot = Modules.FirstOrDefault(module =>
            module.Id == HomeServiceCollectionExtensions.CleanShotModuleId);

        if (cleanShot?.IsEnabled == true)
        {
            shortcuts.Add(new ShortcutItemViewModel(
                "Capture full screen",
                HotkeyConfiguration.FullScreenDisplay,
                HomeServiceCollectionExtensions.CleanShotModuleId));
            shortcuts.Add(new ShortcutItemViewModel(
                "Capture region",
                HotkeyConfiguration.RegionDisplay,
                HomeServiceCollectionExtensions.CleanShotModuleId));
        }

        _shortcuts = shortcuts;
        OnPropertyChanged(nameof(Shortcuts));
    }

    private async Task ToggleModuleAsync(ModuleItemViewModel item, bool enabled)
    {
        _settings.EnabledModules[item.Id] = enabled;
        PersistSettings();

        if (enabled)
        {
            await item.Module.EnableAsync();
        }
        else
        {
            await item.Module.DisableAsync();
        }

        item.RefreshStatus();
        RefreshHomeDashboard();
        RefreshHotkeyConflicts();
        TryRefreshTrayMenu();
    }

    private static void TryRefreshTrayMenu()
    {
        try
        {
            App.MainWindow.RefreshTrayMenu();
        }
        catch (InvalidOperationException)
        {
        }
    }

    private void PersistSettings() => HubSettingsStore.Save(_settings);
}

public sealed partial class ModuleItemViewModel : ObservableObject
{
    private readonly Func<ModuleItemViewModel, bool, Task> _toggle;

    public ModuleItemViewModel(IHomeModule module, Func<ModuleItemViewModel, bool, Task> toggle)
    {
        Module = module;
        _toggle = toggle;
        Id = module.Id;
        DisplayName = module.DisplayName;
        Description = module.Description;
        _isEnabled = module.IsEnabled;
        _statusText = module.Status.Message;
    }

    public IHomeModule Module { get; }

    public string Id { get; }

    public string DisplayName { get; }

    public string Description { get; }

    public string IconGlyph => ModuleNavigation.GetIcon(Id) switch
    {
        Symbol.Camera => "\uE722",
        Symbol.Switch => "\uE8E7",
        _ => "\uE713",
    };

    public bool HasSettingsPage => ModuleNavigation.HasSettingsPage(Id);

    public Visibility SettingsVisibility => HasSettingsPage ? Visibility.Visible : Visibility.Collapsed;

    private bool _isEnabled;

    public bool IsEnabled
    {
        get => _isEnabled;
        set
        {
            if (SetProperty(ref _isEnabled, value))
            {
                _ = _toggle(this, value);
            }
        }
    }

    private string _statusText = string.Empty;

    public string StatusText
    {
        get => _statusText;
        set => SetProperty(ref _statusText, value);
    }

    public void RefreshStatus() => StatusText = Module.Status.Message;

    public void SyncFromModule()
    {
        if (_isEnabled != Module.IsEnabled)
        {
            _isEnabled = Module.IsEnabled;
            OnPropertyChanged(nameof(IsEnabled));
        }

        RefreshStatus();
    }
}
