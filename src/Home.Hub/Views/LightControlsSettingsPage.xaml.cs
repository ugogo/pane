using Home.Core.Modules;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Home.Hub.Views;

public sealed partial class LightControlsSettingsPage : Page
{
    public LightControlsSettingsPage()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private LightControlsModule Module => App.Services.GetRequiredService<LightControlsModule>();

    private async void OnLoaded(object sender, RoutedEventArgs e) => await LoadFieldsAsync();

    private async Task LoadFieldsAsync()
    {
        var settings = Module.IsEnabled
            ? Module.Settings
            : await Module.SettingsStore.LoadAsync();
        HostBox.Text = settings.Host;
        PortBox.Value = settings.Port;
        OpenRgbPathBox.Text = settings.OpenRgbExecutablePath ?? string.Empty;
        LogitechToggle.IsOn = settings.EnableLogitechDirect;
        StatusLabel.Text = Module.IsEnabled
            ? Module.Status.Message
            : "Enable Light Controls on the Home page to connect to devices.";
    }

    private async void OnSaveClicked(object sender, RoutedEventArgs e)
    {
        var host = HostBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(host))
        {
            SetStatus("Enter an OpenRGB host.");
            return;
        }

        var port = (int)PortBox.Value;
        if (port is < 1 or > 65535)
        {
            SetStatus("Port must be between 1 and 65535.");
            return;
        }

        var settings = Module.Settings;
        settings.Host = host;
        settings.Port = port;
        settings.OpenRgbExecutablePath = string.IsNullOrWhiteSpace(OpenRgbPathBox.Text)
            ? null
            : OpenRgbPathBox.Text.Trim();
        settings.EnableLogitechDirect = LogitechToggle.IsOn;
        settings.EnableDxLightDirect = false;

        await Module.SettingsStore.SaveAsync(settings);
        if (Module.IsEnabled)
        {
            await Module.ReloadAsync();
        }

        await LoadFieldsAsync();
        SetStatus("Settings saved.");
    }

    private void SetStatus(string message) => SaveStatusText.Text = message;
}
