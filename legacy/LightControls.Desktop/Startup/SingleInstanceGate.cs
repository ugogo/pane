using System.Threading;

namespace LightControls.Desktop.Startup;

internal sealed class SingleInstanceGate : IDisposable
{
    private const string MutexName = "LightControls.Desktop.SingleInstance";
    private const string ActivateEventName = "LightControls.Desktop.Activate";

    private readonly Mutex _mutex;
    private EventWaitHandle? _activateEvent;
    private RegisteredWaitHandle? _activationWait;

    private SingleInstanceGate(Mutex mutex)
    {
        _mutex = mutex;
        _activateEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ActivateEventName);
    }

    public static bool TryAcquire(out SingleInstanceGate? gate)
    {
        var mutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);
        if (!createdNew)
        {
            mutex.Dispose();
            gate = null;
            return false;
        }

        gate = new SingleInstanceGate(mutex);
        return true;
    }

    public static void RequestActivation()
    {
        try
        {
            using var activateEvent = EventWaitHandle.OpenExisting(ActivateEventName);
            activateEvent.Set();
        }
        catch
        {
        }
    }

    public void ListenForActivationRequests(Action onActivate)
    {
        if (_activateEvent is null)
        {
            return;
        }

        _activationWait = ThreadPool.RegisterWaitForSingleObject(
            _activateEvent,
            (_, timedOut) =>
            {
                if (!timedOut)
                {
                    onActivate();
                }
            },
            null,
            Timeout.Infinite,
            executeOnlyOnce: false);
    }

    public void Dispose()
    {
        _activationWait?.Unregister(null);
        _activationWait = null;
        _activateEvent?.Dispose();
        _activateEvent = null;
        _mutex.ReleaseMutex();
        _mutex.Dispose();
    }
}
