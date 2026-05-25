namespace CleanShotW.Services;

internal static class SingleInstanceService
{
    private const string MutexName = @"Local\CleanShotW_SingleInstance";

    internal static Func<bool>? TestTryAcquireOverride { get; set; }

    private static Mutex? _mutex;

    public static bool TryAcquire()
    {
        if (TestTryAcquireOverride is not null)
        {
            return TestTryAcquireOverride();
        }

        _mutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);
        if (createdNew)
        {
            return true;
        }

        _mutex.Dispose();
        _mutex = null;
        AppLog.Info("Another CleanShot W instance is already running; exiting.");
        return false;
    }

    internal static void ResetForTests()
    {
        TestTryAcquireOverride = null;
        _mutex?.Dispose();
        _mutex = null;
    }
}
