/**
 * Alert and Terminal Logs Panel Controller.
 */

const rawWSBuffer = [];
const parsedCandleBuffer = [];
const BUFFER_LIMIT = 10;

export function updateLogs(logs) {
  const terminal = document.getElementById('console-logs');
  if (!terminal || !logs || logs.length === 0) return;

  terminal.innerHTML = '';
  logs.slice(0, 8).reverse().forEach(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-line ${log.type}`;
    div.textContent = `[${time}] ${log.message}`;
    terminal.appendChild(div);
  });
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
  const terminal = document.getElementById('parsed-candles-logs');
  if (!terminal || !candle) return;

  parsedCandleBuffer.push({
    time: new Date(candle.timestamp).toLocaleTimeString(),
    text: `Symbol: ${candle.symbol} | Price: ${candle.price} | TF: ${candle.timeframe} | Source: ${candle.source}`
  });

  if (parsedCandleBuffer.length > BUFFER_LIMIT) {
    parsedCandleBuffer.shift();
  }

  terminal.innerHTML = '';
  parsedCandleBuffer.slice().reverse().forEach(c => {
    const div = document.createElement('div');
    div.className = 'log-line info';
    div.textContent = `[${c.time}] ${c.text}`;
    terminal.appendChild(div);
  });
}
