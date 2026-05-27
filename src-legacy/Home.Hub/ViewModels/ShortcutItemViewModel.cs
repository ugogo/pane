namespace Home.Hub.ViewModels;

public sealed class ShortcutItemViewModel
{
    public ShortcutItemViewModel(string label, string hotkey, string? settingsModuleId = null)
    {
        Label = label;
        Hotkey = hotkey;
        SettingsModuleId = settingsModuleId;
    }

    public string Label { get; }

    public string Hotkey { get; }

    public string? SettingsModuleId { get; }
}
