using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Home.Hub.Controls;

public sealed partial class HubTextField : UserControl
{
    public static readonly DependencyProperty LabelProperty =
        DependencyProperty.Register(
            nameof(Label),
            typeof(string),
            typeof(HubTextField),
            new PropertyMetadata(string.Empty, OnLabelChanged));

    public static readonly DependencyProperty TextProperty =
        DependencyProperty.Register(
            nameof(Text),
            typeof(string),
            typeof(HubTextField),
            new PropertyMetadata(string.Empty, OnTextChanged));

    public static readonly DependencyProperty PlaceholderTextProperty =
        DependencyProperty.Register(
            nameof(PlaceholderText),
            typeof(string),
            typeof(HubTextField),
            new PropertyMetadata(string.Empty, OnPlaceholderTextChanged));

    public static readonly DependencyProperty IsReadOnlyProperty =
        DependencyProperty.Register(
            nameof(IsReadOnly),
            typeof(bool),
            typeof(HubTextField),
            new PropertyMetadata(false, OnIsReadOnlyChanged));

    public HubTextField()
    {
        InitializeComponent();
        InputBox.TextChanged += (_, _) =>
        {
            if (InputBox.Text != Text)
            {
                Text = InputBox.Text;
            }
        };
    }

    public string Label
    {
        get => (string)GetValue(LabelProperty);
        set => SetValue(LabelProperty, value);
    }

    public string Text
    {
        get => (string)GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public string PlaceholderText
    {
        get => (string)GetValue(PlaceholderTextProperty);
        set => SetValue(PlaceholderTextProperty, value);
    }

    public bool IsReadOnly
    {
        get => (bool)GetValue(IsReadOnlyProperty);
        set => SetValue(IsReadOnlyProperty, value);
    }

    private static void OnLabelChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not HubTextField field)
        {
            return;
        }

        var label = e.NewValue as string ?? string.Empty;
        field.LabelBlock.Text = label;
        field.LabelBlock.Visibility = string.IsNullOrWhiteSpace(label)
            ? Visibility.Collapsed
            : Visibility.Visible;
    }

    private static void OnTextChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not HubTextField field)
        {
            return;
        }

        var text = e.NewValue as string ?? string.Empty;
        if (field.InputBox.Text != text)
        {
            field.InputBox.Text = text;
        }
    }

    private static void OnPlaceholderTextChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is HubTextField field)
        {
            field.InputBox.PlaceholderText = e.NewValue as string ?? string.Empty;
        }
    }

    private static void OnIsReadOnlyChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is HubTextField field)
        {
            field.InputBox.IsReadOnly = (bool)e.NewValue;
        }
    }
}
