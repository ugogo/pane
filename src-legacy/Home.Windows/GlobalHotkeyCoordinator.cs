namespace Home.Windows;

public sealed class GlobalHotkeyCoordinator
{
    private readonly Dictionary<string, List<RegisteredHotkey>> _registered = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<string> _activeConflicts = [];

    public IReadOnlyList<string> ActiveConflicts => _activeConflicts;

    public void ClearConflicts() => _activeConflicts.Clear();

    public bool TryRegister(string ownerId, int hotkeyId, uint modifiers, uint virtualKey, out string? conflict)
    {
        conflict = null;
        var signature = FormatSignature(modifiers, virtualKey);

        foreach (var (existingOwner, entries) in _registered)
        {
            foreach (var existing in entries)
            {
                if (existing.Signature != signature ||
                    string.Equals(existingOwner, ownerId, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                conflict = $"Hotkey {signature} is already used by {existingOwner}.";
                RecordConflict(conflict);
                return false;
            }
        }

        if (!_registered.TryGetValue(ownerId, out var ownerEntries))
        {
            ownerEntries = [];
            _registered[ownerId] = ownerEntries;
        }

        ownerEntries.RemoveAll(entry => entry.HotkeyId == hotkeyId);
        ownerEntries.Add(new RegisteredHotkey(hotkeyId, signature));
        return true;
    }

    public void UnregisterOwner(string ownerId)
    {
        _registered.Remove(ownerId);
    }

    public IReadOnlyList<string> ListConflicts()
    {
        return _registered
            .SelectMany(pair => pair.Value.Select(entry => (Owner: pair.Key, entry.Signature)))
            .GroupBy(item => item.Signature, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Select(item => item.Owner).Distinct(StringComparer.OrdinalIgnoreCase).Count() > 1)
            .Select(group => string.Join(" vs ", group.Select(item => item.Owner).Distinct(StringComparer.OrdinalIgnoreCase)))
            .ToList();
    }

    private void RecordConflict(string conflict)
    {
        if (!_activeConflicts.Contains(conflict, StringComparer.Ordinal))
        {
            _activeConflicts.Add(conflict);
        }
    }

    private static string FormatSignature(uint modifiers, uint virtualKey) =>
        $"{modifiers:X}:{virtualKey:X}";

    private readonly record struct RegisteredHotkey(int HotkeyId, string Signature);
}
