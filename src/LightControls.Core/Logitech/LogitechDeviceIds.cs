namespace LightControls.Core.Logitech;

internal static class LogitechDeviceIds
{
    public const ushort VendorId = 0x046D;

    /// <summary>LIGHTSPEED receiver for PRO X 2 / Superlight 2.</summary>
    public const ushort LightspeedReceiverProductId = 0xC54D;

    /// <summary>Older LIGHTSPEED nano receivers also used with PRO / Superlight mice.</summary>
    public static readonly ushort[] LightspeedReceiverProductIds =
    [
        0xC54D,
        0xC547,
        0xC543,
        0xC53F
    ];

    /// <summary>G PRO 2 LIGHTSPEED mouse (wired USB).</summary>
    public const ushort ProG2MouseProductId = 0xC09A;

    /// <summary>PRO X 2 / Superlight 2 mouse (wired USB).</summary>
    public const ushort ProX2MouseProductId = 0xC09B;

    public static readonly ushort[] DirectMouseProductIds = [ProG2MouseProductId, ProX2MouseProductId];

    public const string ProX2Superlight2DeviceId = "logitech:pro-x2-superlight-2";

    public const string ProX2Superlight2Name = "G Pro 2 LIGHTSPEED";
}
