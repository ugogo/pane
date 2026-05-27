namespace LightControls.Core.Logitech.Hidpp20;

internal static class Hidpp20Constants
{
    public const byte ReportIdShort = 0x10;
    public const byte ReportIdLong = 0x11;
    public const byte ReportIdShortNotification = 0x12;

    public const byte ReceiverDeviceIndex = 0xFF;
    public const byte DefaultMouseDeviceIndex = 0x01;

    public const byte RgbSwControlCluster = 0x01;
    public const byte RgbSwControlMode = 0x03;
    public const byte RgbSwControlActiveFlags = 0x05;
    public const byte RgbSwControlIdleFlags = 0x03;
    public const byte RgbSwControlReleaseFlags = 0x00;

    public const ushort FeatureRoot = 0x0000;
    public const ushort FeatureColorLedEffects = 0x8070;
    public const ushort FeatureRgbEffects = 0x8071;
    public const ushort FeatureModeStatus = 0x8090;
    public const ushort FeatureLedSoftwareControl = 0x1300;
    public const ushort FeatureOnboardProfiles = 0x8100;
    public const ushort FeatureBrightnessControl = 0x8040;

    public const byte CmdRootGetFeature = 0x00;

    /// <summary>Alternate root get-feature function seen on some Logitech receivers.</summary>
    public const byte CmdRootGetFeatureAlt = 0x08;
    public const byte CmdColorLedEffectsSetZoneEffect = 0x30;
    public const byte CmdLedSwControlSetLedState = 0x50;
    public const byte CmdModeStatusSetSolidColor = 0x30;
    public const byte CmdOnboardProfilesSetMode = 0x10;

    public const byte CmdBrightnessControlSetBrightness = 0x10;

    public const byte CmdRgbEffectsGetInfo = 0x00;
    public const byte CmdRgbEffectsSetClusterEffect = 0x10;
    public const byte CmdRgbEffectsManageSwControl = 0x50;
    public const byte CmdRgbEffectsEventNotification = 0x60;
    public const byte CmdRgbEffectsSetPowerSave = 0x70;

    /// <summary>Effect mode for a fixed/solid RGB color on 8071 devices.</summary>
    public const ushort RgbEffectModeOn = 0x0001;

    /// <summary>Onboard profile mode value (diagnostics only; not modified by lighting apply).</summary>
    public const byte OnboardProfilesDisable = 0x02;
}
