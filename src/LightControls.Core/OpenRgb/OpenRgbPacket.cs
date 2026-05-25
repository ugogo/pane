namespace LightControls.Core.OpenRgb;

internal sealed record OpenRgbPacket(uint DeviceIndex, uint PacketId, byte[] Data);
