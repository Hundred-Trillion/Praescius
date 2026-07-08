/**
 * Settings Panel Controller.
 */
import { clearDatabase } from '../../storage/db.js';
import { getUIStore } from './UIState.js';

export function initInstantAIConfig() {
  const keyInput = document.getElementById('popup-api-key');
  if (!keyInput) return;

  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || {};
    keyInput.value = settings.geminiKey || '';
  });

  keyInput.addEventListener('input', () => {
    const key = keyInput.value.trim();
    chrome.storage.local.get(['settings'], (res) => {
      const settings = res.settings || {};
      settings.geminiKey = key;
      chrome.storage.local.set({ settings });
    });
  });
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
