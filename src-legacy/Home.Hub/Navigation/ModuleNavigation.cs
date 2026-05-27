using Home.Core;
using Home.Hub.Views;
using Microsoft.UI.Xaml.Controls;

namespace Home.Hub.Navigation;

internal static class ModuleNavigation
{
    public static Type? GetSettingsPageType(string moduleId) => moduleId switch
    {
        HomeServiceCollectionExtensions.CleanShotModuleId => typeof(CleanShotSettingsPage),
        HomeServiceCollectionExtensions.LightControlsModuleId => typeof(LightControlsPage),
        _ => null,
    };

    public static Symbol GetIcon(string moduleId) => moduleId switch
    {
        HomeServiceCollectionExtensions.CleanShotModuleId => Symbol.Camera,
        HomeServiceCollectionExtensions.LightControlsModuleId => Symbol.Home,
        _ => Symbol.Setting,
    };

    public static string GetIconGlyph(string moduleId) => moduleId switch
    {
        HomeServiceCollectionExtensions.CleanShotModuleId => "\uE722",
        HomeServiceCollectionExtensions.LightControlsModuleId => "\uE8BE",
        _ => "\uE713",
    };

    public static bool HasSettingsPage(string moduleId) => GetSettingsPageType(moduleId) is not null;
}
