using Home.Core;
using Home.Hub.Modules;
using Home.Hub.ViewModels;
using Home.Hub.Views;
using Home.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;

namespace Home.Hub;

public partial class App : Application
{
    private const string MutexName = @"Local\Home_Hub_SingleInstance_v2";
    private const string ActivateEventName = @"Local\Home_Hub_Activate_v2";

    private SingleInstanceGate? _singleInstanceGate;
    private MainWindow? _mainWindow;
    private ServiceProvider? _services;

    public App()
    {
        UnhandledException += OnUnhandledException;
        InitializeComponent();
    }

    public static ServiceProvider Services =>
        ((App)Current)._services ?? throw new InvalidOperationException("Services not initialized.");

    public static MainViewModel MainViewModel =>
        Services.GetRequiredService<MainViewModel>();

    public static MainWindow MainWindow =>
        ((App)Current)._mainWindow ?? throw new InvalidOperationException("Main window not created.");

    public static string? StandaloneModuleId { get; private set; }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        if (!SingleInstanceGate.TryAcquire(MutexName, ActivateEventName, out var singleInstanceGate))
        {
            SingleInstanceGate.RequestActivation(ActivateEventName);
            Exit();
            return;
        }

        _singleInstanceGate = singleInstanceGate;

        var requestedStandaloneModuleId = ParseStandaloneModule(Environment.GetCommandLineArgs());
        StandaloneModuleId = IsStandaloneModuleSupported(requestedStandaloneModuleId)
            ? requestedStandaloneModuleId
            : null;

        var dispatcher = DispatcherQueue.GetForCurrentThread();
        var settings = HubSettingsStore.Load();
        if (StandaloneModuleId is not null)
        {
            ApplyStandaloneModuleSettings(settings, StandaloneModuleId);
            HubSettingsStore.Save(settings);
        }

        var serviceCollection = new ServiceCollection();
        serviceCollection.AddHomeCore();
        serviceCollection.AddSingleton(dispatcher);
        serviceCollection.AddSingleton<CleanShotModule>();
        serviceCollection.AddSingleton<IHomeModule>(provider => provider.GetRequiredService<CleanShotModule>());
        serviceCollection.AddSingleton<ModuleRegistry>(provider =>
            new ModuleRegistry(provider.GetServices<IHomeModule>()));
        serviceCollection.AddSingleton<MainViewModel>();
        serviceCollection.AddSingleton<LightControlsPageViewModel>();
        serviceCollection.AddSingleton<GlobalHotkeyCoordinator>();

        _services = serviceCollection.BuildServiceProvider();

        var registry = _services.GetRequiredService<ModuleRegistry>();
        await registry.ApplyEnabledModulesAsync(settings);
        var mainViewModel = _services.GetRequiredService<MainViewModel>();
        mainViewModel.SyncModuleStates();
        mainViewModel.RefreshHotkeyConflicts();

        singleInstanceGate.ListenForActivationRequests(() =>
        {
            dispatcher.TryEnqueue(async () =>
            {
                _mainWindow?.ShowFromTray();
                if (_mainWindow is not null)
                {
                    await _mainWindow.RestoreEnabledModulesAsync();
                }
            });
        });

        _mainWindow = new MainWindow();

        if (StandaloneModuleId is null && settings.StartMinimizedToTray)
        {
            _mainWindow.HideToTray();
        }
        else
        {
            _mainWindow.Activate();
        }
    }

    private static string? ParseStandaloneModule(IReadOnlyList<string> args)
    {
        for (var i = 0; i < args.Count; i++)
        {
            var arg = args[i];
            if (arg.StartsWith("--module=", StringComparison.OrdinalIgnoreCase))
            {
                return arg["--module=".Length..];
            }

            if (string.Equals(arg, "--module", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Count)
            {
                return args[i + 1];
            }
        }

        return null;
    }

    private static bool IsStandaloneModuleSupported(string? moduleId) =>
        string.Equals(moduleId, HomeServiceCollectionExtensions.CleanShotModuleId, StringComparison.OrdinalIgnoreCase)
        || string.Equals(moduleId, HomeServiceCollectionExtensions.LightControlsModuleId, StringComparison.OrdinalIgnoreCase);

    private static void ApplyStandaloneModuleSettings(HubSettings settings, string moduleId)
    {
        foreach (var key in settings.EnabledModules.Keys.ToList())
        {
            settings.EnabledModules[key] = string.Equals(key, moduleId, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static void OnUnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        var logPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Home",
            "hub-errors.log");
        Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
        File.AppendAllText(logPath, $"{DateTimeOffset.Now:u} {e.Exception}\n");
    }
}
