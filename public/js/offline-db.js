/**
 * OfflineDB - Gerenciador de dados offline usando IndexedDB
 * Armazena dados do repositor para uso sem conexão
 */

class OfflineDB {
  constructor() {
    this.dbName = 'GermaniPWA';
    this.dbVersion = 1;
    this.db = null;
    this.MAX_RETRY_ATTEMPTS = 5;  // Limite de tentativas antes de marcar como dead_letter
  }

  /**
   * Inicializar banco de dados
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('[OfflineDB] Erro ao abrir banco:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[OfflineDB] Banco aberto com sucesso');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('[OfflineDB] Criando/atualizando estrutura do banco...');

        // ========== DADOS DO REPOSITOR ==========

        // Informações do usuário logado
        if (!db.objectStoreNames.contains('usuario')) {
          db.createObjectStore('usuario', { keyPath: 'id' });
        }

        // Roteiro do dia/semana
        if (!db.objectStoreNames.contains('roteiro')) {
          const roteiro = db.createObjectStore('roteiro', { keyPath: 'rot_cli_id' });
          roteiro.createIndex('data', 'data_visita', { unique: false });
          roteiro.createIndex('cliente', 'cliente_id', { unique: false });
        }

        // Lista de clientes do repositor
        if (!db.objectStoreNames.contains('clientes')) {
          const clientes = db.createObjectStore('clientes', { keyPath: 'cli_codigo' });
          clientes.createIndex('nome', 'cli_nome', { unique: false });
          clientes.createIndex('cidade', 'cli_cidade', { unique: false });
        }

        // Coordenadas dos clientes
        if (!db.objectStoreNames.contains('coordenadas')) {
          db.createObjectStore('coordenadas', { keyPath: 'cliente_id' });
        }

        // Tipos de documento
        if (!db.objectStoreNames.contains('tiposDocumento')) {
          db.createObjectStore('tiposDocumento', { keyPath: 'id' });
        }

        // Tipos de gasto (rubricas)
        if (!db.objectStoreNames.contains('tiposGasto')) {
          db.createObjectStore('tiposGasto', { keyPath: 'id' });
        }

        // ========== FILA DE ENVIO (OPERAÇÕES PENDENTES) ==========

        // Sessões de visita (check-in/checkout)
        if (!db.objectStoreNames.contains('filaSessoes')) {
          const filaSessoes = db.createObjectStore('filaSessoes', { keyPath: 'localId', autoIncrement: true });
          filaSessoes.createIndex('status', 'syncStatus', { unique: false });
          filaSessoes.createIndex('data', 'createdAt', { unique: false });
        }

        // Registros de visita (atividades)
        if (!db.objectStoreNames.contains('filaRegistros')) {
          const filaRegistros = db.createObjectStore('filaRegistros', { keyPath: 'localId', autoIncrement: true });
          filaRegistros.createIndex('status', 'syncStatus', { unique: false });
          filaRegistros.createIndex('sessao', 'sessaoLocalId', { unique: false });
        }

        // Fotos/documentos
        if (!db.objectStoreNames.contains('filaFotos')) {
          const filaFotos = db.createObjectStore('filaFotos', { keyPath: 'localId', autoIncrement: true });
          filaFotos.createIndex('status', 'syncStatus', { unique: false });
          filaFotos.createIndex('sessao', 'sessaoLocalId', { unique: false });
        }

        // Registros de rota (GPS)
        if (!db.objectStoreNames.contains('filaRota')) {
          const filaRota = db.createObjectStore('filaRota', { keyPath: 'localId', autoIncrement: true });
          filaRota.createIndex('status', 'syncStatus', { unique: false });
        }

        // ========== METADADOS DE SINCRONIZAÇÃO ==========

        if (!db.objectStoreNames.contains('syncMeta')) {
          db.createObjectStore('syncMeta', { keyPath: 'key' });
        }

        console.log('[OfflineDB] Estrutura criada com sucesso');
      };
    });
  }

  // ==================== OPERAÇÕES GENÉRICAS ====================

  async getStore(storeName, mode = 'readonly') {
    if (!this.db) await this.init();
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async getAll(storeName) {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, data) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async add(storeName, data) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getByIndex(storeName, indexName, value) {
    const store = await this.getStore(storeName);
    const index = store.index(indexName);
    return new Promise((resolve, reject) => {
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== DADOS DO REPOSITOR ====================

  async salvarUsuario(usuario) {
    await this.put('usuario', { id: 'current', ...usuario });
  }

  async getUsuario() {
    return await this.get('usuario', 'current');
  }

  async salvarRoteiro(itens) {
    await this.clear('roteiro');
    for (const item of itens) {
      await this.put('roteiro', item);
    }
  }

  async getRoteiroDia(data) {
    return await this.getByIndex('roteiro', 'data', data);
  }

  async salvarClientes(clientes) {
    await this.clear('clientes');
    for (const cliente of clientes) {
      await this.put('clientes', cliente);
    }
  }

  async getClientes() {
    return await this.getAll('clientes');
  }

  async getCliente(codigo) {
    return await this.get('clientes', codigo);
  }

  async salvarCoordenadas(coordenadas) {
    await this.clear('coordenadas');
    for (const coord of coordenadas) {
      await this.put('coordenadas', coord);
    }
  }

  async getCoordenadas(clienteId) {
    return await this.get('coordenadas', clienteId);
  }

  async salvarTiposDocumento(tipos) {
    await this.clear('tiposDocumento');
    for (const tipo of tipos) {
      await this.put('tiposDocumento', tipo);
    }
  }

  async getTiposDocumento() {
    return await this.getAll('tiposDocumento');
  }

  async salvarTiposGasto(tipos) {
    await this.clear('tiposGasto');
    for (const tipo of tipos) {
      await this.put('tiposGasto', tipo);
    }
  }

  async getTiposGasto() {
    return await this.getAll('tiposGasto');
  }

  // ==================== FILA DE ENVIO ====================

  /**
   * Adicionar sessão (check-in) à fila
   * O timestamp é gravado AGORA, não no momento do envio
   */
  async adicionarSessaoFila(sessao) {
    const dados = {
      ...sessao,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    return await this.add('filaSessoes', dados);
  }

  /**
   * Atualizar sessão na fila (ex: adicionar checkout)
   */
  async atualizarSessaoFila(localId, dados) {
    const sessao = await this.get('filaSessoes', localId);
    if (sessao) {
      await this.put('filaSessoes', { ...sessao, ...dados });
    }
  }

  /**
   * Adicionar registro de visita à fila
   */
  async adicionarRegistroFila(registro) {
    const dados = {
      ...registro,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    return await this.add('filaRegistros', dados);
  }

  /**
   * Adicionar foto à fila
   * Fotos são armazenadas como base64 ou blob
   */
  async adicionarFotoFila(foto) {
    const dados = {
      ...foto,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    return await this.add('filaFotos', dados);
  }

  /**
   * Adicionar registro de rota à fila
   */
  async adicionarRotaFila(rota) {
    const dados = {
      ...rota,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    return await this.add('filaRota', dados);
  }

  /**
   * Obter itens pendentes de envio (status pending)
   */
  async getPendentes(storeName) {
    return await this.getByIndex(storeName, 'status', 'pending');
  }

  /**
   * Obter itens para retry (pending + error, exceto dead_letter)
   */
  async getParaEnvio(storeName) {
    const todos = await this.getAll(storeName);
    return todos.filter(item =>
      item.syncStatus === 'pending' ||
      (item.syncStatus === 'error' && (item.attempts || 0) < this.MAX_RETRY_ATTEMPTS)
    );
  }

  /**
   * Obter itens em dead_letter (falhas permanentes)
   */
  async getDeadLetters(storeName) {
    return await this.getByIndex(storeName, 'status', 'dead_letter');
  }

  /**
   * Contar dead letters
   */
  async contarDeadLetters() {
    let total = 0;
    for (const storeName of ['filaSessoes', 'filaRegistros', 'filaFotos', 'filaRota']) {
      const items = await this.getDeadLetters(storeName);
      total += items.length;
    }
    return total;
  }

  /**
   * Resetar item dead_letter para tentar novamente
   */
  async resetarDeadLetter(storeName, localId) {
    const item = await this.get(storeName, localId);
    if (item && item.syncStatus === 'dead_letter') {
      await this.put(storeName, {
        ...item,
        syncStatus: 'pending',
        attempts: 0,
        lastError: null,
        deadLetterAt: null,
        resetAt: new Date().toISOString()
      });
      return true;
    }
    return false;
  }

  /**
   * Marcar item como enviado
   */
  async marcarEnviado(storeName, localId, serverResponse = {}) {
    const item = await this.get(storeName, localId);
    if (item) {
      await this.put(storeName, {
        ...item,
        syncStatus: 'synced',
        syncedAt: new Date().toISOString(),
        serverResponse
      });
    }
  }

  /**
   * Marcar item com erro de envio
   * Se exceder MAX_RETRY_ATTEMPTS, marca como dead_letter
   */
  async marcarErro(storeName, localId, error) {
    const item = await this.get(storeName, localId);
    if (item) {
      const novoAttempts = (item.attempts || 0) + 1;
      const isDeadLetter = novoAttempts >= this.MAX_RETRY_ATTEMPTS;

      await this.put(storeName, {
        ...item,
        syncStatus: isDeadLetter ? 'dead_letter' : 'error',
        lastError: error,
        attempts: novoAttempts,
        deadLetterAt: isDeadLetter ? new Date().toISOString() : item.deadLetterAt
      });

      if (isDeadLetter) {
        console.warn(`[OfflineDB] Item ${localId} em ${storeName} movido para dead_letter após ${novoAttempts} tentativas`);
      }
    }
  }

  /**
   * Contar itens pendentes de envio (inclui erros para retry)
   */
  async contarPendentes() {
    const sessoes = await this.getParaEnvio('filaSessoes');
    const registros = await this.getParaEnvio('filaRegistros');
    const fotos = await this.getParaEnvio('filaFotos');
    const rotas = await this.getParaEnvio('filaRota');
    const deadLetters = await this.contarDeadLetters();

    return {
      sessoes: sessoes.length,
      registros: registros.length,
      fotos: fotos.length,
      rotas: rotas.length,
      total: sessoes.length + registros.length + fotos.length + rotas.length,
      deadLetters
    };
  }

  /**
   * Limpar itens já sincronizados (manter apenas últimos 7 dias)
   * Também limpa dead_letters com mais de 30 dias
   */
  async limparSincronizados() {
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    const limiteSynced = seteDiasAtras.toISOString();

    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const limiteDeadLetter = trintaDiasAtras.toISOString();

    let removidos = 0;

    for (const storeName of ['filaSessoes', 'filaRegistros', 'filaFotos', 'filaRota']) {
      const todos = await this.getAll(storeName);
      for (const item of todos) {
        // Remover sincronizados com mais de 7 dias
        if (item.syncStatus === 'synced' && item.syncedAt < limiteSynced) {
          await this.delete(storeName, item.localId);
          removidos++;
        }
        // Remover dead_letters com mais de 30 dias
        if (item.syncStatus === 'dead_letter' && item.deadLetterAt < limiteDeadLetter) {
          await this.delete(storeName, item.localId);
          removidos++;
        }
      }
    }

    if (removidos > 0) {
      console.log(`[OfflineDB] Limpeza: ${removidos} itens antigos removidos`);
    }

    return removidos;
  }

  // ==================== METADADOS DE SINCRONIZAÇÃO ====================

  async setSyncMeta(key, value) {
    await this.put('syncMeta', { key, value, updatedAt: new Date().toISOString() });
  }

  async getSyncMeta(key) {
    const meta = await this.get('syncMeta', key);
    return meta?.value;
  }

  async getUltimaSync() {
    return await this.getSyncMeta('ultimaSync');
  }

  async setUltimaSync(data = new Date().toISOString()) {
    await this.setSyncMeta('ultimaSync', data);
  }

  async getConfigSync() {
    return await this.getSyncMeta('configSync') || {
      horariosDownload: ['06:00', '12:00'],
      enviarNoCheckout: true
    };
  }

  async setConfigSync(config) {
    await this.setSyncMeta('configSync', config);
  }
}

// Instância global
const offlineDB = new OfflineDB();

// Exportar para uso
if (typeof window !== 'undefined') {
  window.offlineDB = offlineDB;
}
