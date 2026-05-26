namespace Home.Windows;

public static class PowerBroadcast
{
    public const int WmPowerBroadcast = 0x0218;
    public const int ResumeAutomatic = 0x0012;
    public const int ResumeSuspend = 0x0007;

    public static bool IsResumeFromSleep(nint wParam) =>
        wParam == ResumeAutomatic || wParam == ResumeSuspend;
}
