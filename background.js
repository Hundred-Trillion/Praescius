/**
 * Background Service Worker (V3 Orchestrator).
 * Delegates logic to specialized background modules to improve modularity and maintainability.
 */

import { startup, registerLifecycle } from './background/lifecycle.js';
import { registerEventHandlers } from './background/eventHandlers.js';
import { handleRuntimeMessage } from './background/router.js';

// 1. Run initialization tasks
startup();

// 2. Bind listeners for extension startup, updates, and action clicks
registerLifecycle();

// 3. Register Event Bus message handlers
registerEventHandlers();

// 4. Attach Message Routing channel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message, sender, sendResponse);
  return true;
});
