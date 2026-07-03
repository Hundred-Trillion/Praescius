/**
 * Global variables profiling inspector.
 */

export function profileGlobals() {
  const report = {
    hasCocos: typeof window.cc !== 'undefined',
    hasThreeJS: typeof window.THREE !== 'undefined',
    hasHighcharts: typeof window.Highcharts !== 'undefined',
    hasTradingView: typeof window.TradingView !== 'undefined',
    pageTitle: document.title,
    hostname: window.location.hostname
  };

  return report;
}
