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
        } else {
          console.log('[Notifier] Sent alert id:', notificationId);
        }
      });
    } else {
      console.warn(`[Notifier Fallback] ${title}: ${message}`);
      if (Notification.permission === 'granted') {
        new Notification(title, { body: message, icon: iconUrl });
      }
    }
  });
    // Fallback if not inside extension context or permissions are missing
    console.warn(`[Notifier Fallback] ${title}: ${message}`);
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
}
