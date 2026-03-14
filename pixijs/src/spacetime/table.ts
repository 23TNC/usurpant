import type { DbConnection, SubscriptionHandle } from './bindings';
import { SpacetimeEvent, type SpacetimeListener } from './event';

type TableName = keyof DbConnection['db'];

type RowFromTable<TTable> =
  TTable extends {
    onInsert: (fn: (_ctx: unknown, row: infer TRow) => void) => void;
  }
    ? TRow
    : never;

type TableRow<TName extends TableName> = RowFromTable<DbConnection['db'][TName]>;

type InsertListener<TName extends TableName> = SpacetimeListener<[TableRow<TName>]>;
type UpdateListener<TName extends TableName> = SpacetimeListener<[TableRow<TName>, TableRow<TName>]>;
type DeleteListener<TName extends TableName> = SpacetimeListener<[TableRow<TName>]>;

type AnyTableListener<TName extends TableName> =
  | InsertListener<TName>
  | UpdateListener<TName>
  | DeleteListener<TName>;

export class SpacetimeTable<TName extends TableName> {
  private readonly connection: DbConnection;
  private readonly name: TName;
  private readonly table: DbConnection['db'][TName];
  private readonly subscriptionHandles = new Set<SubscriptionHandle>();

  private readonly insertEvent = new SpacetimeEvent<[TableRow<TName>]>();
  private readonly updateEvent = new SpacetimeEvent<[TableRow<TName>, TableRow<TName>]>();
  private readonly deleteEvent = new SpacetimeEvent<[TableRow<TName>]>();

  private readonly listenerEvents = new WeakMap<Function, SpacetimeEvent<any>>();

  constructor(connection: DbConnection, name: TName) {
    this.connection = connection;
    this.name = name;
    this.table = connection.db[name];

    this.table.onInsert((_ctx, row) => {
      this.insertEvent.trigger(row);
    });

    this.table.onUpdate((_ctx, oldRow, newRow) => {
      this.updateEvent.trigger(oldRow, newRow);
    });

    this.table.onDelete((_ctx, row) => {
      this.deleteEvent.trigger(row);
    });
  }

  public onInsert(listener: InsertListener<TName>): void {
    this.insertEvent.attach(listener);
    this.listenerEvents.set(listener, this.insertEvent);
  }

  public onUpdate(listener: UpdateListener<TName>): void {
    this.updateEvent.attach(listener);
    this.listenerEvents.set(listener, this.updateEvent);
  }

  public onDelete(listener: DeleteListener<TName>): void {
    this.deleteEvent.attach(listener);
    this.listenerEvents.set(listener, this.deleteEvent);
  }

  public detach(listener: AnyTableListener<TName>): void {
    const event = this.listenerEvents.get(listener as Function);

    if (!event) {
      return;
    }

    event.detach(listener as never);
    this.listenerEvents.delete(listener as Function);
  }

  public subscribe(
    cond: string | string[],
    col: string | string[] = '*'
  ): SubscriptionHandle {
    const cols = Array.isArray(col) ? col.join(', ') : col;
    const where = Array.isArray(cond) ? cond.join(' AND ') : cond;
    const sql = 'SELECT ' + cols + ' FROM ' + this.name + ' WHERE ' + where;

    const handle = this.connection
      .subscriptionBuilder()
      .onError((ctx) => {
        console.error('Subscription error', { error: ctx });
      })
      .subscribe([sql]);

    this.subscriptionHandles.add(handle);
    return handle;
  }

  public subscribeAll(col: string | string[] = '*'): SubscriptionHandle {
    const cols = Array.isArray(col) ? col.join(', ') : col;
    const sql = 'SELECT ' + cols + ' FROM ' + this.name;

    const handle = this.connection
      .subscriptionBuilder()
      .onError((ctx) => {
        console.error('Subscription error', { error: ctx });
      })
      .subscribe([sql]);

    this.subscriptionHandles.add(handle);
    return handle;
  }

  public unsubscribe(handle: SubscriptionHandle): void {
    if (!this.subscriptionHandles.has(handle)) {
      return;
    }

    this.subscriptionHandles.delete(handle);
    handle.unsubscribe();
  }

  public unsubscribeAll(): void {
    for (const handle of this.subscriptionHandles) {
      handle.unsubscribe();
    }

    this.subscriptionHandles.clear();
  }
}
