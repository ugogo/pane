using HidSharp;

namespace LightControls.Core.Logitech.Hidpp20;

internal sealed class Hidpp20Session : IDisposable
{
    private const int ShortReportLength = 7;
    private const int LongReportLength = 20;

    private readonly HidDevice _shortDevice;
    private readonly HidDevice _longDevice;
    private readonly HidStream _shortStream;
    private readonly HidStream _longStream;
    private readonly object _ioLock = new();
    private byte _deviceIndex;
    private readonly Dictionary<ushort, byte> _featureIndexCache = [];
    private readonly Dictionary<byte, byte> _solidEffectIndexCache = [];
    private bool _rgbSetupComplete;
    private PowerLedColorPath _activeColorPath;
    private byte _activeFeatureIndex;

    private enum PowerLedColorPath
    {
        None,
        ModeStatus,
        RgbEffects,
        ColorLedEffects,
    }

    private Hidpp20Session(HidDevice shortDevice, HidDevice longDevice, byte deviceIndex)
    {
        _shortDevice = shortDevice;
        _longDevice = longDevice;
        _shortStream = shortDevice.Open();
        _longStream = longDevice.Open();
        _shortStream.ReadTimeout = 500;
        _longStream.ReadTimeout = 1000;
        _deviceIndex = deviceIndex;
        IsGhubFriendlyLighting = ResolveGhubFriendlyLighting();
    }

    /// <summary>
    /// Sends color-only HID++ writes without claiming RGB software control from G HUB.
    /// </summary>
    public bool IsGhubFriendlyLighting { get; }

    public string ActiveColorPathName => _activeColorPath.ToString();

    public static bool IsDevicePresent()
    {
        foreach (var pair in FindEndpointPairs())
        {
            try
            {
                using var candidate = new Hidpp20Session(
                    pair.Short,
                    pair.Long,
                    Hidpp20Constants.DefaultMouseDeviceIndex);
                if (candidate.ProbeProX2Mouse())
                {
                    return true;
                }
            }
            catch
            {
                // Try the next receiver or mouse interface pair.
            }
        }

        return false;
    }

    public static bool TryOpen(out Hidpp20Session? session, out string? error)
    {
        session = null;
        error = null;

        foreach (var pair in FindEndpointPairs())
        {
            try
            {
                var candidate = new Hidpp20Session(pair.Short, pair.Long, Hidpp20Constants.DefaultMouseDeviceIndex);
                if (candidate.ProbeProX2Mouse())
                {
                    session = candidate;
                    return true;
                }

                candidate.Dispose();
            }
            catch
            {
                // Try the next receiver or mouse interface pair.
            }
        }

        error = "Logitech G Pro X Superlight 2 was not found on a compatible HID interface. "
                + "Connect the mouse (USB or LIGHTSPEED dongle) and close other RGB apps if detection fails.";
        return false;
    }

    public bool ProbeProX2Mouse()
    {
        return TryGetFeatureIndex(Hidpp20Constants.FeatureModeStatus, out _)
            || TryGetFeatureIndex(Hidpp20Constants.FeatureRgbEffects, out _)
            || TryGetFeatureIndex(Hidpp20Constants.FeatureColorLedEffects, out _)
            || TryGetFeatureIndex(Hidpp20Constants.FeatureLedSoftwareControl, out _);
    }

    public bool TryGetFeatureIndex(ushort featureId, out byte featureIndex)
    {
        if (_featureIndexCache.TryGetValue(featureId, out featureIndex))
        {
            return featureIndex != 0;
        }

        var savedIndex = _deviceIndex;
        foreach (var deviceIndex in new[] { savedIndex, Hidpp20Constants.ReceiverDeviceIndex })
        {
            _deviceIndex = deviceIndex;
            foreach (var command in new[] { Hidpp20Constants.CmdRootGetFeatureAlt, Hidpp20Constants.CmdRootGetFeature })
            {
                var request = CreateRootGetFeatureRequest(featureId, command);
                if (TryRequest(request, out var response) && response[4] != 0)
                {
                    _deviceIndex = savedIndex;
                    featureIndex = response[4];
                    _featureIndexCache[featureId] = featureIndex;
                    return true;
                }
            }
        }

        _deviceIndex = savedIndex;
        _featureIndexCache[featureId] = 0;
        featureIndex = 0;
        return false;
    }

