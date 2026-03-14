export type SpacetimeListener<TArgs extends unknown[]> = (...args: TArgs) => void;

export class SpacetimeEvent<TArgs extends unknown[]> {
  private readonly listeners = new Set<SpacetimeListener<TArgs>>();

  attach(listener: SpacetimeListener<TArgs>): void {
    if (typeof listener !== 'function') {
      throw new TypeError('SpacetimeEvent.attach requires a function');
    }

    if (this.listeners.has(listener)) {
      return; // already attached
    }

    this.listeners.add(listener);
  }

  detach(listener: SpacetimeListener<TArgs>): void {
    if (typeof listener !== 'function') {
      throw new TypeError('SpacetimeEvent.detach requires a function');
    }

    if (!this.listeners.has(listener)) {
      return; // nothing to remove
    }

    this.listeners.delete(listener);
  }

  clear(): void {
    if (this.listeners.size === 0) {
      return;
    }

    this.listeners.clear();
  }

  trigger = (...args: TArgs): void => {
    if (this.listeners.size === 0) {
      return;
    }

    for (const listener of this.listeners) {
      try {
        listener(...args);
      } catch (err) {
        console.error('SpacetimeEvent listener error', err);
      }
    }
  };
}