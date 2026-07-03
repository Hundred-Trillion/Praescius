/**
 * Global variables profiling inspector.
 */

export function profileGlobals() {
  const report = {
    hasCocos: false,
    hasThreeJS: false,
    hasHighcharts: false,
    hasTradingView: false,
    pageTitle: '',
    hostname: ''
  };

  try {
    report.hasCocos = typeof window.cc !== 'undefined';
    report.hasThreeJS = typeof window.THREE !== 'undefined';
    report.hasHighcharts = typeof window.Highcharts !== 'undefined';
    report.hasTradingView = typeof window.TradingView !== 'undefined';
    report.pageTitle = document.title || '';
    report.hostname = window.location.hostname || '';
  } catch (err) {
    report.error = err.message;
  }

  return report;
}