    public void ResetActiveColorPath()
    {
        _activeColorPath = PowerLedColorPath.None;
        _activeFeatureIndex = 0;
    }

    public bool TrySetPowerLedColor(byte red, byte green, byte blue, out string? error)
    {
        if (IsGhubFriendlyLighting)
        {
            return TrySetGhubFriendlyColor(red, green, blue, out error);
        }

        if (TrySetViaRgbEffects(red, green, blue, out error))
        {
            return true;
        }

        if (TrySetViaModeStatus(red, green, blue, out error))
        {
            return true;
        }

        if (TrySetViaColorLedEffects(red, green, blue, out error))
        {
            return true;
        }

        error ??= "No supported HID++ lighting feature responded on this mouse.";
        return false;
    }

    public bool TrySetRgbEffectsColorDirect(byte red, byte green, byte blue, out string? error)
    {
        if (!TryGetFeatureIndex(Hidpp20Constants.FeatureRgbEffects, out var featureIndex))
        {
            error = "RGB_EFFECTS (0x8071) is not available.";
            return false;
        }

        if (!TrySetRgbEffectsColor(featureIndex, red, green, blue, out error))
        {
            return false;
        }

        ActivateColorPath(PowerLedColorPath.RgbEffects, featureIndex);
        return true;
    }

    public bool TrySetColorLedEffectsDirect(byte red, byte green, byte blue, out string? error) =>
        TrySetViaColorLedEffects(red, green, blue, out error);

    private bool TrySetGhubFriendlyColor(byte red, byte green, byte blue, out string? error)
    {
        if (TrySetRgbEffectsColorDirect(red, green, blue, out error))
        {
            return true;
        }

        if (TrySetViaColorLedEffects(red, green, blue, out error))
        {
            return true;
        }

        if (TrySetViaModeStatus(red, green, blue, out error))
        {
            return true;
        }

        error ??= "No G HUB-compatible color command succeeded on this mouse.";
        return false;
    }

    public bool TryMaintainPowerLedColor(byte red, byte green, byte blue)
    {
        if (IsGhubFriendlyLighting)
        {
            return _activeColorPath switch
            {
                PowerLedColorPath.RgbEffects => TrySetRgbEffectsColorDirect(red, green, blue, out _),
                PowerLedColorPath.ColorLedEffects => TrySetViaColorLedEffects(red, green, blue, out _),
                PowerLedColorPath.ModeStatus => TrySetViaModeStatus(red, green, blue, out _),
                _ => TrySetGhubFriendlyColor(red, green, blue, out _),
            };
        }

        DrainPendingNotifications();

        switch (_activeColorPath)
        {
            case PowerLedColorPath.RgbEffects:
                if (TrySetRgbEffectsColor(_activeFeatureIndex, red, green, blue, out _))
                {
                    return true;
                }

                return TryReclaimRgbControl(_activeFeatureIndex, red, green, blue, out _);
            case PowerLedColorPath.ModeStatus:
                return TrySetViaModeStatus(red, green, blue, out _);
            case PowerLedColorPath.ColorLedEffects:
                return TrySetViaColorLedEffects(red, green, blue, out _);
            default:
                return TrySetPowerLedColor(red, green, blue, out _);
        }
    }

    public int DrainPendingNotifications(int maxReads = 8)
    {
        if (IsGhubFriendlyLighting)
        {
            return 0;
        }

        var drained = 0;
        for (var i = 0; i < maxReads; i++)
        {
            if (!TryWaitForNotification(1, out _))
            {
                break;
            }

            drained++;
        }

        return drained;
    }

