using CleanShotW.Services;
using CleanShotW.Views;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;

namespace CleanShotW;

public partial class App : Application
{
    private TrayHostWindow? _trayHost;

    public App()
    {
        InitializeComponent();
        UnhandledException += OnUnhandledException;
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        if (!SingleInstanceService.TryAcquire())
        {
            Exit();
            return;
        }

        AppSettingsService.LoadSettings();
        StartupService.Apply(AppSettingsService.LaunchAtStartup);
        SaveService.Initialize(AppSettingsService.SaveFolder);

        var dispatcher = DispatcherQueue.GetForCurrentThread();
        var coordinator = new CaptureCoordinator(dispatcher);
        _trayHost = new TrayHostWindow(coordinator);
        _trayHost.Activate();

        AppLog.Info("CleanShot W started");
    }

    private void OnUnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        AppLog.Error(e.Exception);
        e.Handled = true;
    }
}
