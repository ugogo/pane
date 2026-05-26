namespace Home.Windows;

public static class HubStartupService
{
    public const string RegistryValueName = "Home";
    public const string WakeTaskName = "Home Wake";

    internal static string? TestExecutablePathOverride { get; set; }

    internal static Action<bool>? TestApplyRunKeyOverride { get; set; }

    internal static Action<bool>? TestApplyWakeTaskOverride { get; set; }

    public static void Apply(bool enabled)
    {
        if (TestApplyRunKeyOverride is not null || TestApplyWakeTaskOverride is not null)
        {
            TestApplyRunKeyOverride?.Invoke(enabled);
            TestApplyWakeTaskOverride?.Invoke(enabled);
            return;
        }

        var executablePath = ResolveExecutablePath();
        if (enabled)
        {
            WindowsStartupRegistry.Enable(RegistryValueName, executablePath);
            WakeFromSleepStartupTask.Apply(WakeTaskName, executablePath, enabled: true);
        }
        else
        {
            WindowsStartupRegistry.Disable(RegistryValueName);
            WakeFromSleepStartupTask.Apply(WakeTaskName, executablePath, enabled: false);
        }
    }

    public static bool IsEnabledInOs() =>
        WindowsStartupRegistry.IsEnabled(RegistryValueName);

    internal static void ResetForTests()
    {
        TestExecutablePathOverride = null;
        TestApplyRunKeyOverride = null;
        TestApplyWakeTaskOverride = null;
        WakeFromSleepStartupTask.ResetForTests();
    }

    private static string ResolveExecutablePath()
    {
        var path = TestExecutablePathOverride ?? Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException("Cannot resolve Home executable path.");
        }

        return path;
    }
}
