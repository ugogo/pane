using Home.Core.Modules;
using LightControls.Core.Models;

namespace Home.Hub.ViewModels;

public sealed class LightControlsPageViewModel
{
    private readonly LightControlsModule _module;

    public LightControlsPageViewModel(LightControlsModule module)
    {
        _module = module;
    }

    public LightControlsModule Module => _module;

    public IReadOnlyList<string> BuiltInSwatches => ColorSwatches.BuiltIn;

    public IReadOnlyList<string> RecentCustomSwatches => _module.Settings.RecentCustomColors;
}
