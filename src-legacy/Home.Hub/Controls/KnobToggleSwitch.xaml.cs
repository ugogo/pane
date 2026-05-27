using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace Home.Hub.Controls;

public sealed partial class KnobToggleSwitch : UserControl
{
    private static readonly SolidColorBrush TrackOnBrush = new(Color.FromArgb(255, 184, 245, 58));
    private static readonly SolidColorBrush TrackOffBrush = new(Color.FromArgb(51, 255, 255, 255));
    private static readonly SolidColorBrush TrackOnBorderBrush = new(Color.FromArgb(255, 184, 245, 58));
    private static readonly SolidColorBrush TrackOffBorderBrush = new(Color.FromArgb(68, 255, 255, 255));

    private bool _isOn;
    private bool _isEnabled = true;

    public KnobToggleSwitch()
    {
        InitializeComponent();
        UpdateVisual(false);
    }

    public event EventHandler<bool>? Toggled;

    public bool IsOn
    {
        get => _isOn;
        set
        {
            if (_isOn == value)
            {
                return;
            }

            _isOn = value;
            UpdateVisual(animate: false);
        }
    }

    public new bool IsEnabled
    {
        get => _isEnabled;
        set
        {
            _isEnabled = value;
            Opacity = value ? 1 : 0.45;
            IsHitTestVisible = value;
        }
    }

    private void OnTapped(object sender, TappedRoutedEventArgs e)
    {
        if (!_isEnabled)
        {
            return;
        }

        _isOn = !_isOn;
        UpdateVisual(animate: true);
        Toggled?.Invoke(this, _isOn);
    }

    private void UpdateVisual(bool animate)
    {
        Track.Background = _isOn ? TrackOnBrush : TrackOffBrush;
        Track.BorderBrush = _isOn ? TrackOnBorderBrush : TrackOffBorderBrush;
        KnobTransform.X = _isOn ? 22 : 0;
        Opacity = _isEnabled ? 1 : 0.45;
    }
}
