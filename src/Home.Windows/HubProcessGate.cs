using System.Threading;

namespace Home.Windows;

public static class HubProcessGate
{
    public const string HubMutexName = @"Local\Home_Hub_SingleInstance_v2";
    public const string HubActivateEventName = @"Local\Home_Hub_Activate_v2";

    public static bool IsHubRunning()
    {
        try
        {
            using var mutex = Mutex.OpenExisting(HubMutexName);
            return true;
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            return false;
        }
    }

    public static bool TryRedirectToHub()
    {
        if (!IsHubRunning())
        {
            return false;
        }

        SingleInstanceGate.RequestActivation(HubActivateEventName);
        return true;
    }
}
