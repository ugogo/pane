using LightControls.Core.Logitech;

Console.WriteLine(LogitechProbe.Run());
Console.WriteLine();
Console.WriteLine("--- HID devices (046D) ---");
foreach (var device in HidSharp.DeviceList.Local.GetHidDevices(0x046D))
{
    try
    {
        Console.WriteLine($"PID=0x{device.ProductID:X4} maxOut={device.GetMaxOutputReportLength()} {device.GetProductName()}");
    }
    catch
    {
        Console.WriteLine($"PID=0x{device.ProductID:X4} maxOut={device.GetMaxOutputReportLength()} (name unavailable)");
    }
}
