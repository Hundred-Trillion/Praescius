/**
 * System State Machine.
 * Serves as the single source of truth for execution states, orchestrating transition validations.
 */

import { eventBus } from './eventBus.js';

class StateMachine {
  constructor() {
    this.currentState = 'OFFLINE';
    this.allowedStates = ['OFFLINE', 'CONNECTING', 'LIVE_WS', 'LIVE_DOM', 'REPLAY', 'ERROR'];
  }

  /**
   * Returns current active state.
   * @returns {'OFFLINE' | 'CONNECTING' | 'LIVE_WS' | 'LIVE_DOM' | 'REPLAY' | 'ERROR'}
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * Transition state with event pub/sub trigger dispatch.
   * @param {string} newState 
   * @returns {boolean} Success value
   */
  transitionTo(newState) {
    if (!this.allowedStates.includes(newState)) {
      console.warn(`[StateMachine] Invalid state transition target: ${newState}`);
      return false;
    }

    if (this.currentState === newState) return false;

    const oldState = this.currentState;
    this.currentState = newState;

    console.log(`[StateMachine] Transition: ${oldState} -> ${newState}`);

    // Dispatch transition events to event bus
    eventBus.publish('system.state.changed.v1', {
      from: oldState,
      to: newState,
      timestamp: Date.now()
    });

    eventBus.publish('system.logs.v1', {
      message: `System state transitioned from ${oldState} to ${newState}`,
      type: 'info'
    });

    return true;
  }
}

export const stateMachine = new StateMachine();
export default stateMachine;