    public bool TryHandleRgbNotifications(byte red, byte green, byte blue, int maxReads = 12)
    {
        if (IsGhubFriendlyLighting || _activeColorPath != PowerLedColorPath.RgbEffects)
        {
            return false;
        }

        var rgbLost = false;
        for (var i = 0; i < maxReads; i++)
        {
            if (!TryWaitForNotification(250, out var report))
            {
                break;
            }

            if (!IsRgbEffectsNotification(report, _activeFeatureIndex))
            {
                continue;
            }

            rgbLost = true;
        }

        return rgbLost;
    }

    public string? TryReadRgbPowerSave(byte featureIndex)
    {
        var read = CreateLongReport(Hidpp20Constants.CmdRgbEffectsSetPowerSave);
        read[2] = featureIndex;
        if (!TryRequest(read, out var response))
        {
            return null;
        }

        var lowPower = (ushort)((response[8] << 8) | response[9]);
        var turnOff = (ushort)((response[10] << 8) | response[11]);
        return $"lowPower={lowPower}s turnOff={turnOff}s";
    }

    public void TryReleaseRgbSoftwareControl()
    {
        if (IsGhubFriendlyLighting)
        {
            return;
        }

        if (!TryGetFeatureIndex(Hidpp20Constants.FeatureRgbEffects, out var featureIndex))
        {
            return;
        }

        var report = CreateLongReport(Hidpp20Constants.CmdRgbEffectsManageSwControl);
        report[2] = featureIndex;
        report[4] = Hidpp20Constants.RgbSwControlCluster;
        report[5] = Hidpp20Constants.RgbSwControlReleaseFlags;
        report[6] = Hidpp20Constants.RgbSwControlReleaseFlags;
        TryRequest(report, out _);
    }

    public bool TryWaitForNotification(int timeoutMs, out byte[] report)
    {
        report = new byte[LongReportLength];

        lock (_ioLock)
        {
            foreach (var readStream in new[] { _longStream, _shortStream })
            {
                var readLength = readStream == _shortStream ? ShortReportLength : LongReportLength;
                var readBuffer = new byte[readLength];

                try
                {
                    readStream.ReadTimeout = Math.Max(1, timeoutMs);
                    var read = readStream.Read(readBuffer, 0, readBuffer.Length);
                    if (read <= 0)
                    {
                        continue;
                    }

                    Array.Copy(readBuffer, report, Math.Min(readBuffer.Length, report.Length));
                    if (IsAsyncNotification(readBuffer))
                    {
                        return true;
                    }
                }
                catch (TimeoutException)
                {
                    return false;
                }
            }
        }

        return false;
    }

    private bool ResolveGhubFriendlyLighting()
    {
        if (!TryGetFeatureIndex(Hidpp20Constants.FeatureModeStatus, out _))
        {
            return false;
        }

        foreach (var mouseId in LogitechDeviceIds.DirectMouseProductIds)
        {
            if (_shortDevice.ProductID == mouseId || _longDevice.ProductID == mouseId)
            {
                return true;
            }
        }

        foreach (var receiverId in LogitechDeviceIds.LightspeedReceiverProductIds)
        {
            if (_shortDevice.ProductID == receiverId || _longDevice.ProductID == receiverId)
            {
                return true;
            }
        }

        return false;
    }

    private bool TrySetViaRgbEffects(byte red, byte green, byte blue, out string? error)
    {
        error = null;
        if (!TryGetFeatureIndex(Hidpp20Constants.FeatureRgbEffects, out var featureIndex))
        {
            error = "RGB_EFFECTS (0x8071) is not available.";
            return false;
        }

        return TryReclaimRgbControl(featureIndex, red, green, blue, out error);
    }

