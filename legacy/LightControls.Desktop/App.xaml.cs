using System.Windows;
using LightControls.Desktop.Startup;

namespace LightControls.Desktop;

public partial class App : System.Windows.Application
{
    private SingleInstanceGate? _singleInstanceGate;

    protected override void OnStartup(StartupEventArgs e)
    {
        if (!SingleInstanceGate.TryAcquire(out var singleInstanceGate))
        {
            SingleInstanceGate.RequestActivation();
            Shutdown(0);
            return;
        }

        _singleInstanceGate = singleInstanceGate;

        base.OnStartup(e);

        var mainWindow = new MainWindow();
        MainWindow = mainWindow;
        mainWindow.Show();

        _singleInstanceGate!.ListenForActivationRequests(() =>
        {
            Dispatcher.Invoke(mainWindow.ActivateFromSecondInstance);
        });
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _singleInstanceGate?.Dispose();
        base.OnExit(e);
    }
}
