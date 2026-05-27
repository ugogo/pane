namespace Home.Core;

public enum ModuleRunState
{
    Disabled,
    Enabling,
    Running,
    Error,
}

public sealed record ModuleStatus(ModuleRunState State, string Message)
{
    public static ModuleStatus Disabled { get; } = new(ModuleRunState.Disabled, "Off");

    public static ModuleStatus Running(string message = "Running") =>
        new(ModuleRunState.Running, message);

    public static ModuleStatus Error(string message) =>
        new(ModuleRunState.Error, message);
}
