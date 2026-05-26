using CleanShot.Core.Services;
using CleanShot.WinUI.Helpers;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;

namespace Home.Hub.Controls;

public sealed partial class HotkeyCaptureBox : UserControl
{
    private static readonly SolidColorBrush FallbackIdleBorderBrush = new(ColorHelper.FromArgb(0x40, 0xFF, 0xFF, 0xFF));
    private static readonly SolidColorBrush FallbackRecordingBorderBrush = new(ColorHelper.FromArgb(0xFF, 0x60, 0xCD, 0xFF));
    private static readonly SolidColorBrush FallbackRecordingBackgroundBrush = new(ColorHelper.FromArgb(0xFF, 0x24, 0x24, 0x24));
    private static readonly SolidColorBrush FallbackIdleBackgroundBrush = new(ColorHelper.FromArgb(0xFF, 0x32, 0x32, 0x32));

    private string _savedDisplay = string.Empty;
    private uint _savedModifiers;
    private uint _savedVirtualKey;
    private bool _savedHasValue;
    private uint _modifiers;
    private uint _virtualKey;
    private bool _hasValue;
    private bool _isRecording;

    public HotkeyCaptureBox()
    {
        InitializeComponent();
    }

    public event EventHandler? EnterPressed;

    public void SetHotkey(uint modifiers, uint virtualKey)
    {
        _modifiers = modifiers;
        _virtualKey = virtualKey;
        _hasValue = true;
        InputBox.Text = HotkeyParser.Format(modifiers, virtualKey);
    }

    public bool TryGetHotkey(out uint modifiers, out uint virtualKey, out string error)
    {
        modifiers = _modifiers;
        virtualKey = _virtualKey;
        error = string.Empty;

        if (!_hasValue)
        {
            error = "Record a shortcut first.";
            return false;
        }

        if (_modifiers == 0)
        {
            error = "Include at least one modifier (Ctrl, Shift, Alt, or Win).";
            return false;
        }

        return true;
    }

    private void OnGotFocus(object sender, RoutedEventArgs e)
    {
        _isRecording = true;
        _savedDisplay = InputBox.Text;
        _savedModifiers = _modifiers;
        _savedVirtualKey = _virtualKey;
        _savedHasValue = _hasValue;
        InputBox.Text = "Press shortcut…";
        RootBorder.BorderBrush = GetThemeBrush("FocusStrokeBrush", FallbackRecordingBorderBrush);
        RootBorder.Background = GetThemeBrush("ControlFillPressedBrush", FallbackRecordingBackgroundBrush);
    }

    private void OnLostFocus(object sender, RoutedEventArgs e)
    {
        _isRecording = false;
        RootBorder.BorderBrush = GetThemeBrush("ControlStrokeStrongBrush", FallbackIdleBorderBrush);
        RootBorder.Background = GetThemeBrush("ControlFillBrush", FallbackIdleBackgroundBrush);

        if (!_hasValue)
        {
            InputBox.Text = _savedDisplay;
            return;
        }

        InputBox.Text = HotkeyParser.Format(_modifiers, _virtualKey);
    }

    private void OnPreviewKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (!_isRecording)
        {
            e.Handled = true;
            return;
        }

        if (e.Key == VirtualKey.Tab)
        {
            return;
        }

        if (e.Key == VirtualKey.Escape)
        {
            RestoreSavedHotkey();
            InputBox.Text = _savedDisplay;
            e.Handled = true;
            return;
        }

        if (e.Key == VirtualKey.Enter)
        {
            e.Handled = true;
            EnterPressed?.Invoke(this, EventArgs.Empty);
            return;
        }

        e.Handled = true;

        if (HotkeyCaptureHelper.IsModifierKey(e.Key))
        {
            var activeModifiers = HotkeyCaptureHelper.ReadActiveModifiers();
            InputBox.Text = activeModifiers == 0
                ? "Press shortcut…"
                : $"{HotkeyParser.FormatModifiers(activeModifiers)}+…";
            return;
        }

        if (!HotkeyCaptureHelper.TryCapture(e.Key, out var modifiers, out var virtualKey, out var error))
        {
            InputBox.Text = error;
            return;
        }

        _modifiers = modifiers;
        _virtualKey = virtualKey;
        _hasValue = true;
        InputBox.Text = HotkeyParser.Format(modifiers, virtualKey);
    }

    private void OnCharacterReceived(UIElement sender, CharacterReceivedRoutedEventArgs args)
    {
        args.Handled = true;
    }

    private void RestoreSavedHotkey()
    {
        _modifiers = _savedModifiers;
        _virtualKey = _savedVirtualKey;
        _hasValue = _savedHasValue;
    }

    private SolidColorBrush GetThemeBrush(string key, SolidColorBrush fallback)
    {
        if (Resources.TryGetValue(key, out var localValue) && localValue is SolidColorBrush localBrush)
        {
            return localBrush;
        }

        if (Application.Current.Resources.TryGetValue(key, out var appValue) && appValue is SolidColorBrush appBrush)
        {
            return appBrush;
        }

        return fallback;
    }
}
