using LightControls.Core.Logitech.Hidpp20;
using LightControls.Core.Models;

namespace LightControls.Core.Logitech;

/// <summary>
/// Keeps an open HID++ session for the mouse and maintains RGB control while the app runs.
/// </summary>
internal sealed class LogitechMouseLightingHost : IDisposable
{
    private static readonly TimeSpan MaintainInterval = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan GhubFriendlyMaintainInterval = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan ListenInterval = TimeSpan.FromMilliseconds(500);
    private static readonly TimeSpan ReconnectDelay = TimeSpan.FromSeconds(1);
    private const int MaintainRetryCount = 3;
    private const int SessionResetFailureThreshold = 3;

    private readonly object _stateLock = new();
    private readonly AutoResetEvent _applyRequested = new(false);
    private readonly Thread _worker;

    private volatile bool _stop;
    private DeviceColorApply? _currentApply;
    private ApplyCompletion? _pendingCompletion;
    private Hidpp20Session? _session;
    private DateTime _lastMaintainUtc = DateTime.MinValue;
    private string? _lastError;
    private int _consecutiveMaintainFailures;

    public LogitechMouseLightingHost()
    {
        _worker = new Thread(WorkerLoop)
        {
            IsBackground = true,
            Name = "LogitechMouseLighting"
        };
        _worker.Start();
    }

    public bool HoldsOpenSession
    {
        get
        {
            lock (_stateLock)
            {
                return _session is not null;
            }
        }
    }

    public bool Apply(DeviceColorApply apply, out string? error, int timeoutMs = 8000)
    {
        var completion = new ApplyCompletion();
        lock (_stateLock)
        {
            _currentApply = apply;
            _pendingCompletion = completion;
        }

        _applyRequested.Set();

        if (!completion.Wait(timeoutMs))
        {
            error = "Timed out waiting for mouse lighting.";
            return false;
        }

        error = completion.Error;
        return completion.Succeeded;
    }

    public void Stop()
    {
        _stop = true;
        _applyRequested.Set();
    }

    public void Dispose()
    {
        Stop();
        _worker.Join(TimeSpan.FromSeconds(2));
        _applyRequested.Dispose();
    }

    private void WorkerLoop()
    {
        while (!_stop)
        {
            var completion = TakePendingCompletion();
            var apply = GetCurrentApply();

            if (apply is null)
            {
                if (_applyRequested.WaitOne(200))
                {
                    continue;
                }

                PollSession();
                continue;
            }

            if (!EnsureSession())
            {
                completion?.Complete(false, _lastError ?? "Mouse not found");
                Thread.Sleep(ReconnectDelay);
                continue;
            }

            var (succeeded, error) = ApplyToSession(apply, initial: completion is not null);
            if (succeeded)
            {
                _lastMaintainUtc = DateTime.UtcNow;
                _consecutiveMaintainFailures = 0;
            }
            else
            {
                ResetSession();
            }

            completion?.Complete(succeeded, error);

            ServiceOpenSession();
        }

        ResetSession(releaseControl: true);
    }

    private void ServiceOpenSession()
    {
        while (!_stop)
        {
            var apply = GetCurrentApply();
            if (apply is null || _session is null)
            {
                return;
            }

            var completion = TakePendingCompletion();
            if (completion is not null)
            {
                var (succeeded, error) = ApplyToSession(apply, initial: true);
                if (succeeded)
                {
                    _lastMaintainUtc = DateTime.UtcNow;
                    _consecutiveMaintainFailures = 0;
                }
                else
                {
                    ResetSession();
                }

                completion.Complete(succeeded, error);
                if (_session is null)
                {
                    return;
                }
            }

            if (_applyRequested.WaitOne((int)ListenInterval.TotalMilliseconds))
            {
                continue;
            }

            if (_session is null)
            {
                return;
            }

            if (ShouldMaintain(_session, apply))
            {
                if (TryMaintain(apply))
                {
                    _lastMaintainUtc = DateTime.UtcNow;
                }
                else if (++_consecutiveMaintainFailures >= SessionResetFailureThreshold)
                {
                    ResetSession();
                    return;
                }
            }
        }
    }

