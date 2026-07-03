/**
 * Decoupled event-driven message bus.
 * Manages publisher/subscriber subscriptions to promote modular flexibility.
 */

class EventBus {
  constructor() {
    this.listeners = {};
  }

  /**
   * Register an event listener callback.
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe trigger function
   */
  subscribe(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => this.unsubscribe(event, callback);
  }

  /**
   * Unregister an event listener.
   */
  unsubscribe(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  /**
   * Broadcast an event message payload.
   * @param {string} event - Event name
   * @param {any} data - Event parameters
   */
  publish(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`[EventBus] Subscriber failed on event: ${event}`, err);
      }
    });
  }
}

export const eventBus = new EventBus();
export default eventBus;
