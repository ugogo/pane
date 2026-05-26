# AGENTS.md

## Stack

This is a Windows desktop utility suite built with .NET, WinUI 3, Windows App SDK, XAML, and CommunityToolkit.Mvvm.

Primary UI projects:
- `src/Home.Hub`
- `src/Home.UI`
- `src/CleanShot.WinUI`

Shared theme resources are imported through:
- `src/Home.UI/Themes/HomeTheme.xaml`

## UI Rules

Before changing styling, inspect `HomeTheme.xaml` and nearby XAML.

Prefer existing resources:
- Brushes: use named theme brushes, not raw hex colors.
- Font sizes: use theme font resources.
- Spacing: use existing page padding, margins, and control patterns.
- Radii: use `RadiusSmall`, `RadiusMedium`, and `RadiusLarge`.

Do not introduce one-off styling unless there is no existing resource or pattern.

## Layout Rules

Avoid nesting XAML elements as much as possible. Prefer styling, reusable control templates, and shared resources over adding wrapper `Border`, `Grid`, or `StackPanel` layers for visual effects.

Use WinUI layout primitives predictably:
- `Grid` for page structure.
- `StackPanel` for simple vertical or horizontal groups.
- `ItemsRepeater`, `ListView`, or `GridView` for repeated content.
- Styles and control templates for chrome, states, and repeated visual treatment.

Text must not clip or overlap at common window sizes.

## Components

Prefer existing custom controls:
- `HubSidebar`
- `HubTextField`
- `HubNumberField`
- `HotkeyCaptureBox`
- `KnobToggleSwitch`
- `AppLogoMark`
- `AmbientGlowLayer`

If a new pattern appears more than once, create or extend a reusable control or style instead of duplicating XAML.

## Visual Direction

The app should feel like a premium Windows desktop utility:
- polished
- calm
- dense but readable
- fast to scan
- responsive and deliberate
- not like a landing page
- not overly decorative

Premium means the experience should feel carefully composed, not just functional. Use consistent spacing, clear hierarchy, restrained motion, high-quality interaction states, and controls that feel intentional.

Avoid adding hero sections, marketing copy, oversized cards, random gradients, or raw color palettes.

## Verification

For styling changes:
- Build the solution.
- Run the relevant app when possible.
- Check light and dark theme impact if resources changed.
- Mention any UI verification that could not be performed.

## Git

Use Conventional Commits for commit messages, such as `feat: add capture delay setting` or `fix: prevent hotkey overlap`.

Do not add co-author trailers or agent attribution, including `Co-authored-by` lines.
