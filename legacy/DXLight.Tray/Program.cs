using Home.Windows;

namespace DXLight.Tray;

static class Program
{
    [STAThread]
    static void Main()
    {
        if (HubProcessGate.TryRedirectToHub())
        {
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
    }    
}
