using System.Windows;
using Home.Windows;

namespace LightControls.Desktop;

public partial class App : System.Windows.Application
{
    private const string MutexName = "LightControls.Desktop.SingleInstance";
    private const string ActivateEventName = "LightControls.Desktop.Activate";

    private SingleInstanceGate? _singleInstanceGate;

    protected override void OnStartup(StartupEventArgs e)
    {
        if (HubProcessGate.TryRedirectToHub())
        {
            Shutdown(0);
            return;
        }

        if (!SingleInstanceGate.TryAcquire(MutexName, ActivateEventName, out var singleInstanceGate))
        {
            SingleInstanceGate.RequestActivation(ActivateEventName);
            Shutdown(0);
            return;
        }

        _singleInstanceGate = singleInstanceGate;

        base.OnStartup(e);

        var mainWindow = new MainWindow();
        MainWindow = mainWindow;
        mainWindow.Show();

        singleInstanceGate.ListenForActivationRequests(() =>
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
