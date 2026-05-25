using CommunityToolkit.Mvvm.ComponentModel;
using Home.Core;
using Home.Core.Modules;
using Home.Hub.Navigation;
using Home.Windows;
using Microsoft.UI.Xaml;

namespace Home.Hub.ViewModels;

public sealed partial class MainViewModel : ObservableObject
{
    private readonly ModuleRegistry _registry;
    private HubSettings _settings;

    public MainViewModel(ModuleRegistry registry)
    {
        _registry = registry;
        _settings = HubSettingsStore.Load();
        Modules = _registry.Modules
            .Select(module => new ModuleItemViewModel(module, ToggleModuleAsync))
            .ToList();
    }

    public IReadOnlyList<ModuleItemViewModel> Modules { get; }

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

            if (value)
            {
                var exePath = Environment.ProcessPath;
                if (!string.IsNullOrWhiteSpace(exePath))
                {
                    WindowsStartupRegistry.Enable("Home", exePath);
                }
            }
            else
            {
                WindowsStartupRegistry.Disable("Home");
            }
        }
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
}
