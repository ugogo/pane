using DXLight.Core;
using Home.Core.Modules;
using Microsoft.Extensions.DependencyInjection;

namespace Home.Core;

public static class HomeServiceCollectionExtensions
{
    public const string DxLightModuleId = "dx-light";
    public const string LightControlsModuleId = "light-controls";
    public const string CleanShotModuleId = "cleanshot";

    public static IServiceCollection AddHomeCore(this IServiceCollection services)
    {
        services.AddSingleton<LightController>();
        services.AddSingleton<DxLightModule>();
        services.AddSingleton<LightControlsModule>();
        services.AddSingleton<IHomeModule>(provider => provider.GetRequiredService<DxLightModule>());
        services.AddSingleton<IHomeModule>(provider => provider.GetRequiredService<LightControlsModule>());
        services.AddSingleton<ModuleRegistry>(provider =>
            new ModuleRegistry(provider.GetServices<IHomeModule>()));
        return services;
    }
}
