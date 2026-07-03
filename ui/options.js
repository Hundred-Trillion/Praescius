/**
 * Options page controller.
 * Manages system properties and checks configuration conditions.
 */

document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('ai-provider');
  const geminiGroup = document.getElementById('gemini-key-group');
  const openaiGroup = document.getElementById('openai-key-group');

  const geminiKeyInput = document.getElementById('api-key-gemini');
  const openaiKeyInput = document.getElementById('api-key-openai');
  
  const notifyCheck = document.getElementById('toggle-notifications');
  const loggingCheck = document.getElementById('toggle-logging');

  const saveBtn = document.getElementById('btn-save-settings');
  const testBtn = document.getElementById('btn-test-notification');
  const statusSpan = document.getElementById('save-status');

  // 1. Load initial settings
  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || {};
    
    providerSelect.value = settings.aiProvider || 'local';
    geminiKeyInput.value = settings.geminiKey || '';
    openaiKeyInput.value = settings.openaiKey || '';
    notifyCheck.checked = settings.notificationsEnabled !== false;
    loggingCheck.checked = settings.loggingEnabled !== false;

    updateKeyFieldVisibility(providerSelect.value);
  });

  // 2. Handle provider switches
  providerSelect.addEventListener('change', () => {
    updateKeyFieldVisibility(providerSelect.value);
  });

  // 3. Save settings handler
  saveBtn.addEventListener('click', () => {
    const updatedSettings = {
      aiProvider: providerSelect.value,
      geminiKey: geminiKeyInput.value.trim(),
      openaiKey: openaiKeyInput.value.trim(),
      notificationsEnabled: notifyCheck.checked,
      loggingEnabled: loggingCheck.checked
    };

    chrome.storage.local.set({ settings: updatedSettings }, () => {
      // Show saved feedback status
      statusSpan.style.display = 'inline';
      statusSpan.style.color = 'var(--success)';
      statusSpan.textContent = 'Settings saved!';
      
      setTimeout(() => {
        statusSpan.style.display = 'none';
      }, 2500);
    });
  });

  // 4. Test Notification handler
  testBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'TEST_NOTIFICATION' }, (res) => {
      if (chrome.runtime.lastError || !res || !res.success) {
        alert('Verification request failed. Ensure background page is active.');
      }
    });
  });

  /**
   * Helper toggling active status fields.
   */
  function updateKeyFieldVisibility(provider) {
    geminiGroup.classList.remove('active');
    openaiGroup.classList.remove('active');

    if (provider === 'gemini') {
      geminiGroup.classList.add('active');
    } else if (provider === 'openai') {
      openaiGroup.classList.add('active');
    }
  }
});