    private void ActivateColorPath(PowerLedColorPath path, byte featureIndex = 0)
    {
        _activeColorPath = path;
        if (featureIndex != 0)
        {
            _activeFeatureIndex = featureIndex;
        }
    }

    private bool TryReclaimRgbControl(byte featureIndex, byte red, byte green, byte blue, out string? error)
    {
        error = null;
        EnsureRgbSetup(featureIndex);
        if (TrySetRgbEffectsColor(featureIndex, red, green, blue, out error))
        {
            ActivateColorPath(PowerLedColorPath.RgbEffects, featureIndex);
            return true;
        }

        error ??= "RGB_EFFECTS color command was rejected by the mouse.";
        return false;
    }

    private void EnsureRgbSetup(byte featureIndex)
    {
        if (_rgbSetupComplete)
        {
            return;
        }

        TryEnableRgbSoftwareControl(featureIndex);
        TryDisableRgbPowerSave(featureIndex);
        _rgbSetupComplete = true;
    }

    private bool TrySetRgbEffectsColor(byte featureIndex, byte red, byte green, byte blue, out string? error)
    {
        error = null;
        const byte clusterIndex = 0;
        var effectIndex = GetSolidColorEffectIndex(featureIndex, clusterIndex);

        var report = CreateLongReport(Hidpp20Constants.CmdRgbEffectsSetClusterEffect);
        report[2] = featureIndex;
        report[4] = clusterIndex;
        report[5] = effectIndex;
        report[6] = red;
        report[7] = green;
        report[8] = blue;
        report[16] = 0x01;

        if (TryRequest(report, out _))
        {
            return true;
        }

        error = "RGB_EFFECTS color command was rejected by the mouse.";
        return false;
    }

    private byte GetSolidColorEffectIndex(byte featureIndex, byte clusterIndex)
    {
        if (_solidEffectIndexCache.TryGetValue(clusterIndex, out var cached))
        {
            return cached;
        }

        var effectIndex = TryFindSolidColorEffectIndex(featureIndex, clusterIndex) ?? 0;
        _solidEffectIndexCache[clusterIndex] = effectIndex;
        return effectIndex;
    }

    private void TryEnableRgbSoftwareControl(byte featureIndex)
    {
        var report = CreateLongReport(Hidpp20Constants.CmdRgbEffectsManageSwControl);
        report[2] = featureIndex;
        report[4] = Hidpp20Constants.RgbSwControlCluster;
        report[5] = Hidpp20Constants.RgbSwControlMode;
        report[6] = Hidpp20Constants.RgbSwControlActiveFlags;
        TryRequest(report, out _);
    }

    private void TryDisableRgbPowerSave(byte featureIndex)
    {
        var read = CreateLongReport(Hidpp20Constants.CmdRgbEffectsSetPowerSave);
        read[2] = featureIndex;
        TryRequest(read, out _);

        var report = CreateLongReport(Hidpp20Constants.CmdRgbEffectsSetPowerSave);
        report[2] = featureIndex;
        report[4] = 0x01;
        report[8] = 0xFF;
        report[9] = 0xFF;
        report[10] = 0xFF;
        report[11] = 0xFF;
        TryRequest(report, out _);
    }

    private byte? TryFindSolidColorEffectIndex(byte featureIndex, byte clusterIndex)
    {
        var clusterInfo = CreateLongReport(Hidpp20Constants.CmdRgbEffectsGetInfo);
        clusterInfo[2] = featureIndex;
        clusterInfo[4] = clusterIndex;
        clusterInfo[5] = 0xFF;
        if (!TryRequest(clusterInfo, out var clusterResponse))
        {
            return null;
        }

        var effectCount = clusterResponse[8];
        for (byte effectIndex = 0; effectIndex < effectCount; effectIndex++)
        {
            var effectInfo = CreateLongReport(Hidpp20Constants.CmdRgbEffectsGetInfo);
            effectInfo[2] = featureIndex;
            effectInfo[4] = clusterIndex;
            effectInfo[5] = effectIndex;
            if (!TryRequest(effectInfo, out var effectResponse))
            {
                continue;
            }

            var mode = (ushort)((effectResponse[6] << 8) | effectResponse[7]);
            if (mode == Hidpp20Constants.RgbEffectModeOn)
            {
                return effectIndex;
            }
        }

        return effectCount > 0 ? (byte)0 : null;
    }

