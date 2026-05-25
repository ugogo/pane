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
    private const string MutexName = @"Local\Home_Hub_SingleInstance";
    private const string ActivateEventName = @"Local\Home_Hub_Activate";

    private SingleInstanceGate? _singleInstanceGate;
    private MainWindow? _mainWindow;
    private ServiceProvider? _services;

    public App()
    {
        InitializeComponent();
    }

    public static ServiceProvider Services =>
        ((App)Current)._services ?? throw new InvalidOperationException("Services not initialized.");

    public static MainViewModel MainViewModel =>
        Services.GetRequiredService<MainViewModel>();

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        if (!SingleInstanceGate.TryAcquire(MutexName, ActivateEventName, out var singleInstanceGate))
        {
            SingleInstanceGate.RequestActivation(ActivateEventName);
            Exit();
            return;
        }

        _singleInstanceGate = singleInstanceGate;

        var dispatcher = DispatcherQueue.GetForCurrentThread();
        var settings = HubSettingsStore.Load();

        var serviceCollection = new ServiceCollection();
        serviceCollection.AddHomeCore();
        serviceCollection.AddSingleton(dispatcher);
        serviceCollection.AddSingleton<CleanShotModule>();
        serviceCollection.AddSingleton<IHomeModule>(provider => provider.GetRequiredService<CleanShotModule>());
        serviceCollection.AddSingleton<ModuleRegistry>(provider =>
            new ModuleRegistry(provider.GetServices<IHomeModule>()));
        serviceCollection.AddSingleton<MainViewModel>();
        serviceCollection.AddSingleton<GlobalHotkeyCoordinator>();

        _services = serviceCollection.BuildServiceProvider();

        var registry = _services.GetRequiredService<ModuleRegistry>();
        await registry.ApplyEnabledModulesAsync(settings);

        singleInstanceGate.ListenForActivationRequests(() =>
        {
            dispatcher.TryEnqueue(() => _mainWindow?.ShowFromTray());
        });

        _mainWindow = new MainWindow();
        _mainWindow.Activate();
    }
}
