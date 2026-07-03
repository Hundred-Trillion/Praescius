/**
 * Canvas profiling inspector.
 */

export function profileCanvas() {
  const report = {
    canvasCount: 0,
    webglCount: 0,
    webgl2Count: 0,
    isRenderEnginePresent: false
  };

  try {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    report.canvasCount = canvases.length;

    canvases.forEach(canvas => {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        report.webglCount++;
        report.isRenderEnginePresent = true;
      }
      const gl2 = canvas.getContext('webgl2');
      if (gl2) {
        report.webgl2Count++;
        report.isRenderEnginePresent = true;
      }
    });
  } catch (err) {
    report.error = err.message;
  }

  return report;
}