    private bool TrySetViaModeStatus(byte red, byte green, byte blue, out string? error)
    {
        error = null;
        if (!TryGetFeatureIndex(Hidpp20Constants.FeatureModeStatus, out var featureIndex))
        {
            error = "MODE STATUS (0x8090) is not available.";
            return false;
        }

        ReadOnlySpan<(byte Zone, byte Param)> zones =
        [
            (0x01, 0x00),
            (0x00, 0x00),
        ];

        foreach (var (zone, param) in zones)
        {
            var report = CreateLongReport(Hidpp20Constants.CmdModeStatusSetSolidColor);
            report[2] = featureIndex;
            report[4] = param;
            report[5] = zone;
            report[6] = red;
            report[7] = green;
            report[8] = blue;

            if (TryRequest(report, out _))
            {
                ActivateColorPath(PowerLedColorPath.ModeStatus, featureIndex);
                return true;
            }
        }

        error = "MODE STATUS color command was rejected by the mouse.";
        return false;
    }

    private bool TrySetViaColorLedEffects(byte red, byte green, byte blue, out string? error)
    {
        error = null;
        if (!TryGetFeatureIndex(Hidpp20Constants.FeatureColorLedEffects, out var featureIndex))
        {
            error = "COLOR_LED_EFFECTS (0x8070) is not available.";
            return false;
        }

        var report = CreateLongReport(Hidpp20Constants.CmdColorLedEffectsSetZoneEffect);
        report[2] = featureIndex;
        report[4] = 0x00;
        report[12] = 0x01;
        report[5] = 0x01;
        report[6] = red;
        report[7] = green;
        report[8] = blue;
        report[9] = 0xFF;

        if (TryRequest(report, out _))
        {
            ActivateColorPath(PowerLedColorPath.ColorLedEffects, featureIndex);
            return true;
        }

        error = "COLOR_LED_EFFECTS command was rejected by the mouse.";
        return false;
    }

    private byte[] CreateRootGetFeatureRequest(ushort featureId, byte command)
    {
        var report = CreateShortReport(command);
        report[4] = (byte)(featureId >> 8);
        report[5] = (byte)(featureId & 0xFF);
        report[6] = 0x00;
        return report;
    }

    private byte[] CreateShortReport(byte command)
    {
        var report = new byte[ShortReportLength];
        report[0] = Hidpp20Constants.ReportIdShort;
        report[1] = _deviceIndex;
        report[2] = 0x00;
        report[3] = command;
        return report;
    }

    private byte[] CreateLongReport(byte command)
    {
        var report = new byte[LongReportLength];
        report[0] = Hidpp20Constants.ReportIdLong;
        report[1] = _deviceIndex;
        report[3] = command;
        return report;
    }

    private bool TryRequest(byte[] request, out byte[] response)
    {
        response = new byte[LongReportLength];

        lock (_ioLock)
        {
            var isShort = request[0] == Hidpp20Constants.ReportIdShort;
            var writeStream = isShort ? _shortStream : _longStream;
            writeStream.Write(PadReport(request));

            foreach (var readStream in new[] { _longStream, _shortStream })
            {
                var readLength = readStream == _shortStream ? ShortReportLength : LongReportLength;
                var readBuffer = new byte[readLength];

                for (var attempt = 0; attempt < 5; attempt++)
                {
                    try
                    {
                        readStream.ReadTimeout = readStream == _shortStream ? 500 : 1000;
                        var read = readStream.Read(readBuffer, 0, readBuffer.Length);
                        if (read <= 0)
                        {
                            Thread.Sleep(5);
                            continue;
                        }

                        Array.Copy(readBuffer, response, Math.Min(readBuffer.Length, response.Length));
                        if (IsAsyncNotification(readBuffer))
                        {
                            continue;
                        }

                        if (IsSuccessfulResponse(request, response))
                        {
                            return true;
                        }
                    }
                    catch (TimeoutException)
                    {
                        break;
                    }
                }
            }
        }

        return false;
    }

