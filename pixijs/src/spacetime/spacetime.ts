import type { DbConnection } from './bindings';
import type { SpacetimeConnectionConfig } from './connection';
import type { SpacetimeTable } from './table';

import { SpacetimeConnection } from './connection';

type ReducerMap = DbConnection['reducers'];
type TableName = keyof DbConnection['db'] & string;

type TableMap = {
  [K in TableName]: SpacetimeTable<K>;
};

type SpacetimeClient =
  & {
    connection: SpacetimeConnection;
    onConnect: (listener: (con: DbConnection) => void) => () => void;
    onStop: (listener: () => void) => () => void;
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

  const connection = new SpacetimeConnection(config);

  const spacetimeClient = {
    connection,
    onConnect: connection.onConnect.bind(connection),
    onStop: connection.onStop.bind(connection),
    start: connection.start.bind(connection),
    stop: connection.stop.bind(connection)
  } as SpacetimeClient;
  
  connection.onConnect((con) => {
    for (const tableName of Object.keys(con.db) as TableName[]) {
      spacetimeClient[tableName] = new SpacetimeTable(con, tableName);
      connection.onStop(() => {
        spacetimeClient[tableName].unsubscribeAll()
      })
    }
    
    Object.assign(spacetimeClient, con.reducers);
  });

  spacetimeClients[key] = spacetimeClient;
  return spacetimeClient;
}