    private void PollSession()
    {
        var apply = GetCurrentApply();
        if (apply is null)
        {
            return;
        }

        if (_session is null)
        {
            if (!EnsureSession())
            {
                Thread.Sleep(ReconnectDelay);
            }

            return;
        }

        if (ShouldMaintain(_session, apply))
        {
            if (TryMaintain(apply))
            {
                _lastMaintainUtc = DateTime.UtcNow;
            }
            else if (++_consecutiveMaintainFailures >= SessionResetFailureThreshold)
            {
                ResetSession();
            }
        }
    }

    private bool ShouldMaintain(Hidpp20Session session, DeviceColorApply apply)
    {
        if (session.IsGhubFriendlyLighting)
        {
            return DateTime.UtcNow - _lastMaintainUtc >= GhubFriendlyMaintainInterval;
        }

        return ListenForNotifications(apply)
            || DateTime.UtcNow - _lastMaintainUtc >= MaintainInterval;
    }

    private bool TryMaintain(DeviceColorApply apply)
    {
        if (!MaintainColor(apply))
        {
            return false;
        }

        _consecutiveMaintainFailures = 0;
        return true;
    }

    private bool ListenForNotifications(DeviceColorApply apply)
    {
        Hidpp20Session? session;
        lock (_stateLock)
        {
            session = _session;
        }

        if (session is null || session.IsGhubFriendlyLighting)
        {
            return false;
        }

        var adjusted = apply.Color.WithBrightness(apply.BrightnessPercent);
        return session.TryHandleRgbNotifications(
            adjusted.Red,
            adjusted.Green,
            adjusted.Blue,
            maxReads: 1);
    }

    private bool MaintainColor(DeviceColorApply apply)
    {
        Hidpp20Session? session;
        lock (_stateLock)
        {
            session = _session;
        }

        if (session is null)
        {
            return false;
        }

        var adjusted = apply.Color.WithBrightness(apply.BrightnessPercent);
        for (var attempt = 0; attempt < MaintainRetryCount; attempt++)
        {
            if (session.TryMaintainPowerLedColor(adjusted.Red, adjusted.Green, adjusted.Blue))
            {
                return true;
            }

            if (attempt < MaintainRetryCount - 1)
            {
                Thread.Sleep(50);
            }
        }

        return false;
    }

    private bool EnsureSession()
    {
        lock (_stateLock)
        {
            if (_session is not null)
            {
                return true;
            }
        }

        if (!Hidpp20Session.TryOpen(out var session, out var error) || session is null)
        {
            _lastError = error;
            return false;
        }

        lock (_stateLock)
        {
            _session?.Dispose();
            _session = session;
            _lastError = null;
            return true;
        }
    }

    private (bool Succeeded, string? Error) ApplyToSession(DeviceColorApply apply, bool initial)
    {
        Hidpp20Session? session;
        lock (_stateLock)
        {
            session = _session;
        }

        if (session is null)
        {
            return (false, _lastError ?? "Mouse session is not open.");
        }

        var adjusted = apply.Color.WithBrightness(apply.BrightnessPercent);
        if (initial)
        {
            if (session.TrySetPowerLedColor(adjusted.Red, adjusted.Green, adjusted.Blue, out var error))
            {
                return (true, null);
            }

            _lastError = error;
            return (false, error ?? "Failed");
        }

        if (MaintainColor(apply))
        {
            return (true, null);
        }

        _lastError = "Failed to refresh mouse lighting.";
        return (false, _lastError);
    }

    private DeviceColorApply? GetCurrentApply()
    {
        lock (_stateLock)
        {
            return _currentApply;
        }
    }

    private ApplyCompletion? TakePendingCompletion()
    {
        lock (_stateLock)
        {
            var completion = _pendingCompletion;
            _pendingCompletion = null;
            return completion;
        }
    }

    private void ResetSession(bool releaseControl = false)
    {
        lock (_stateLock)
        {
            if (_session is null)
            {
                return;
            }

            if (releaseControl)
            {
                _session.TryReleaseRgbSoftwareControl();
            }

            _session.Dispose();
            _session = null;
        }
    }

    private sealed class ApplyCompletion
    {
        private readonly ManualResetEventSlim _completed = new(false);

        public bool Succeeded { get; private set; }

        public string? Error { get; private set; }

        public bool Wait(int timeoutMs) => _completed.Wait(timeoutMs);

        public void Complete(bool succeeded, string? error)
        {
            Succeeded = succeeded;
            Error = error;
            _completed.Set();
        }
    }
}
