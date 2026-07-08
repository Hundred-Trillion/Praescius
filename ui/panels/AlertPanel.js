/**
 * Alert and Terminal Logs Panel Controller.
 */

const rawWSBuffer = [];
const parsedCandleBuffer = [];
const BUFFER_LIMIT = 10;

export function updateLogs(logs) {
  const terminal = document.getElementById('console-logs');
  if (!terminal || !logs || logs.length === 0) return;

  logs.slice(0, 8).reverse().forEach(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const logText = `[${time}] ${log.message}`;
    
    // Check if this specific log is already in the terminal
    if (!terminal.innerHTML.includes(logText)) {
      if (terminal.innerHTML.includes('System observer logs loaded.')) {
        terminal.innerHTML = '';
      }
      const div = document.createElement('div');
      div.className = `log-line ${log.type}`;
      div.textContent = logText;
      terminal.appendChild(div);
    }
  });
  
  while (terminal.children.length > 50) {
    terminal.removeChild(terminal.firstChild);
  }
  terminal.scrollTop = terminal.scrollHeight;
}

export function appendRawFrameLog(payload) {
  const terminal = document.getElementById('raw-ws-logs');
  if (!terminal) return;
  
  rawWSBuffer.push({
    time: new Date().toLocaleTimeString(),
    data: typeof payload === 'string' ? payload.substring(0, 120) : '[Binary Stream Data]'
  });

  if (rawWSBuffer.length > BUFFER_LIMIT) {
    rawWSBuffer.shift();
  }

  terminal.innerHTML = '';
  rawWSBuffer.slice().reverse().forEach(frame => {
    const div = document.createElement('div');
    div.className = 'log-line';
    div.textContent = `[${frame.time}] ${frame.data}`;
    terminal.appendChild(div);
  });
}

export function appendParsedCandle(candle) {
  const terminal = document.getElementById('console-logs');
  if (!terminal || !candle) return;

  // Remove the default static text if it's there
  if (terminal.innerHTML.includes('System observer logs loaded.')) {
    terminal.innerHTML = '';
  }

  const time = new Date(candle.timestamp).toLocaleTimeString();
  const ohlc = `O:${candle.open.toFixed(5)} H:${candle.high.toFixed(5)} L:${candle.low.toFixed(5)} C:${candle.close.toFixed(5)}`;
  const logStr = `[${time}] ${candle.symbol} 1m CLOSE | ${ohlc} (Vol: ${candle.volume})`;
  
  // Prevent duplicate spam if market is completely frozen
  if (terminal.lastElementChild && terminal.lastElementChild.textContent === logStr) {
    return;
  }
  
  const div = document.createElement('div');
  div.className = 'log-line info';
  div.style.color = '#00FF66';
  div.textContent = logStr;
  
  terminal.appendChild(div);

  // Keep terminal from overflowing
  while (terminal.children.length > 20) {
    terminal.removeChild(terminal.firstChild);
  }
  
  terminal.scrollTop = terminal.scrollHeight;
}
