/**
 * OfflineDB - Gerenciador de dados offline usando IndexedDB
 * Armazena dados do repositor para uso sem conexão
 */

class OfflineDB {
  constructor() {
    this.dbName = 'GermaniPWA';
    this.dbVersion = 5;
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

        // Pesquisas pendentes de envio
        if (!db.objectStoreNames.contains('filaPesquisas')) {
          const filaPesquisas = db.createObjectStore('filaPesquisas', { keyPath: 'localId', autoIncrement: true });
          filaPesquisas.createIndex('status', 'syncStatus', { unique: false });
        }

        // Espaços pendentes de envio (fotos + registros)
        if (!db.objectStoreNames.contains('filaEspacos')) {
          const filaEspacos = db.createObjectStore('filaEspacos', { keyPath: 'localId', autoIncrement: true });
          filaEspacos.createIndex('status', 'syncStatus', { unique: false });
        }

        // Cache de espaços dos clientes (para acesso offline)
        if (!db.objectStoreNames.contains('espacosClientes')) {
          const espacosClientes = db.createObjectStore('espacosClientes', { keyPath: 'clienteId' });
          espacosClientes.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // ========== CACHES DE CONSULTA (v4) ==========

        // Cache de campanhas (últimos 15 dias)
        if (!db.objectStoreNames.contains('campanhasCache')) {
          db.createObjectStore('campanhasCache', { keyPath: 'id' });
        }

        // Cache de documentos (últimos 15 dias)
        if (!db.objectStoreNames.contains('documentosCache')) {
          db.createObjectStore('documentosCache', { keyPath: 'doc_id' });
        }

        // Cache de despesas (mês corrente)
        if (!db.objectStoreNames.contains('despesasCache')) {
          db.createObjectStore('despesasCache', { keyPath: 'id' });
        }

        // Cache de roteiros vigentes para consulta
        if (!db.objectStoreNames.contains('roteirosConsulta')) {
          db.createObjectStore('roteirosConsulta', { keyPath: 'rot_cli_id' });
        }

        // Cache de pesquisas por cliente { clienteId: string, pesquisas: [] }
        if (!db.objectStoreNames.contains('pesquisasClientes')) {
          db.createObjectStore('pesquisasClientes', { keyPath: 'clienteId' });
        }

        // Cache de visitas não realizadas
        if (!db.objectStoreNames.contains('visitasNaoRealizadas')) {
          db.createObjectStore('visitasNaoRealizadas', { keyPath: 'id' });
        }

        // ========== CACHE DE SESSÕES RECENTES (v5) ==========

        // Cache de sessões de visita (últimos 15 dias)
        if (!db.objectStoreNames.contains('sessoesRecentes')) {
          const sessoesRecentes = db.createObjectStore('sessoesRecentes', { keyPath: 'sessao_id' });
          sessoesRecentes.createIndex('data', 'checkin_data_hora', { unique: false });
          sessoesRecentes.createIndex('cliente', 'cliente_id', { unique: false });
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
      // Normalizar IDs e garantir campo cli_codigo (usado pelo app para enriquecimento)
      const clienteId = String(item.cliente_id || item.cli_codigo || '').trim().replace(/\.0$/, '');
      const normalized = {
        ...item,
        rot_cli_id: item.rot_cli_id || `${clienteId}_${item.dia_semana || item.rot_cid_id || ''}`,
        cliente_id: clienteId,
        cli_codigo: clienteId
      };
      try {
        await this.put('roteiro', normalized);
      } catch (e) {
        console.warn('[OfflineDB] Erro ao salvar item roteiro:', e.message, normalized);
      }
    }
  }

  async getRoteiroDia(data) {
    return await this.getByIndex('roteiro', 'data', data);
  }

  async salvarClientes(clientes) {
    await this.clear('clientes');
    for (const cliente of clientes) {
      // Normalizar cli_codigo para string (consistência)
      const normalized = {
        ...cliente,
        cli_codigo: String(cliente.cli_codigo || '').trim().replace(/\.0$/, '')
      };
      await this.put('clientes', normalized);
    }
  }

  async getClientes() {
    return await this.getAll('clientes');
  }

  async getCliente(codigo) {
    const normalized = String(codigo || '').trim().replace(/\.0$/, '');
    let result = await this.get('clientes', normalized);
    if (result) return result;
    // Fallback: tentar tipo original
    if (normalized !== codigo) {
      result = await this.get('clientes', codigo);
    }
    return result || null;
  }

  async salvarCoordenadas(coordenadas) {
    await this.clear('coordenadas');
    for (const coord of coordenadas) {
      // Normalizar cliente_id para string (consistência com o resto do app)
      const normalized = {
        ...coord,
        cliente_id: String(coord.cliente_id || '').trim().replace(/\.0$/, '')
      };
      await this.put('coordenadas', normalized);
    }
  }

  async getCoordenadas(clienteId) {
    // Tentar busca direta (mesmo tipo que foi salvo)
    let result = await this.get('coordenadas', clienteId);
    if (result) return result;

    // Fallback: tentar com tipo alternativo (string vs number)
    const alt = typeof clienteId === 'string' ? Number(clienteId) : String(clienteId);
    if (!isNaN(alt)) {
      result = await this.get('coordenadas', alt);
      if (result) return result;
    }

    // Fallback: buscar sem .0 no final (normalização)
    const normalized = String(clienteId).trim().replace(/\.0$/, '');
    if (normalized !== String(clienteId)) {
      result = await this.get('coordenadas', normalized);
      if (result) return result;
      const numNorm = Number(normalized);
      if (!isNaN(numNorm)) {
        result = await this.get('coordenadas', numNorm);
      }
    }

    return result || null;
  }

  async salvarTiposDocumento(tipos) {
    await this.clear('tiposDocumento');
    for (const tipo of tipos) {
      // Normalizar keyPath: store usa 'id' mas API retorna 'dct_id'
      const item = { ...tipo, id: tipo.id || tipo.dct_id };
      await this.put('tiposDocumento', item);
    }
  }

  async getTiposDocumento() {
    return await this.getAll('tiposDocumento');
  }

  async salvarTiposGasto(tipos) {
    if (!this.db) await this.init();
    // Transação única: clear + puts atômicos para evitar perda de dados
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tiposGasto', 'readwrite');
      const store = tx.objectStore('tiposGasto');
      store.clear();
      let salvos = 0;
      for (const tipo of tipos) {
        // Normalizar keyPath: store usa 'id' mas API retorna 'gst_id'
        const item = { ...tipo, id: tipo.id || tipo.gst_id || `gasto_${salvos}` };
        try { store.put(item); salvos++; } catch (e) { console.warn('[OfflineDB] Erro put tiposGasto:', e.message); }
      }
      tx.oncomplete = () => { console.log(`[OfflineDB] tiposGasto salvos: ${salvos}/${tipos.length}`); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  }

  async getTiposGasto() {
    return await this.getAll('tiposGasto');
  }

  // ==================== CACHES DE CONSULTA ====================

  async salvarCampanhas(campanhas) {
    await this.clear('campanhasCache');
    for (const item of campanhas) {
      await this.put('campanhasCache', item);
    }
  }

  async getCampanhas() {
    return await this.getAll('campanhasCache');
  }

  async salvarDocumentosCache(documentos) {
    await this.clear('documentosCache');
    for (const item of documentos) {
      await this.put('documentosCache', item);
    }
  }

  async getDocumentosCache() {
    return await this.getAll('documentosCache');
  }

  async salvarDespesas(despesas) {
    await this.clear('despesasCache');
    for (const item of despesas) {
      await this.put('despesasCache', item);
    }
  }

  async getDespesas() {
    return await this.getAll('despesasCache');
  }

  async salvarRoteirosConsulta(roteiros) {
    await this.clear('roteirosConsulta');
    for (const item of roteiros) {
      const clienteId = String(item.cliente_id || item.cli_codigo || '').trim().replace(/\.0$/, '');
      const normalized = {
        ...item,
        rot_cli_id: item.rot_cli_id || `${clienteId}_${item.dia_semana || item.rot_cid_id || ''}`
      };
      try {
        await this.put('roteirosConsulta', normalized);
      } catch (e) {
        console.warn('[OfflineDB] Erro ao salvar roteiro consulta:', e.message);
      }
    }
  }

  async getRoteirosConsulta() {
    return await this.getAll('roteirosConsulta');
  }

  async salvarPesquisasClientes(clientesPesquisa) {
    await this.clear('pesquisasClientes');
    for (const [clienteId, pesquisas] of Object.entries(clientesPesquisa)) {
      await this.put('pesquisasClientes', { clienteId, pesquisas });
    }
  }

  async getPesquisasCliente(clienteId) {
    const id = String(clienteId).trim().replace(/\.0$/, '');
    const cached = await this.get('pesquisasClientes', id);
    return cached?.pesquisas || null;
  }

  async getAllPesquisasClientes() {
    return await this.getAll('pesquisasClientes');
  }

  async salvarVisitasNaoRealizadas(visitas) {
    await this.clear('visitasNaoRealizadas');
    for (const item of visitas) {
      await this.put('visitasNaoRealizadas', item);
    }
  }

  async getVisitasNaoRealizadas() {
    return await this.getAll('visitasNaoRealizadas');
  }

  // ==================== PENDENTES PARA CONSULTA ====================

  async getPendingSessions() {
    try {
      const all = await this.getAll('filaSessoes');
      return all.filter(s => s.syncStatus === 'pending' || s.syncStatus === 'error');
    } catch (_) { return []; }
  }

  async getPendingDespesas() {
    try {
      const meta = await this.getSyncMeta('pendingDespesas');
      return Array.isArray(meta) ? meta : [];
    } catch (_) { return []; }
  }

  async getPendingDocumentos() {
    try {
      const meta = await this.getSyncMeta('pendingDocumentos');
      return Array.isArray(meta) ? meta : [];
    } catch (_) { return []; }
  }

  // ==================== LIMPEZA IMEDIATA ====================

  async limparSincronizadosImediatamente() {
    let removidos = 0;
    for (const storeName of ['filaSessoes', 'filaRegistros', 'filaFotos', 'filaRota', 'filaPesquisas', 'filaEspacos']) {
      const todos = await this.getAll(storeName);
      for (const item of todos) {
        if (item.syncStatus === 'synced') {
          await this.delete(storeName, item.localId);
          removidos++;
        }
      }
    }
    // Limpar pendingDespesas e pendingDocumentos se vazios
    try {
      const despesas = await this.getSyncMeta('pendingDespesas');
      if (Array.isArray(despesas) && despesas.length === 0) {
        await this.delete('syncMeta', 'pendingDespesas');
      }
      const docs = await this.getSyncMeta('pendingDocumentos');
      if (Array.isArray(docs) && docs.length === 0) {
        await this.delete('syncMeta', 'pendingDocumentos');
      }
    } catch (_) {}
    if (removidos > 0) {
      console.log(`[OfflineDB] Limpeza imediata: ${removidos} itens synced removidos`);
    }
    return removidos;
  }

  // ==================== SESSÕES RECENTES (CONSULTA VISITAS) ====================

  async salvarSessoesRecentes(sessoes) {
    await this.clear('sessoesRecentes');
    for (const item of sessoes) {
      await this.put('sessoesRecentes', item);
    }
  }

  async getSessoesRecentes() {
    return await this.getAll('sessoesRecentes');
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
   * Adicionar pesquisa à fila de envio
   * Fotos são armazenadas como File/Blob (IndexedDB suporta structured clone)
   */
  async adicionarPesquisaFila(pesquisa) {
    const dados = {
      ...pesquisa,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    return await this.add('filaPesquisas', dados);
  }

  /**
   * Adicionar registro de espaço à fila (foto como Blob + dados)
   */
  async adicionarEspacoFila(espaco) {
    const dados = {
      ...espaco,
      syncStatus: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0
    };
    return await this.add('filaEspacos', dados);
  }

  /**
   * Salvar espaços de um cliente no cache local
   */
  async salvarEspacosCliente(clienteId, espacos) {
    await this.put('espacosClientes', {
      clienteId: String(clienteId).trim().replace(/\.0$/, ''),
      espacos,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Obter espaços de um cliente do cache local
   */
  async getEspacosCliente(clienteId) {
    const id = String(clienteId).trim().replace(/\.0$/, '');
    const cached = await this.get('espacosClientes', id);
    return cached?.espacos || null;
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
    for (const storeName of ['filaSessoes', 'filaRegistros', 'filaFotos', 'filaRota', 'filaPesquisas', 'filaEspacos']) {
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
    const pesquisas = await this.getParaEnvio('filaPesquisas');
    const espacos = await this.getParaEnvio('filaEspacos');
    const deadLetters = await this.contarDeadLetters();

    // Incluir checkin local pendente (armazenado no localStorage, não no IndexedDB)
    let checkinLocal = 0;
    try {
      const meta = localStorage.getItem('PWA_CHECKIN_LOCAL_META');
      if (meta) checkinLocal = 1;
    } catch (_) {}

    // Incluir checkouts offline e documentos/despesas pendentes (salvos no syncMeta do IndexedDB)
    let checkoutsPendentes = 0;
    let despesasPendentes = 0;
    let documentosPendentes = 0;
    try {
      const allMeta = await this.getAll('syncMeta');
      if (allMeta) {
        for (const item of allMeta) {
          if (item.key && item.key.startsWith('pendingCheckout_')) checkoutsPendentes++;
          if (item.key === 'pendingDespesas' && Array.isArray(item.value)) despesasPendentes = item.value.length;
          if (item.key === 'pendingDocumentos' && Array.isArray(item.value)) documentosPendentes = item.value.length;
        }
      }
    } catch (_) {}

    const subtotal = sessoes.length + registros.length + fotos.length + rotas.length + pesquisas.length + espacos.length + checkinLocal + checkoutsPendentes + despesasPendentes + documentosPendentes;

    return {
      sessoes: sessoes.length,
      registros: registros.length,
      fotos: fotos.length,
      rotas: rotas.length,
      pesquisas: pesquisas.length,
      espacos: espacos.length,
      checkinLocal,
      checkoutsPendentes,
      despesasPendentes,
      documentosPendentes,
      total: subtotal,
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

    for (const storeName of ['filaSessoes', 'filaRegistros', 'filaFotos', 'filaRota', 'filaPesquisas', 'filaEspacos']) {
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
