/**
 * EventBus — the Runtime's central nervous system.
 *
 * Every stage transition, artifact write, gate decision, and provider interaction is expected to be
 * published here as a typed OramEvent (@oram/events). Nothing in the Runtime should communicate by directly
 * calling into another module's internals when an event will do -- this is what lets `oram inspect`, the
 * dashboard, and future integrations (docs/ORAM_SPECIFICATION_v1.md Section 5.3 / ORAM_V3_MIGRATION_PLAN.md
 * Section 8) observe a run without polling the filesystem.
 *
 * ARCHITECTURE NOTES
 * - In-process only for v1 (docs/ORAM_SPECIFICATION_v1.md Section 11, Non-goals: no hosted/multi-tenant
 *   ORAM yet). A plain Node EventEmitter-style implementation is expected. A future hosted version may back
 *   this with a durable transport, but the public interface below must not change shape when that happens
 *   -- only the implementation swaps.
 * - Every subscription is typed to one event's payload shape; there is no untyped "subscribe to everything
 *   and switch on event.type" escape hatch in the typed `on()` method, though `onAny()` exists deliberately
 *   for the dashboard's live feed and the Logger, both of which genuinely need every event regardless of type.
 *
 * PHASE 2 STATUS: publish()/on()/onAny() are implemented (in-memory only, no new dependency). Phase 2's own
 *   task list names "subscribe()/unsubscribe()" -- this interface intentionally does not add separate
 *   methods with those names: on() already returns an Unsubscribe closure, which *is* the unsubscribe
 *   operation, and the Phase 1 interface is frozen ("do NOT redesign"). A caller unsubscribes by calling the
 *   function on() returned, not by calling a second named method.
 *
 * TODO(runtime): decide on backpressure/ordering guarantees once ArtifactStore writes are async relative to
 *   publish() (today: publish() is synchronous and fire-and-forget with respect to async handlers).
 * TODO(runtime): add a `history()` accessor so a late subscriber (e.g. a dashboard opened mid-run) can
 *   replay events that already fired, instead of only receiving future ones.
 */

import type { OramEvent, OramEventType } from "@oram/events";

export type EventHandler<T extends OramEvent = OramEvent> = (event: T) => void | Promise<void>;

/** Call to stop receiving events for a given subscription. */
export type Unsubscribe = () => void;

/**
 * The public contract every EventBus implementation must satisfy. Kept intentionally small: publish,
 * subscribe to one type, and subscribe to everything.
 */
export interface EventBus {
  /** Publishes one event to every current subscriber of its type (and every onAny() subscriber). Never throws on a handler's own error -- a broken subscriber must never break the publisher. */
  publish<T extends OramEvent>(event: T): void;

  /** Subscribes to exactly one event type. Returns an unsubscribe function. */
  on<TType extends OramEventType>(
    type: TType,
    handler: EventHandler<Extract<OramEvent, { type: TType }>>
  ): Unsubscribe;

  /** Subscribes to every event this bus ever publishes, regardless of type. Intended for the dashboard's live feed and the Logger, not for business logic. */
  onAny(handler: EventHandler): Unsubscribe;
}

/**
 * Reference implementation (Phase 2): an in-process, synchronous pub/sub over a Map of Sets, exactly as the
 * TODOs above specified -- no external dependency, no durable transport.
 *
 * TYPE-SAFETY NOTE: `typedHandlers` necessarily stores handlers narrowed to different event types under one
 * heterogeneous Map -- TypeScript cannot express "this Map's value type varies per key" without a
 * per-key-typed structure that isn't worth the complexity for an in-memory bus. A single, narrow,
 * intentional cast is used at the one point a handler is stored (inside on()); the public on()/publish()
 * signatures themselves remain fully typed, so no caller of this class ever sees or needs that cast.
 */
export class InMemoryEventBus implements EventBus {
  private readonly typedHandlers = new Map<OramEventType, Set<EventHandler>>();
  private readonly anyHandlers = new Set<EventHandler>();

  publish<T extends OramEvent>(event: T): void {
    const handlers = this.typedHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) this.invoke(handler, event);
    }
    for (const handler of this.anyHandlers) this.invoke(handler, event);
  }

  on<TType extends OramEventType>(
    type: TType,
    handler: EventHandler<Extract<OramEvent, { type: TType }>>
  ): Unsubscribe {
    let set = this.typedHandlers.get(type);
    if (!set) {
      set = new Set<EventHandler>();
      this.typedHandlers.set(type, set);
    }
    // See the class-level TYPE-SAFETY NOTE: publish() only ever invokes a handler stored under `type` with
    // an event whose own `type` field is exactly `type`, so this cast is safe in practice even though
    // TypeScript cannot verify it structurally across a single shared Map.
    const erased = handler as unknown as EventHandler;
    set.add(erased);
    return () => {
      set?.delete(erased);
    };
  }

  onAny(handler: EventHandler): Unsubscribe {
    this.anyHandlers.add(handler);
    return () => {
      this.anyHandlers.delete(handler);
    };
  }

  /**
   * Invokes one handler, isolating both a synchronous throw and an asynchronous rejection so that one
   * broken subscriber can never break the publisher or any other subscriber (see EventBus.publish()'s own
   * documented guarantee). This is the one narrow, deliberate use of console.error in this package -- an
   * EventBus has no Logger dependency of its own (see Runtime.ts's RuntimeDependencies, where EventBus and
   * Logger are separate, independently-injected siblings), and a misbehaving subscriber is exactly the kind
   * of exceptional, non-blocking condition System A's own orchestrator already reports the same way (see
   * scripts/autonomous-orchestrator.js's `console.error("Historical Context failed:", ...)`).
   */
  private invoke(handler: EventHandler, event: OramEvent): void {
    try {
      const result = handler(event);
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).catch((error: unknown) => {
          console.error(`[EventBus] subscriber for "${event.type}" rejected:`, error);
        });
      }
    } catch (error) {
      console.error(`[EventBus] subscriber for "${event.type}" threw:`, error);
    }
  }
}
