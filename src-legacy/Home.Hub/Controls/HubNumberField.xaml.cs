using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Home.Hub.Controls;

public sealed partial class HubNumberField : UserControl
{
    public static readonly DependencyProperty LabelProperty =
        DependencyProperty.Register(
            nameof(Label),
            typeof(string),
            typeof(HubNumberField),
            new PropertyMetadata(string.Empty, OnLabelChanged));

    public static readonly DependencyProperty ValueProperty =
        DependencyProperty.Register(
            nameof(Value),
            typeof(double),
            typeof(HubNumberField),
            new PropertyMetadata(0d, OnValueChanged));

    public static readonly DependencyProperty MinimumProperty =
        DependencyProperty.Register(
            nameof(Minimum),
            typeof(double),
            typeof(HubNumberField),
            new PropertyMetadata(double.MinValue, OnMinimumChanged));

    public static readonly DependencyProperty MaximumProperty =
        DependencyProperty.Register(
            nameof(Maximum),
            typeof(double),
            typeof(HubNumberField),
            new PropertyMetadata(double.MaxValue, OnMaximumChanged));

    public static readonly DependencyProperty SpinButtonPlacementModeProperty =
        DependencyProperty.Register(
            nameof(SpinButtonPlacementMode),
            typeof(NumberBoxSpinButtonPlacementMode),
            typeof(HubNumberField),
            new PropertyMetadata(NumberBoxSpinButtonPlacementMode.Hidden, OnSpinButtonPlacementModeChanged));

    public HubNumberField()
    {
        InitializeComponent();
        InputBox.ValueChanged += (_, _) =>
        {
            if (InputBox.Value != Value)
            {
                Value = InputBox.Value;
            }
        };
    }

    public string Label
    {
        get => (string)GetValue(LabelProperty);
        set => SetValue(LabelProperty, value);
    }

    public double Value
    {
        get => (double)GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    public double Minimum
    {
        get => (double)GetValue(MinimumProperty);
        set => SetValue(MinimumProperty, value);
    }

    public double Maximum
    {
        get => (double)GetValue(MaximumProperty);
        set => SetValue(MaximumProperty, value);
    }

    public NumberBoxSpinButtonPlacementMode SpinButtonPlacementMode
    {
        get => (NumberBoxSpinButtonPlacementMode)GetValue(SpinButtonPlacementModeProperty);
        set => SetValue(SpinButtonPlacementModeProperty, value);
    }

    private static void OnLabelChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not HubNumberField field)
        {
            return;
        }

        var label = e.NewValue as string ?? string.Empty;
        field.LabelBlock.Text = label;
        field.LabelBlock.Visibility = string.IsNullOrWhiteSpace(label)
            ? Visibility.Collapsed
            : Visibility.Visible;
    }

    private static void OnValueChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is HubNumberField field && field.InputBox.Value != (double)e.NewValue)
        {
            field.InputBox.Value = (double)e.NewValue;
        }
    }

    private static void OnMinimumChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is HubNumberField field)
        {
            field.InputBox.Minimum = (double)e.NewValue;
        }
    }

    private static void OnMaximumChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is HubNumberField field)
        {
            field.InputBox.Maximum = (double)e.NewValue;
        }
    }

    private static void OnSpinButtonPlacementModeChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is HubNumberField field)
        {
            field.InputBox.SpinButtonPlacementMode = (NumberBoxSpinButtonPlacementMode)e.NewValue;
        }
    }
}
