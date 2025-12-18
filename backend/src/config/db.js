import { createClient } from '@libsql/client';
import { config } from './env.js';

export class DatabaseNotConfiguredError extends Error {
  constructor(message = 'Banco de dados não configurado') {
    super(message);
    this.name = 'DatabaseNotConfiguredError';
    this.code = 'DB_NOT_CONFIGURED';
  }
}

let client = null;
let initialized = false;

export function initDbClient() {
  if (initialized && client) return client;

  if (!config.turso.url || !config.turso.authToken) {
    console.error('❌ TURSO_DATABASE_URL ou TURSO_AUTH_TOKEN não configurados');
    throw new DatabaseNotConfiguredError();
  }

  client = createClient({
    url: config.turso.url,
    authToken: config.turso.authToken
  });

  initialized = true;

  if (config.skipMigrations) {
    console.log('⏭️ Migrações desabilitadas por SKIP_MIGRATIONS (padrão).');
  }

  console.log('🔌 Conexão com o banco Turso/LibSQL inicializada.');
  return client;
}

export function getDbClient() {
  if (!client) {
    return initDbClient();
  }
  return client;
}
