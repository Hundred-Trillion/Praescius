/**
 * Desktop notifications manager.
 */

/**
 * Shows a system desktop notification.
 * @param {string} title 
 * @param {string} message 
 * @param {string} iconUrl - Optional local icon path
 */
export function showNotification(title, message, iconUrl = '../icons/icon128.png') {
  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || {};

    if (settings.telegramToken && settings.telegramChatId) {
      const url = `https://api.telegram.org/bot${settings.telegramToken}/sendMessage`;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: settings.telegramChatId, text: `${title}\n\n${message}` })
      }).catch(err => console.error('[Telegram Error]:', err));
    }

    if (settings.notificationsEnabled === false) return;

    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: iconUrl,
        title: title,
        message: message,
        priority: 2,
        requireInteraction: true
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error('[Notifier] Notification Error:', chrome.runtime.lastError);
        }
      });
    } else if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body: message, icon: iconUrl });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(title, { body: message, icon: iconUrl });
          }
        });
      }
    }
  });
}
