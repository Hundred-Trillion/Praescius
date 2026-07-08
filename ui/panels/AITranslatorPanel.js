/**
 * AI Translator Panel Controller.
 */
import { renderRules } from './StrategyPanel.js';

export function handleCreateRule() {
  const input = document.getElementById('prompt-input');
  const button = document.getElementById('btn-create-rule');
  const status = document.getElementById('prompt-status');

  const text = input ? input.value.trim() : '';
  if (!text || !button || !status) return;

  button.disabled = true;
  button.textContent = 'Setting Notification Rule...';
  status.style.display = 'block';
  status.style.color = 'var(--primary)';
  status.textContent = 'Analyzing rule logic...';

  chrome.runtime.sendMessage({
    action: 'TRANSLATE_RULE',
    prompt: text
  }, (response) => {
    button.disabled = false;
    button.textContent = 'Set Notification Rule';

    if (chrome.runtime.lastError || !response || !response.success) {
      status.style.color = 'var(--danger)';
      status.textContent = `Error: ${response?.error || 'Failed to parse AI output.'}`;
      return;
    }

    const compiledRule = response.rule;
    compiledRule.originalPrompt = text;

    chrome.storage.local.get(['rules'], (res) => {
      const rules = res.rules || [];
      rules.push(compiledRule);
      chrome.storage.local.set({ rules: rules }, () => {
        status.style.color = 'var(--success)';
        status.textContent = `Rule "${compiledRule.name}" compiled and saved successfully!`;
        if (input) input.value = '';
        renderRules();

        setTimeout(() => {
          status.style.display = 'none';
        }, 3000);
      });
    });
  });
}
