using System.Diagnostics.CodeAnalysis;
using System.Threading;

namespace Home.Windows;

public sealed class SingleInstanceGate : IDisposable
{
    private readonly Mutex _mutex;
    private EventWaitHandle? _activateEvent;
    private RegisteredWaitHandle? _activationWait;

    private SingleInstanceGate(Mutex mutex, string activateEventName)
    {
        _mutex = mutex;
        _activateEvent = new EventWaitHandle(false, EventResetMode.AutoReset, activateEventName);
    }

    public static bool TryAcquire(string mutexName, string activateEventName, [NotNullWhen(true)] out SingleInstanceGate? gate)
    {
        var mutex = new Mutex(initiallyOwned: true, mutexName, out var createdNew);
        if (!createdNew)
        {
            mutex.Dispose();
            gate = null;
            return false;
        }

        gate = new SingleInstanceGate(mutex, activateEventName);
        return true;
    }

    public static void RequestActivation(string activateEventName)
    {
        try
        {
            using var activateEvent = EventWaitHandle.OpenExisting(activateEventName);
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
