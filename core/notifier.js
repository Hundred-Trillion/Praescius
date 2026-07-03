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
  // Fallback if chrome.notifications is not available in standard environments
  if (typeof chrome !== 'undefined' && chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: iconUrl,
      title: title,
      message: message,
      priority: 2, // High priority
      requireInteraction: true // Stays until clicked/dismissed
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error('[Notifier] Notification Error:', chrome.runtime.lastError);
      } else {
        console.log('[Notifier] Sent alert id:', notificationId);
      }
    });
  } else {
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