    private static bool IsAsyncNotification(byte[] report) =>
        IsRgbEffectsNotification(report, featureIndex: null);

    private static bool IsRgbEffectsNotification(byte[] report, byte? featureIndex)
    {
        if (report.Length == 0)
        {
            return false;
        }

        if (report[0] == Hidpp20Constants.ReportIdShortNotification)
        {
            return featureIndex is null;
        }

        if (report[0] != Hidpp20Constants.ReportIdLong)
        {
            return false;
        }

        if (featureIndex is not null && report[2] != featureIndex.Value)
        {
            return false;
        }

        return report[3] == Hidpp20Constants.CmdRgbEffectsEventNotification;
    }

    private static bool IsSuccessfulResponse(byte[] request, byte[] response)
    {
        if (response[0] != request[0] + 1 && response[0] != Hidpp20Constants.ReportIdLong)
        {
            return false;
        }

        if (response.Length > 3 && response[3] == 0x8F)
        {
            return false;
        }

        if (request.Length > 3
            && response.Length > 3
            && request[2] != 0
            && (response[2] != request[2] || response[3] != request[3]))
        {
            return false;
        }

        return true;
    }

    private static byte[] PadReport(byte[] report)
    {
        var reportLength = report[0] switch
        {
            Hidpp20Constants.ReportIdShort => ShortReportLength,
            Hidpp20Constants.ReportIdLong => LongReportLength,
            _ => report.Length
        };

        if (report.Length == reportLength)
        {
            return report;
        }

        var padded = new byte[reportLength];
        Array.Copy(report, padded, Math.Min(report.Length, reportLength));
        return padded;
    }

    internal static IReadOnlyList<HidppEndpointPair> FindEndpointPairs()
    {
        var devices = DeviceList.Local
            .GetHidDevices(LogitechDeviceIds.VendorId)
            .Where(IsCandidateInterface)
            .ToList();

        var pairs = new List<HidppEndpointPair>();
        foreach (var group in devices.GroupBy(GetEndpointGroupKey))
        {
            var shortDevice = group.FirstOrDefault(device => device.GetMaxOutputReportLength() == ShortReportLength);
            var longDevice = group.FirstOrDefault(device => device.GetMaxOutputReportLength() == LongReportLength);
            if (shortDevice is not null && longDevice is not null)
            {
                pairs.Add(new HidppEndpointPair(shortDevice, longDevice));
            }
        }

        return pairs;
    }

    private static string GetEndpointGroupKey(HidDevice device)
    {
        var path = device.DevicePath;
        var collectionIndex = path.IndexOf("&col", StringComparison.OrdinalIgnoreCase);
        return collectionIndex > 0 ? path[..collectionIndex] : path;
    }

    private static bool IsCandidateInterface(HidDevice device)
    {
        foreach (var mouseId in LogitechDeviceIds.DirectMouseProductIds)
        {
            if (device.ProductID == mouseId)
            {
                return true;
            }
        }

        foreach (var receiverId in LogitechDeviceIds.LightspeedReceiverProductIds)
        {
            if (device.ProductID == receiverId)
            {
                return true;
            }
        }

        return false;
    }

    public void Dispose()
    {
        _shortStream.Dispose();
        _longStream.Dispose();
    }
}

internal readonly record struct HidppEndpointPair(HidDevice Short, HidDevice Long);
