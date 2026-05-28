/**
 * Simple Event Dispatcher for AI Systems
 * 
 * Provides a lightweight event system compatible with the inspiration code's
 * fire/on/off pattern, independent of the 3D engine's specific event system.
 */
class EventDispatcher {
    private _listeners: Map<string, Array<Function>> = new Map();

    /**
     * Subscribe to an event
     * @param event Event name
     * @param callback Function to call when event is fired
     * @param context Context (this) for the callback
     */
    on(event: string, callback: Function, context?: any): void {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }

        const listeners = this._listeners.get(event)!;
        listeners.push(context ? callback.bind(context) : callback);
    }

    /**
     * Unsubscribe from an event
     * @param event Event name
     * @param callback Callback to remove
     */
    off(event: string, callback: Function): void {
        const listeners = this._listeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Fire an event
     * @param event Event name
     * @param data Data to pass to listeners
     */
    fire(event: string, data?: any): void {
        const listeners = this._listeners.get(event);
        if (listeners) {
            // copy to avoid issues if listeners are added/removed during fire
            [...listeners].forEach(listener => listener(data));
        }
    }
}

export { EventDispatcher };
