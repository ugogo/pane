using System.Buffers.Binary;
using System.Net.Sockets;
using System.Text;
using LightControls.Core.Models;

namespace LightControls.Core.OpenRgb;

public sealed class OpenRgbProtocolClient : IAsyncDisposable
{
    internal const int DefaultArgbHeaderLedCount = 30;
    private const uint PacketRequestControllerCount = 0;
    private const uint PacketRequestControllerData = 1;
    private const uint PacketRequestProtocolVersion = 40;
    private const uint PacketSetClientName = 50;
    private const uint PacketUpdateLeds = 1050;
    private const uint PacketUpdateZoneLeds = 1051;
    private const uint PacketResizeZone = 1000;
    private const uint PacketSetCustomMode = 1100;
    private const uint PacketUpdateMode = 1101;
    private const uint ClientProtocolVersion = 5;
    private const int HeaderLength = 16;
    private static readonly TimeSpan SdkStepDelay = TimeSpan.FromMilliseconds(50);

    private readonly TcpClient _tcpClient = new();
    private NetworkStream? _stream;
    private uint _protocolVersion;

    public async Task ConnectAsync(string host, int port, CancellationToken cancellationToken = default)
    {
        await _tcpClient.ConnectAsync(host, port, cancellationToken);
        _stream = _tcpClient.GetStream();
        await NegotiateProtocolAsync(cancellationToken);
        await SetClientNameAsync("Light Controls", cancellationToken);
    }

    public async Task<IReadOnlyList<RgbDevice>> GetDevicesAsync(CancellationToken cancellationToken = default)
    {
        var countPacket = await SendAndReceiveAsync(PacketRequestControllerCount, 0, [], cancellationToken);
        var reader = new OpenRgbProtocolReader(countPacket.Data);
        var count = reader.ReadUInt32();
        var devices = new List<RgbDevice>();

        for (uint controllerIndex = 0; controllerIndex < count; controllerIndex++)
        {
            var payload = _protocolVersion == 0 ? [] : UInt32Payload(_protocolVersion);
            var dataPacket = await SendAndReceiveAsync(PacketRequestControllerData, controllerIndex, payload, cancellationToken);
            devices.Add(ParseDevice(controllerIndex, dataPacket.Data));
        }

        return devices;
    }

    public async Task ApplyColorAsync(
        RgbDevice device,
        RgbColor color,
        int brightnessPercent = 100,
        CancellationToken cancellationToken = default)
    {
        if (device.LedCount <= 0)
        {
            throw new InvalidOperationException("Device does not report controllable LEDs.");
        }

        var controllerIndex = (uint)device.ControllerIndex;
        await SendAsync(PacketSetCustomMode, controllerIndex, [], cancellationToken);
        await Task.Delay(SdkStepDelay, cancellationToken);

        var modeIndex = OpenRgbMode.FindCustomModeIndex(device.Modes) ?? device.ActiveModeIndex;
        var mode = device.Modes.FirstOrDefault(candidate => candidate.Index == modeIndex);
        var usesHardwareBrightness = mode?.SupportsBrightness == true;
        if (mode is not null && usesHardwareBrightness)
        {
            mode = mode.WithBrightnessPercent(brightnessPercent);
            var modePayload = mode.PackUpdateModePayload(_protocolVersion);
            await SendAsync(PacketUpdateMode, controllerIndex, modePayload, cancellationToken);
            await Task.Delay(SdkStepDelay, cancellationToken);
        }

        var ledColor = usesHardwareBrightness ? color : color.WithBrightness(brightnessPercent);
        if (ShouldUseZoneApply(device))
        {
            await ApplyColorViaZonesAsync(
                controllerIndex,
                device.Zones,
                ledColor,
                cancellationToken);
            return;
        }

        var payload = BuildUpdateLedsPayload(device.LedCount, ledColor);
        await SendAsync(PacketUpdateLeds, controllerIndex, payload, cancellationToken);
    }

