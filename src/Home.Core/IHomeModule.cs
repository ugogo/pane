namespace Home.Core;

public interface IHomeModule
{
    string Id { get; }

    string DisplayName { get; }

    string Description { get; }

    bool IsEnabled { get; }

    ModuleStatus Status { get; }

    Type? SettingsPageType { get; }

    Task EnableAsync(CancellationToken cancellationToken = default);

    Task DisableAsync(CancellationToken cancellationToken = default);

    Task RestoreAsync(CancellationToken cancellationToken = default);
}
