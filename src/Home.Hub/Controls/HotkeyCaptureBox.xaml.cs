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
    private static readonly SolidColorBrush FallbackIdleBorderBrush = new(ColorHelper.FromArgb(0x18, 0xFF, 0xFF, 0xFF));
    private static readonly SolidColorBrush FallbackRecordingBorderBrush = new(ColorHelper.FromArgb(0xFF, 0x60, 0xCD, 0xFF));
    private static readonly SolidColorBrush FallbackRecordingBackgroundBrush = new(ColorHelper.FromArgb(0xFF, 0x24, 0x24, 0x24));
    private static readonly SolidColorBrush FallbackIdleBackgroundBrush = new(ColorHelper.FromArgb(0x0F, 0xFF, 0xFF, 0xFF));

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
        DisplayText.Text = HotkeyParser.Format(modifiers, virtualKey);
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
        _savedDisplay = DisplayText.Text;
        _savedModifiers = _modifiers;
        _savedVirtualKey = _virtualKey;
        _savedHasValue = _hasValue;
        DisplayText.Text = "Press shortcut...";
        CaptureButton.BorderBrush = GetThemeBrush("FocusStrokeBrush", FallbackRecordingBorderBrush);
        CaptureButton.Background = GetThemeBrush("ControlFillPressedBrush", FallbackRecordingBackgroundBrush);
    }

    private void OnLostFocus(object sender, RoutedEventArgs e)
    {
        _isRecording = false;
        CaptureButton.BorderBrush = FallbackIdleBorderBrush;
        CaptureButton.Background = FallbackIdleBackgroundBrush;

        if (!_hasValue)
        {
            DisplayText.Text = _savedDisplay;
            return;
        }

        DisplayText.Text = HotkeyParser.Format(_modifiers, _virtualKey);
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
            DisplayText.Text = _savedDisplay;
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
            DisplayText.Text = activeModifiers == 0
                ? "Press shortcut..."
                : $"{HotkeyParser.FormatModifiers(activeModifiers)}+...";
            return;
        }

        if (!HotkeyCaptureHelper.TryCapture(e.Key, out var modifiers, out var virtualKey, out var error))
        {
            DisplayText.Text = error;
            return;
        }

        _modifiers = modifiers;
        _virtualKey = virtualKey;
        _hasValue = true;
        DisplayText.Text = HotkeyParser.Format(modifiers, virtualKey);
    }

    private void OnCaptureClicked(object sender, RoutedEventArgs e)
    {
        CaptureButton.Focus(FocusState.Pointer);
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
