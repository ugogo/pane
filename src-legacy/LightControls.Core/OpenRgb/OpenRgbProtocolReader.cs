using System.Buffers.Binary;
using System.Text;

namespace LightControls.Core.OpenRgb;

internal sealed class OpenRgbProtocolReader(byte[] data)
{
    private int _offset;

    public int Remaining => data.Length - _offset;

    public int ReadInt32()
    {
        Ensure(4);
        var value = BinaryPrimitives.ReadInt32LittleEndian(data.AsSpan(_offset, 4));
        _offset += 4;
        return value;
    }

    public uint ReadUInt32()
    {
        Ensure(4);
        var value = BinaryPrimitives.ReadUInt32LittleEndian(data.AsSpan(_offset, 4));
        _offset += 4;
        return value;
    }

    public ushort ReadUInt16()
    {
        Ensure(2);
        var value = BinaryPrimitives.ReadUInt16LittleEndian(data.AsSpan(_offset, 2));
        _offset += 2;
        return value;
    }

    public string ReadString()
    {
        var length = ReadUInt16();
        if (length == 0)
        {
            return string.Empty;
        }

        Ensure(length);
        var value = Encoding.UTF8.GetString(data, _offset, length);
        _offset += length;
        return value.TrimEnd('\0');
    }

    public void Skip(int byteCount)
    {
        Ensure(byteCount);
        _offset += byteCount;
    }

    private void Ensure(int byteCount)
    {
        if (byteCount < 0 || _offset + byteCount > data.Length)
        {
            throw new InvalidDataException("The OpenRGB server returned malformed controller data.");
        }
    }
}
