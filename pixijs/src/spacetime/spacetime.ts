import type { DbConnection } from './bindings';
import type { SpacetimeConnectionConfig } from './adapter';
import type { SpacetimeTable } from './table';

import { SpacetimeAdapter } from './adapter';

type ReducerMap = DbConnection['reducers'];
type TableName = keyof DbConnection['db'] & string;

type TableMap = {
  [K in TableName]: SpacetimeTable<K>;
};

type SpacetimeClient =
  & {
    adapter: SpacetimeAdapter;
    connection: DbConnection | null;
    onConnect: (listener: (connection: DbConnection) => void) => () => void;
    start: () => void;
    stop: () => void;
  }
  & TableMap
  & ReducerMap;

const spacetimeClients: Record<string, SpacetimeClient> = {};

export function GetSpacetime(
  config: SpacetimeConnectionConfig
): SpacetimeClient {
  const key = config.databaseName;

  if (spacetimeClients[key]) {
    return spacetimeClients[key];
  }

  const adapter = new SpacetimeAdapter(config);
  adapter.start();

  const spacetimeClient = {
    adapter,
    connection: adapter.connection,
    onConnect: adapter.onConnect.bind(adapter),
    start: adapter.start.bind(adapter),
    stop: adapter.stop.bind(adapter)
  } as SpacetimeClient;
  
  adapter.onConnect((connection) => {
    spacetimeClient.connection = connection;

    for (const tableName of Object.keys(connection.db) as TableName[]) {
      spacetimeClient[tableName] = new SpacetimeTable(connection, tableName);
      adapter.onStop(() => {
        spacetimeClient[tableName].unsubscribeAll()
      })
    }
    
    Object.assign(spacetimeClient, connection.reducers);
  });

  spacetimeClients[key] = spacetimeClient;
  return spacetimeClient;
}