    public ValueTask DisposeAsync()
    {
        _stream?.Dispose();
        _tcpClient.Dispose();
        return ValueTask.CompletedTask;
    }

    private async Task NegotiateProtocolAsync(CancellationToken cancellationToken)
    {
        await SendAsync(PacketRequestProtocolVersion, 0, UInt32Payload(ClientProtocolVersion), cancellationToken);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromMilliseconds(750));

        try
        {
            var response = await ReceiveAsync(timeout.Token);
            var reader = new OpenRgbProtocolReader(response.Data);
            _protocolVersion = Math.Min(ClientProtocolVersion, reader.ReadUInt32());
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _protocolVersion = 0;
        }
    }

    private async Task SetClientNameAsync(string name, CancellationToken cancellationToken)
    {
        await SendAsync(PacketSetClientName, 0, Encoding.UTF8.GetBytes(name + "\0"), cancellationToken);
    }

    private async Task<OpenRgbPacket> SendAndReceiveAsync(uint packetId, uint deviceIndex, byte[] data, CancellationToken cancellationToken)
    {
        await SendAsync(packetId, deviceIndex, data, cancellationToken);
        return await ReceiveAsync(cancellationToken);
    }

    private async Task SendAsync(uint packetId, uint deviceIndex, byte[] data, CancellationToken cancellationToken)
    {
        if (_stream is null)
        {
            throw new InvalidOperationException("OpenRGB client is not connected.");
        }

        var packet = new byte[HeaderLength + data.Length];
        Encoding.ASCII.GetBytes("ORGB", packet);
        BinaryPrimitives.WriteUInt32LittleEndian(packet.AsSpan(4, 4), deviceIndex);
        BinaryPrimitives.WriteUInt32LittleEndian(packet.AsSpan(8, 4), packetId);
        BinaryPrimitives.WriteUInt32LittleEndian(packet.AsSpan(12, 4), (uint)data.Length);
        data.CopyTo(packet.AsSpan(HeaderLength));

        await _stream.WriteAsync(packet, cancellationToken);
        await _stream.FlushAsync(cancellationToken);
    }

    private async Task<OpenRgbPacket> ReceiveAsync(CancellationToken cancellationToken)
    {
        if (_stream is null)
        {
            throw new InvalidOperationException("OpenRGB client is not connected.");
        }

        var header = await ReadExactAsync(HeaderLength, cancellationToken);
        if (Encoding.ASCII.GetString(header, 0, 4) != "ORGB")
        {
            throw new InvalidDataException("OpenRGB server returned an invalid packet header.");
        }

        var deviceIndex = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(4, 4));
        var packetId = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(8, 4));
        var size = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(12, 4));
        var data = await ReadExactAsync(checked((int)size), cancellationToken);

        return new OpenRgbPacket(deviceIndex, packetId, data);
    }

    private async Task<byte[]> ReadExactAsync(int length, CancellationToken cancellationToken)
    {
        if (_stream is null)
        {
            throw new InvalidOperationException("OpenRGB client is not connected.");
        }

        var data = new byte[length];
        var offset = 0;
        while (offset < length)
        {
            var read = await _stream.ReadAsync(data.AsMemory(offset, length - offset), cancellationToken);
            if (read == 0)
            {
                throw new IOException("OpenRGB server closed the connection.");
            }

            offset += read;
        }

        return data;
    }

    private RgbDevice ParseDevice(uint controllerIndex, byte[] data)
    {
        var reader = new OpenRgbProtocolReader(data);
        _ = reader.ReadUInt32();
        _ = reader.ReadInt32();
        var name = reader.ReadString();
        var vendor = _protocolVersion >= 1 ? reader.ReadString() : string.Empty;
        var description = reader.ReadString();
        _ = reader.ReadString();
        var serial = reader.ReadString();
        var location = reader.ReadString();

        var modeCount = reader.ReadUInt16();
        var activeModeIndex = reader.ReadInt32();
        var modes = new List<OpenRgbMode>(modeCount);
        for (var modeIndex = 0; modeIndex < modeCount; modeIndex++)
        {
            modes.Add(ReadMode(reader, modeIndex));
        }

        var zoneCount = reader.ReadUInt16();
        var zones = new List<OpenRgbZone>(zoneCount);
        for (var zoneIndex = 0; zoneIndex < zoneCount; zoneIndex++)
        {
            zones.Add(ReadZone(reader, zoneIndex));
        }

        var ledCount = reader.ReadUInt16();
        for (var led = 0; led < ledCount; led++)
        {
            _ = reader.ReadString();
            _ = reader.ReadUInt32();
        }

        var colorCount = reader.ReadUInt16();
        reader.Skip(colorCount * 4);

        if (_protocolVersion >= 5)
        {
            var altNameCount = reader.ReadUInt16();
            for (var altNameIndex = 0; altNameIndex < altNameCount; altNameIndex++)
            {
                _ = reader.ReadString();
            }

            _ = reader.ReadUInt32();
        }

        var totalZoneLeds = zones.Sum(zone => zone.LedCount);
        var effectiveLedCount = ledCount > 0 ? ledCount : totalZoneLeds;
        var isSupported = effectiveLedCount > 0;
        var id = CreateStableId(controllerIndex, vendor, name, serial, location);
        return new RgbDevice(
            id,
            checked((int)controllerIndex),
            name,
            vendor,
            description,
            serial,
            location,
            effectiveLedCount,
            isSupported,
            isSupported ? "Ready" : "No controllable LEDs reported",
            modes,
            activeModeIndex,
            zones);
    }

    private OpenRgbMode ReadMode(OpenRgbProtocolReader reader, int modeIndex)
    {
        var name = reader.ReadString();
        var value = reader.ReadInt32();
        var flags = reader.ReadUInt32();
        var speedMin = reader.ReadUInt32();
        var speedMax = reader.ReadUInt32();

        uint? brightnessMin = null;
        uint? brightnessMax = null;
        if (_protocolVersion >= 3)
        {
            brightnessMin = reader.ReadUInt32();
            brightnessMax = reader.ReadUInt32();
        }

        var colorsMin = reader.ReadUInt32();
        var colorsMax = reader.ReadUInt32();
        var speed = reader.ReadUInt32();

        uint? brightness = null;
        if (_protocolVersion >= 3)
        {
            brightness = reader.ReadUInt32();
        }

        var direction = reader.ReadUInt32();
        var colorMode = reader.ReadUInt32();
        var colorCount = reader.ReadUInt16();
        var modeColors = new List<uint>(colorCount);
        for (var colorIndex = 0; colorIndex < colorCount; colorIndex++)
        {
            modeColors.Add(reader.ReadUInt32());
        }

        return new OpenRgbMode(
            modeIndex,
            name,
            value,
            flags,
            speedMin,
            speedMax,
            brightnessMin,
            brightnessMax,
            colorsMin,
            colorsMax,
            speed,
            brightness,
            direction,
            colorMode,
            modeColors);
    }

    private OpenRgbZone ReadZone(OpenRgbProtocolReader reader, int zoneIndex)
    {
        var name = reader.ReadString();
        _ = reader.ReadInt32();
        var ledMin = checked((int)reader.ReadUInt32());
        var ledMax = checked((int)reader.ReadUInt32());
        var ledCount = checked((int)reader.ReadUInt32());
        var matrixLength = reader.ReadUInt16();
        if (matrixLength > 0)
        {
            reader.Skip(matrixLength);
        }

        if (_protocolVersion >= 4)
        {
            var segmentCount = reader.ReadUInt16();
            for (var segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++)
            {
                SkipSegment(reader);
            }
        }

        if (_protocolVersion >= 5)
        {
            _ = reader.ReadUInt32();
        }

        return new OpenRgbZone(zoneIndex, name, ledMin, ledMax, ledCount);
    }

    private static bool ShouldUseZoneApply(RgbDevice device) =>
        device.Zones.Count > 0
        && (device.Zones.Count > 1 || device.Zones.Any(zone => zone.IsResizable));

    private async Task ApplyColorViaZonesAsync(
        uint controllerIndex,
        IReadOnlyList<OpenRgbZone> zones,
        RgbColor color,
        CancellationToken cancellationToken)
    {
        foreach (var zone in zones)
        {
            var targetCount = ResolveZoneLedCount(zone);
            if (targetCount <= 0)
            {
                continue;
            }

            if (zone.IsResizable && targetCount != zone.LedCount)
            {
                await SendAsync(PacketResizeZone, controllerIndex, BuildResizeZonePayload(zone.Index, targetCount), cancellationToken);
                await Task.Delay(SdkStepDelay, cancellationToken);
            }

            var payload = BuildUpdateZoneLedsPayload(zone.Index, targetCount, color);
            await SendAsync(PacketUpdateZoneLeds, controllerIndex, payload, cancellationToken);
            await Task.Delay(SdkStepDelay, cancellationToken);
        }
    }

    internal static int ResolveZoneLedCount(OpenRgbZone zone)
    {
        if (OpenRgbZone.IsArgbHeaderZone(zone.Name) && zone.IsResizable)
        {
            return Math.Clamp(
                DefaultArgbHeaderLedCount,
                Math.Max(zone.LedMin, 1),
                Math.Max(zone.LedMax, 1));
        }

        return Math.Max(zone.LedCount, 1);
    }

    private static byte[] BuildResizeZonePayload(int zoneIndex, int newSize)
    {
        var payload = new byte[8];
        BinaryPrimitives.WriteInt32LittleEndian(payload.AsSpan(0, 4), zoneIndex);
        BinaryPrimitives.WriteInt32LittleEndian(payload.AsSpan(4, 4), newSize);
        return payload;
    }

    internal static byte[] BuildUpdateZoneLedsPayload(int zoneIndex, int ledCount, RgbColor color)
    {
        var payload = new byte[4 + 4 + 2 + ledCount * 4];
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(0, 4), (uint)payload.Length);
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(4, 4), (uint)zoneIndex);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(8, 2), (ushort)ledCount);

        var openRgbColor = color.ToOpenRgbColor();
        for (var index = 0; index < ledCount; index++)
        {
            BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(10 + index * 4, 4), openRgbColor);
        }

        return payload;
    }

    private static void SkipSegment(OpenRgbProtocolReader reader)
    {
        _ = reader.ReadString();
        reader.Skip(sizeof(int) + sizeof(uint) + sizeof(uint));
    }

    private static byte[] BuildUpdateLedsPayload(int ledCount, RgbColor color)
    {
        var payload = new byte[4 + 2 + ledCount * 4];
        BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(0, 4), (uint)payload.Length);
        BinaryPrimitives.WriteUInt16LittleEndian(payload.AsSpan(4, 2), (ushort)ledCount);

        var openRgbColor = color.ToOpenRgbColor();
        for (var index = 0; index < ledCount; index++)
        {
            BinaryPrimitives.WriteUInt32LittleEndian(payload.AsSpan(6 + index * 4, 4), openRgbColor);
        }

        return payload;
    }

    private static string CreateStableId(uint controllerIndex, string vendor, string name, string serial, string location)
    {
        var stablePart = string.Join('|', [vendor, name, serial, location]).Trim('|');
        return string.IsNullOrWhiteSpace(stablePart)
            ? $"openrgb:{controllerIndex}"
            : $"openrgb:{stablePart}";
    }

    private static byte[] UInt32Payload(uint value)
    {
        var payload = new byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(payload, value);
        return payload;
    }
}
