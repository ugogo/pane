using LightControls.Core.OpenRgb;

namespace LightControls.Core.Models;

public sealed record RgbDevice(
    string Id,
    int ControllerIndex,
    string Name,
    string Vendor,
    string Description,
    string Serial,
    string Location,
    int LedCount,
    bool IsSupported,
    string Status,
    IReadOnlyList<OpenRgbMode> Modes,
    int ActiveModeIndex,
    IReadOnlyList<OpenRgbZone> Zones)
{
    public RgbDevice(
        string id,
        int controllerIndex,
        string name,
        string vendor,
        string description,
        string serial,
        string location,
        int ledCount,
        bool isSupported,
        string status)
        : this(
            id,
            controllerIndex,
            name,
            vendor,
            description,
            serial,
            location,
            ledCount,
            isSupported,
            status,
            [],
            0,
            [])
    {
    }
}
