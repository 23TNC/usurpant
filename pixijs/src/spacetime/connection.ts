// client.ts
import { DbConnection } from './bindings';

export interface SpacetimeConnectionConfig {
  uri: string;
  databaseName: string;
}

type ConnectListener = (connection: DbConnection) => void;
type StopListener = () => void;

export class SpacetimeConnection {
  private readonly config: SpacetimeConnectionConfig;
  private _connection: DbConnection | null = null;
  private readonly connectListeners = new Set<ConnectListener>();
  private readonly stopListeners    = new Set<StopListener>();
  
  constructor(config: SpacetimeConnectionConfig) {
    this.config = config;
  }

  public get connection(): DbConnection | null {
    return this._connection;
  }

  public start(): void {
    if (this._connection) {
      return;
    }

    this._connection = DbConnection.builder()
      .withUri(this.config.uri)
      .withDatabaseName(this.config.databaseName)
      .onConnect((connection) => {
        this._connection = connection;
        for (const listener of this.connectListeners) {
          listener(connection);
        }
      })
      .onConnectError((_ctx, error) => {
        console.error('SpacetimeDB connect error', error);
      })
      .onDisconnect(() => {
        console.warn('Disconnected from SpacetimeDB');
      })
      .build();
  }

  public stop(): void {
    for (const listener of this.stopListeners) {
      listener();
    }
    this._connection?.disconnect();
    this._connection = null;
  }

  public onConnect(listener: ConnectListener): () => void {
    this.connectListeners.add(listener);

    if (this._connection && this._connection.isConnected) {
      listener(this._connection);
    }

    return () => {
      this.connectListeners.delete(listener);
    };
  }
  
  public onStop(listener: StopListener): () => void {
    this.stopListeners.add(listener);

    return () => {
      this.stopListeners.delete(listener);
    };
  }
}
