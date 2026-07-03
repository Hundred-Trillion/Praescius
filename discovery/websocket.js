/**
 * WebSocket profiling inspector.
 */

export function profileWebsocket() {
  const report = {
    hasNativeWebSocket: typeof window.WebSocket !== 'undefined',
    hasSocketIO: typeof window.io !== 'undefined',
    isHookActive: false
  };

  try {
    // Check if the current constructor represents our injected wrapper
    if (window.WebSocket && String(window.WebSocket).includes('HookedWebSocket')) {
      report.isHookActive = true;
    }
  } catch (err) {
    report.error = err.message;
  }

  return report;
}
