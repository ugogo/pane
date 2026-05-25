namespace Home.Core;

public sealed class ModuleRegistry
{
    private readonly IReadOnlyList<IHomeModule> _modules;

    public ModuleRegistry(IEnumerable<IHomeModule> modules)
    {
        _modules = modules.ToList();
    }

    public IReadOnlyList<IHomeModule> Modules => _modules;

    public IHomeModule? GetModule(string id) =>
        _modules.FirstOrDefault(module => string.Equals(module.Id, id, StringComparison.OrdinalIgnoreCase));

    public async Task ApplyEnabledModulesAsync(HubSettings settings, CancellationToken cancellationToken = default)
    {
        foreach (var module in _modules)
        {
            var shouldEnable = settings.EnabledModules.GetValueOrDefault(module.Id, false);
            if (shouldEnable && !module.IsEnabled)
            {
                await module.EnableAsync(cancellationToken);
            }
            else if (!shouldEnable && module.IsEnabled)
            {
                await module.DisableAsync(cancellationToken);
            }
        }
    }
}
