/**
 * PixiJS engine profiling inspector.
 */

export function profilePixiJS() {
  const report = {
    isPixiPresent: false,
    version: null
  };

  try {
    if (window.PIXI) {
      report.isPixiPresent = true;
      report.version = window.PIXI.VERSION || 'Detected (Global)';
    } else if (window.__PIXI_SHARE_CONTEXT__) {
      report.isPixiPresent = true;
      report.version = 'Detected (Shared Context)';
    } else {
      // Search Script Tags
      const scripts = Array.from(document.querySelectorAll('script'))
        .map(s => s.src.toLowerCase())
        .filter(src => src);
        
      if (scripts.some(src => src.includes('pixi'))) {
        report.isPixiPresent = true;
        report.version = 'Detected (Script Tag)';
      }
    }
  } catch (err) {
    report.error = err.message;
  }

  return report;
}
