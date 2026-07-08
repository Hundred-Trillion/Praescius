/**
 * Settings Panel Controller.
 */
import { clearDatabase } from '../../storage/db.js';
import { getUIStore } from './UIState.js';

export function initInstantAIConfig() {
  const keyInput = document.getElementById('popup-api-key');
  const tgTokenInput = document.getElementById('popup-tg-token');
  const tgChatIdInput = document.getElementById('popup-tg-chatid');
  const tgMetric = document.getElementById('metric-telegram');

  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || {};
    if (keyInput) keyInput.value = settings.geminiKey || '';
    if (tgTokenInput) tgTokenInput.value = settings.telegramToken || '';
    if (tgChatIdInput) tgChatIdInput.value = settings.telegramChatId || '';
    
    if (tgMetric) {
      tgMetric.textContent = (settings.telegramToken && settings.telegramChatId) ? 'Connected' : 'Disconnected';
      tgMetric.style.color = (settings.telegramToken && settings.telegramChatId) ? 'var(--success)' : 'var(--text-muted)';
    }
  });

  const saveSettings = () => {
    chrome.storage.local.get(['settings'], (res) => {
      const settings = res.settings || {};
      if (keyInput) settings.geminiKey = keyInput.value.trim();
      if (tgTokenInput) settings.telegramToken = tgTokenInput.value.trim();
      if (tgChatIdInput) settings.telegramChatId = tgChatIdInput.value.trim();
      chrome.storage.local.set({ settings });

      if (tgMetric) {
        tgMetric.textContent = (settings.telegramToken && settings.telegramChatId) ? 'Connected' : 'Disconnected';
        tgMetric.style.color = (settings.telegramToken && settings.telegramChatId) ? 'var(--success)' : 'var(--text-muted)';
      }
    });
  };

  if (keyInput) keyInput.addEventListener('input', saveSettings);
  if (tgTokenInput) tgTokenInput.addEventListener('input', saveSettings);
  if (tgChatIdInput) tgChatIdInput.addEventListener('input', saveSettings);
}

export async function handleClearDB() {
  if (!confirm('Are you sure you want to delete all stored candles and application logs?')) return;
  try {
    const { db } = await getUIStore();
    await clearDatabase(db);
    alert('Database successfully cleared.');
  } catch (err) {
    alert(`Failed to clear database: ${err.message}`);
  }
}
