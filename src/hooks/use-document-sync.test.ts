import { act, renderHook } from '@testing-library/react-native';
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';
import { initializeMockSession, signOut, type Session } from '@/api/auth';
import { useDocumentSync } from '@/hooks/use-document-sync';

test('polling survives rerenders, switches sessions, and stops on unmount', async () => {
  await signOut();
  jest.useFakeTimers();
  jest.mocked(NetInfo.fetch).mockResolvedValue({ type: NetInfoStateType.none, isConnected: false, isInternetReachable: false, details: null });
  try {
    const session = await initializeMockSession();
    const intervals = jest.spyOn(globalThis, 'setInterval');
    const hook = await renderHook(({ account }: { account: Session }) => useDocumentSync(account), {
      initialProps: { account: session },
    });
    await hook.rerender({ account: session });
    jest.mocked(NetInfo.fetch).mockRejectedValueOnce(new Error('Network unavailable'));
    await act(async () => { await hook.result.current.sync(); });
    expect(hook.result.current.syncError).toBe('Network unavailable');
    expect(intervals.mock.calls.filter(([, delay]) => delay === 30_000)).toHaveLength(1);
    await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
    expect(hook.result.current.syncError).toBeNull();
    await signOut();
    await hook.rerender({ account: await initializeMockSession('new-worker') });
    expect(intervals.mock.calls.filter(([, delay]) => delay === 30_000)).toHaveLength(2);
    await hook.unmount();
    const calls = jest.mocked(NetInfo.fetch).mock.calls.length;
    await act(async () => { await jest.advanceTimersByTimeAsync(60_000); });
    expect(NetInfo.fetch).toHaveBeenCalledTimes(calls);
  } finally { jest.useRealTimers(); }
});
