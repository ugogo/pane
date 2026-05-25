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
        HomeServiceCollectionExtensions.LightControlsModuleId => Symbol.Switch,
        _ => Symbol.Setting,
    };

    public static bool HasSettingsPage(string moduleId) => GetSettingsPageType(moduleId) is not null;
}
