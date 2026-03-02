/**
 * PWA App Controller - Reestruturado
 * Motor de navegação e renderização para o modo mobile PWA
 * Prioridade: OFFLINE-FIRST, telas cheias, zero popups
 *
 * Princípios:
 * 1. Dados do IndexedDB primeiro (instantâneo)
 * 2. Sync com servidor em background
 * 3. Operações salvas localmente, enviadas no checkout quando online
 * 4. Telas cheias ao invés de modals/popups
 * 5. Repositor logado = filtro automático, sem select
 */
(function() {
    'use strict';

    // ==================== CONFIGURAÇÃO ====================

    const API_BASE_URL = window.API_BASE_URL || 'https://repositor-backend.onrender.com';

    const PWA_TABS = {
        'pwa-home': { render: renderHome, title: 'Início' },
        'registro-rota': { render: renderRegistroRota, title: 'Registro de Rota' },
        'documentos': { render: renderDocumentos, title: 'Documentos' },
        'pwa-consultas': { render: renderConsultas, title: 'Consultas' },
        'pwa-mais': { render: renderMais, title: 'Mais' }
    };

    const CONSULTAS = [
        { id: 'consulta-visitas', icon: '&#128270;', label: 'Consulta de Visitas' },
        { id: 'consulta-campanha', icon: '&#128248;', label: 'Consulta Campanha' },
        { id: 'consulta-roteiro', icon: '&#128203;', label: 'Consulta Roteiro' },
        { id: 'consulta-documentos', icon: '&#128196;', label: 'Consulta Documentos' },
        { id: 'consulta-despesas', icon: '&#128176;', label: 'Consulta Despesas' }
    ];

    let currentTab = 'pwa-home';
    let pwaContent = null;
    let isInitialized = false;
    let initialSyncDone = false;
    let cachedData = {
        roteiro: null,
        clientes: null,
        tiposDocumento: null,
        tiposGasto: null,
        usuario: null
    };

    // ==================== INIT ====================

    window.pwaApp = {
        init,
        navigate,
        getCurrentTab: () => currentTab,
        voltarConsultas,
        abrirNaoAtendimento,
        confirmarNaoAtendimento,
        voltarDeNaoAtendimento,
        toggleFiltros,
        buscarConsulta,
        voltarHome
    };

    function init() {
        if (isInitialized) return;
        isInitialized = true;

        pwaContent = document.getElementById('pwaContent');
        if (!pwaContent) {
            console.error('[PWA] pwaContent não encontrado no DOM!');
            isInitialized = false;
            return;
        }

        document.body.classList.add('pwa-mode');
        setupTabs();
        updateHeader();
        setupConnectivity();
        setupSyncBadge();

        // Render home imediatamente
        navigate('pwa-home');

        // Carga inicial em background
        triggerInitialSync();

        console.log('[PWA] App inicializado - modo telas cheias');
    }

    // ==================== DADOS OFFLINE-FIRST ====================

    /**
     * Carregar dados do IndexedDB (instantâneo)
     * Se não houver dados, retorna array vazio
     */
    async function loadLocalData() {
        try {
            if (typeof offlineDB === 'undefined') return;
            await offlineDB.init();

            const [roteiro, clientes, tiposDoc, tiposGasto] = await Promise.all([
                offlineDB.getAll('roteiro').catch(() => []),
                offlineDB.getAll('clientes').catch(() => []),
                offlineDB.getAll('tiposDocumento').catch(() => []),
                offlineDB.getAll('tiposGasto').catch(() => [])
            ]);

            cachedData.roteiro = roteiro;
            cachedData.clientes = clientes;
            cachedData.tiposDocumento = tiposDoc;
            cachedData.tiposGasto = tiposGasto;

            console.log('[PWA] Dados locais carregados:', {
                roteiro: roteiro.length,
                clientes: clientes.length,
                tiposDoc: tiposDoc.length,
                tiposGasto: tiposGasto.length
            });
        } catch (e) {
            console.error('[PWA] Erro ao carregar dados locais:', e);
        }
    }

    /**
     * Obter roteiro do dia do cache local
     */
    async function getRoteiroHoje() {
        try {
            const hoje = getHojeBR();
            if (typeof offlineDB !== 'undefined' && offlineDB.getRoteiroDia) {
                await offlineDB.init();
                return await offlineDB.getRoteiroDia(hoje);
            }
        } catch (e) {
            console.warn('[PWA] Erro ao buscar roteiro local:', e);
        }

        // Fallback: filtrar do cache geral
        if (cachedData.roteiro) {
            const hoje = getHojeBR();
            return cachedData.roteiro.filter(r => r.data_visita === hoje);
        }
        return [];
    }

    /**
     * Obter tipos de documentos (do IndexedDB)
     */
    async function getTiposDocumento() {
        try {
            if (typeof offlineDB !== 'undefined') {
                await offlineDB.init();
                const tipos = await offlineDB.getTiposDocumento();
                if (tipos && tipos.length > 0) return tipos;
            }
        } catch (e) {
            console.warn('[PWA] Erro ao buscar tipos doc local:', e);
        }

        // Fallback: tentar API se online
        if (navigator.onLine) {
            try {
                const token = localStorage.getItem('auth_token');
                const resp = await fetch(`${API_BASE_URL}/api/documentos/tipos`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                const data = await resp.json();
                if (data.tipos && data.tipos.length > 0) {
                    // Salvar no cache local
                    if (typeof offlineDB !== 'undefined') {
                        await offlineDB.salvarTiposDocumento(data.tipos);
                    }
                    return data.tipos;
                }
            } catch (e) {
                console.warn('[PWA] Erro ao buscar tipos doc da API:', e);
            }
        }

        return cachedData.tiposDocumento || [];
    }

    // ==================== SYNC INICIAL ====================

    async function triggerInitialSync() {
        if (initialSyncDone) return;
        initialSyncDone = true;

        try {
            // Carregar dados locais primeiro (instantâneo)
            await loadLocalData();

            const hoje = getHojeBR();
            const ultimoSyncDia = localStorage.getItem('pwa_ultimo_sync_dia');

            if (ultimoSyncDia === hoje) {
                console.log('[PWA] Sync do dia já realizado');
                // Re-render home com dados locais
                if (currentTab === 'pwa-home') renderHome();
                return;
            }

            if (typeof syncService === 'undefined' || typeof offlineDB === 'undefined') {
                console.warn('[PWA] SyncService ou OfflineDB não disponível');
                if (currentTab === 'pwa-home') renderHome();
                return;
            }

            await offlineDB.init();
            showSyncIndicator(true);

            if (navigator.onLine) {
                console.log('[PWA] Iniciando carga inicial do dia...');
                const result = await syncService.sincronizarDownload();
                if (result && result.ok) {
                    localStorage.setItem('pwa_ultimo_sync_dia', hoje);
                    localStorage.setItem('ultimo_sync', new Date().toISOString());
                    // Recarregar dados locais após sync
                    await loadLocalData();
                    console.log('[PWA] Carga inicial concluída');
                }
            } else {
                console.log('[PWA] Offline - usando dados locais');
            }

            showSyncIndicator(false);

            if (currentTab === 'pwa-home') renderHome();
        } catch (e) {
            console.error('[PWA] Erro na carga inicial:', e);
            showSyncIndicator(false);
            if (currentTab === 'pwa-home') renderHome();
        }
    }

    function showSyncIndicator(syncing) {
        const icon = document.getElementById('pwaSyncIcon');
        if (!icon) return;
        if (syncing) {
            icon.textContent = '\u27F3';
            icon.style.animation = 'pwa-spin 1s linear infinite';
        } else {
            icon.textContent = '\u2713';
            icon.style.animation = '';
        }
    }

    // ==================== NAVIGATION ====================

    function setupTabs() {
        document.querySelectorAll('.pwa-tab').forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                const target = this.dataset.pwaTab;
                if (target) navigate(target);
            });
        });
    }

    function navigate(tabId) {
        if (!PWA_TABS[tabId] && !tabId.startsWith('consulta-')) return;

        currentTab = tabId;

        // Update tab active state
        document.querySelectorAll('.pwa-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.pwaTab === tabId ||
                (tabId.startsWith('consulta-') && t.dataset.pwaTab === 'pwa-consultas'));
        });

        // Scroll to top
        if (pwaContent) pwaContent.scrollTop = 0;

        // Render page
        const pageConfig = PWA_TABS[tabId];
        if (pageConfig) {
            pageConfig.render();
        } else if (tabId.startsWith('consulta-')) {
            renderConsultaDetalhe(tabId);
        }
    }

    function voltarConsultas() {
        navigate('pwa-consultas');
    }

    function voltarHome() {
        navigate('pwa-home');
    }

    // ==================== HEADER ====================

    function updateHeader() {
        const nameEl = document.getElementById('pwaUserName');
        if (nameEl && typeof authManager !== 'undefined' && authManager.usuario) {
            nameEl.textContent = authManager.usuario.nome_completo || authManager.usuario.username || 'Repositor';
        }
    }

    function setupConnectivity() {
        const dot = document.getElementById('pwaOnlineDot');
        if (!dot) return;
        const update = () => dot.classList.toggle('offline', !navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        update();
    }

    function setupSyncBadge() {
        const badge = document.getElementById('pwaSyncBadge');
        if (!badge) return;
        badge.addEventListener('click', async () => {
            if (typeof syncService !== 'undefined') {
                try {
                    showSyncIndicator(true);
                    await syncService.sincronizarAgora();
                    await loadLocalData();
                    showSyncIndicator(false);
                    showToast('Sincronizado com sucesso');
                } catch (e) {
                    showSyncIndicator(false);
                    showToast('Erro ao sincronizar', 'error');
                }
            }
        });
        updatePendingCount();
        setInterval(updatePendingCount, 30000);
    }

    async function updatePendingCount() {
        const countEl = document.getElementById('pwaPendingCount');
        if (!countEl) return;
        try {
            if (typeof offlineDB !== 'undefined' && offlineDB.contarPendentes) {
                const pendentes = await offlineDB.contarPendentes();
                const total = Object.values(pendentes).reduce((a, b) => a + b, 0);
                if (total > 0) {
                    countEl.textContent = total > 99 ? '99+' : total;
                    countEl.classList.remove('hidden');
                } else {
                    countEl.classList.add('hidden');
                }
            }
        } catch (e) { /* silent */ }
    }

    // ==================== UTILITÁRIOS ====================

    function getUsuario() {
        return authManager?.usuario || {};
    }

    function getRepId() {
        return authManager?.getRepId?.() || authManager?.usuario?.rep_id || null;
    }

    function getHojeBR() {
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date());
        } catch (e) {
            return new Date().toISOString().split('T')[0];
        }
    }

    function formatarData(dateStr) {
        if (!dateStr) return '-';
        try {
            const parts = dateStr.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        } catch (e) {
            return dateStr;
        }
    }

    function showToast(msg, type = 'success') {
        let toast = document.getElementById('pwaToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pwaToast';
            document.body.appendChild(toast);
        }
        toast.className = `pwa-toast pwa-toast-${type} pwa-toast-show`;
        toast.textContent = msg;
        setTimeout(() => toast.classList.remove('pwa-toast-show'), 3000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ==================== PÁGINA: HOME ====================

    function renderHome() {
        const usuario = getUsuario();
        const now = new Date();
        const hora = now.getHours();
        const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

        pwaContent.innerHTML = `
            <div class="pwa-page">
                <div class="pwa-welcome-card">
                    <div class="pwa-welcome-greeting">${saudacao},</div>
                    <div class="pwa-welcome-name">${escapeHtml(usuario.nome_completo || usuario.username || 'Repositor')}</div>
                    <div class="pwa-welcome-date">
                        ${now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                </div>

                <div class="pwa-section-title">Ações Rápidas</div>

                <button class="pwa-action-btn" onclick="pwaApp.navigate('registro-rota')">
                    <span class="pwa-action-icon">&#128205;</span>
                    <span class="pwa-action-text">Registro de Rota</span>
                    <span class="pwa-action-arrow">&#8250;</span>
                </button>

                <button class="pwa-action-btn" onclick="pwaApp.navigate('documentos')">
                    <span class="pwa-action-icon">&#128196;</span>
                    <span class="pwa-action-text">Registro de Documentos</span>
                    <span class="pwa-action-arrow">&#8250;</span>
                </button>

                <div class="pwa-section-title">Roteiro de Hoje</div>
                <div id="pwaRoteiroHoje" class="pwa-card">
                    <div class="pwa-loading-inline">
                        <div class="pwa-spinner-small"></div>
                        <span>Carregando roteiro...</span>
                    </div>
                </div>

                <div class="pwa-section-title">Status</div>
                <div class="pwa-status-row">
                    <div class="pwa-status-item">
                        <div class="pwa-status-number" id="pwaVisitasHoje" style="color:#dc2626;">-</div>
                        <div class="pwa-status-label">Visitas hoje</div>
                    </div>
                    <div class="pwa-status-item">
                        <div class="pwa-status-number" id="pwaPendentesHoje" style="color:#2563eb;">-</div>
                        <div class="pwa-status-label">Pendentes</div>
                    </div>
                    <div class="pwa-status-item">
                        <div class="pwa-status-number" id="pwaSyncStatus" style="color:#16a34a;">&#10003;</div>
                        <div class="pwa-status-label">${navigator.onLine ? 'Online' : 'Offline'}</div>
                    </div>
                </div>
            </div>
        `;

        // Carregar roteiro async
        loadRoteiroHome();
    }

    async function loadRoteiroHome() {
        const container = document.getElementById('pwaRoteiroHoje');
        if (!container) return;

        try {
            const roteiro = await getRoteiroHoje();

            if (roteiro && roteiro.length > 0) {
                let visitados = 0;
                const items = roteiro.slice(0, 20).map(item => {
                    const isVisitado = item.visitado || item.status === 'finalizado';
                    if (isVisitado) visitados++;
                    return `
                        <div class="pwa-roteiro-item">
                            <div class="pwa-roteiro-status ${isVisitado ? 'visitado' : 'pendente'}"></div>
                            <div class="pwa-roteiro-info">
                                <div class="pwa-roteiro-nome">${escapeHtml(item.cli_nome || item.nome || 'Cliente')}</div>
                                <div class="pwa-roteiro-detalhe">${escapeHtml(item.cli_cidade || item.cidade || '')}</div>
                            </div>
                            ${item.hora ? `<div class="pwa-roteiro-hora">${escapeHtml(item.hora)}</div>` : ''}
                        </div>
                    `;
                }).join('');

                container.innerHTML = items;

                // Atualizar contadores
                const visitasEl = document.getElementById('pwaVisitasHoje');
                const pendentesEl = document.getElementById('pwaPendentesHoje');
                if (visitasEl) visitasEl.textContent = visitados;
                if (pendentesEl) pendentesEl.textContent = roteiro.length - visitados;
            } else {
                container.innerHTML = `
                    <div class="pwa-empty-state">
                        <div class="pwa-empty-icon">&#128203;</div>
                        <div class="pwa-empty-text">Nenhum roteiro para hoje</div>
                        <div class="pwa-empty-hint">Sincronize para atualizar os dados</div>
                    </div>
                `;
            }
        } catch (e) {
            console.error('[PWA] Erro ao carregar roteiro:', e);
            container.innerHTML = `
                <div class="pwa-empty-state">
                    <div class="pwa-empty-icon">&#128203;</div>
                    <div class="pwa-empty-text">Roteiro será carregado ao sincronizar</div>
                </div>
            `;
        }
    }

    // ==================== PÁGINA: REGISTRO DE ROTA ====================
    // Delega para o app.js existente - mas em tela cheia dentro do PWA container

    function renderRegistroRota() {
        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page">
                <div class="pwa-page-header-bar">
                    <span class="pwa-page-header-title">Registro de Rota</span>
                </div>
                <div id="pwaRegistroRotaContent" class="pwa-page-body">
                    <div class="pwa-loading-inline">
                        <div class="pwa-spinner-small"></div>
                        <span>Carregando...</span>
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('pwaRegistroRotaContent');
        if (typeof window.app !== 'undefined' && window.app.navigateTo) {
            window.app.navigateTo('registro-rota', {}, { replaceHistory: true, pwaMode: true, pwaContainer: container });
        } else {
            console.warn('[PWA] window.app não disponível para registro-rota');
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Módulo de rota carregando...</div></div>';
        }
    }

    // ==================== PÁGINA: DOCUMENTOS ====================
    // Carrega tipos do IndexedDB, tela cheia

    function renderDocumentos() {
        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page">
                <div class="pwa-page-header-bar">
                    <span class="pwa-page-header-title">Registro de Documentos</span>
                </div>
                <div id="pwaDocumentosContent" class="pwa-page-body">
                    <div class="pwa-loading-inline">
                        <div class="pwa-spinner-small"></div>
                        <span>Carregando tipos de documentos...</span>
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('pwaDocumentosContent');

        // Pré-carregar tipos de documentos do IndexedDB antes de delegar ao app.js
        preloadTiposDocumentos().then(() => {
            if (typeof window.app !== 'undefined' && window.app.navigateTo) {
                window.app.navigateTo('documentos', {}, { replaceHistory: true, pwaMode: true, pwaContainer: container });
            } else {
                container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Módulo de documentos carregando...</div></div>';
            }
        });
    }

    /**
     * Pré-carrega tipos de documentos no state do app.js a partir do IndexedDB
     * Isso resolve o problema de tipos não carregando no PWA
     */
    async function preloadTiposDocumentos() {
        try {
            const tipos = await getTiposDocumento();
            if (tipos && tipos.length > 0 && typeof window.app !== 'undefined') {
                // Injetar no state do app.js para que carregarSelectsTiposDocumentos funcione
                if (window.app.documentosState) {
                    window.app.documentosState.tipos = tipos;
                }
            }
        } catch (e) {
            console.warn('[PWA] Erro ao pré-carregar tipos de documentos:', e);
        }
    }

    // ==================== PÁGINA: CONSULTAS ====================

    function renderConsultas() {
        pwaContent.innerHTML = `
            <div class="pwa-page">
                <div class="pwa-section-title">Consultas</div>
                ${CONSULTAS.map(c => `
                    <div class="pwa-consulta-item" onclick="pwaApp.navigate('${c.id}')">
                        <span class="pwa-consulta-icon">${c.icon}</span>
                        <span class="pwa-consulta-label">${c.label}</span>
                        <span class="pwa-consulta-arrow">&#8250;</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderConsultaDetalhe(consultaId) {
        const consultaInfo = CONSULTAS.find(c => c.id === consultaId);
        const titulo = consultaInfo?.label || 'Consulta';

        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page">
                <div class="pwa-page-header-bar">
                    <button class="pwa-back-btn" onclick="pwaApp.voltarConsultas()">&#8592;</button>
                    <span class="pwa-page-header-title">${titulo}</span>
                </div>
                <div id="pwaConsultaContent" class="pwa-page-body">
                    <div class="pwa-loading-inline">
                        <div class="pwa-spinner-small"></div>
                        <span>Carregando...</span>
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('pwaConsultaContent');
        if (typeof window.app !== 'undefined' && window.app.navigateTo) {
            window.app.navigateTo(consultaId, {}, { replaceHistory: true, pwaMode: true, pwaContainer: container });

            // Após renderizar, aplicar ajustes PWA nos filtros
            setTimeout(() => {
                ajustarFiltrosPWA(container);
                esconderSelectRepositor(container);
            }, 500);
        } else {
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Carregando módulo...</div></div>';
        }
    }

    /**
     * Ajustar filtros para o PWA: torná-los colapsáveis
     */
    function ajustarFiltrosPWA(container) {
        if (!container) return;

        // Encontrar barras de filtro
        const filterBars = container.querySelectorAll('.filter-bar, .doc-filter-section, .performance-filters');
        filterBars.forEach(bar => {
            if (bar.dataset.pwaAjustado) return;
            bar.dataset.pwaAjustado = 'true';

            // Wrap em container colapsável
            const wrapper = document.createElement('div');
            wrapper.className = 'pwa-filtros-wrapper';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'pwa-filtros-toggle';
            toggleBtn.innerHTML = '<span>&#9660; Filtros</span>';
            toggleBtn.onclick = () => {
                wrapper.classList.toggle('pwa-filtros-aberto');
                toggleBtn.innerHTML = wrapper.classList.contains('pwa-filtros-aberto')
                    ? '<span>&#9650; Ocultar Filtros</span>'
                    : '<span>&#9660; Filtros</span>';
            };

            bar.parentNode.insertBefore(wrapper, bar);
            bar.parentNode.insertBefore(toggleBtn, wrapper);
            wrapper.appendChild(bar);

            // Iniciar colapsado
            wrapper.classList.remove('pwa-filtros-aberto');
        });
    }

    /**
     * Esconder select de repositor no PWA - usa repositor logado automaticamente
     */
    function esconderSelectRepositor(container) {
        if (!container) return;

        const repId = getRepId();
        if (!repId) return;

        // Encontrar e esconder todos os selects de repositor
        const selectIds = [
            'consultaRepositor', 'perfRepositor', 'filtro_repositor_consulta_roteiro',
            'uploadRepositor', 'registroRepositor'
        ];

        selectIds.forEach(id => {
            const select = container.querySelector(`#${id}`) || document.getElementById(id);
            if (select) {
                // Setar valor para o repositor logado
                select.value = String(repId);
                // Esconder o grupo do filtro
                const group = select.closest('.form-group, .filter-group');
                if (group) {
                    group.style.display = 'none';
                }
            }
        });
    }

    /**
     * Toggle filtros visíveis/ocultos (chamado pelo botão)
     */
    function toggleFiltros() {
        const wrapper = document.querySelector('.pwa-filtros-wrapper');
        if (wrapper) {
            wrapper.classList.toggle('pwa-filtros-aberto');
        }
    }

    /**
     * Buscar consulta (placeholder para ação do botão)
     */
    function buscarConsulta(tipo) {
        // Delega para o app.js
        if (typeof window.app !== 'undefined') {
            switch (tipo) {
                case 'visitas':
                    window.app.buscarConsultaVisitas?.();
                    break;
                case 'roteiro':
                    window.app.buscarConsultaRoteiro?.();
                    break;
                case 'documentos':
                    window.app.filtrarDocumentosConsulta?.();
                    break;
            }
        }
    }

    // ==================== NÃO ATENDIMENTO - TELA CHEIA (OFFLINE-FIRST) ====================

    /**
     * Abrir tela cheia de não atendimento (substitui modal/popup)
     */
    function abrirNaoAtendimento(repId, clienteId, clienteNome, dataVisita) {
        // Guardar tab anterior para voltar
        const tabAnterior = currentTab;

        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page">
                <div class="pwa-page-header-bar">
                    <button class="pwa-back-btn" onclick="pwaApp.voltarDeNaoAtendimento('${tabAnterior}')">&#8592;</button>
                    <span class="pwa-page-header-title">Não Atendimento</span>
                </div>
                <div class="pwa-page-body" style="padding: 16px;">
                    <div class="pwa-card" style="margin-bottom: 16px;">
                        <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">
                            ${escapeHtml(clienteId)} - ${escapeHtml(clienteNome)}
                        </div>
                        <div style="font-size: 13px; color: #6b7280;">
                            Data: ${formatarData(dataVisita)}
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #374151;">
                            Motivo do não atendimento *
                        </label>
                        <textarea id="pwaMotivoNaoAtendimento"
                            class="pwa-input-textarea"
                            required maxlength="500"
                            placeholder="Ex.: Cliente fechado, sem acesso, etc."
                            rows="4"></textarea>
                    </div>

                    <button id="pwaBtnConfirmarNA" class="pwa-btn-primary"
                        onclick="pwaApp.confirmarNaoAtendimento(${repId}, '${escapeHtml(String(clienteId))}', '${escapeHtml(clienteNome)}', '${dataVisita}')">
                        Confirmar Não Atendimento
                    </button>

                    <div id="pwaNAStatus" style="margin-top: 12px; display: none;"></div>
                </div>
            </div>
        `;
    }

    /**
     * Confirmar não atendimento - OFFLINE-FIRST
     * Salva localmente e tenta enviar se online
     */
    async function confirmarNaoAtendimento(repId, clienteId, clienteNome, dataVisita) {
        const motivo = document.getElementById('pwaMotivoNaoAtendimento')?.value?.trim();
        const btn = document.getElementById('pwaBtnConfirmarNA');
        const statusDiv = document.getElementById('pwaNAStatus');

        if (!motivo) {
            showToast('Informe o motivo do não atendimento', 'error');
            document.getElementById('pwaMotivoNaoAtendimento')?.focus();
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Registrando...';
        }

        const dados = {
            repositor_id: repId,
            cliente_id: clienteId,
            cliente_nome: clienteNome,
            data_visita: dataVisita,
            motivo: motivo,
            registrado_em: new Date().toISOString()
        };

        try {
            // 1. Salvar localmente primeiro (sempre funciona)
            await salvarNaoAtendimentoLocal(dados);

            // 2. Atualizar status visual no app.js se disponível
            if (typeof window.app !== 'undefined' && window.app.atualizarStatusClienteLocal) {
                const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
                window.app.atualizarStatusClienteLocal(normalizeClienteId(clienteId), {
                    status: 'nao_atendido',
                    nao_atendimento_motivo: motivo,
                    rep_id: repId
                });
            }

            // 3. Tentar enviar ao servidor se online
            let enviadoAoServidor = false;
            if (navigator.onLine) {
                try {
                    const token = localStorage.getItem('auth_token');
                    const resp = await fetch(`${API_BASE_URL}/api/registro-rota/nao-atendimento`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify(dados)
                    });
                    const result = await resp.json();
                    if (result?.ok) {
                        enviadoAoServidor = true;
                        await marcarNaoAtendimentoEnviado(dados);
                    }
                } catch (e) {
                    console.warn('[PWA] Erro ao enviar NA ao servidor (será reenviado):', e);
                }
            }

            if (statusDiv) {
                statusDiv.style.display = 'block';
                statusDiv.innerHTML = enviadoAoServidor
                    ? '<div class="pwa-alert-success">Não atendimento registrado e sincronizado.</div>'
                    : '<div class="pwa-alert-warning">Não atendimento salvo localmente. Será enviado na próxima sincronização.</div>';
            }

            showToast('Não atendimento registrado', 'success');

            // Voltar após 1.5s
            setTimeout(() => {
                navigate('registro-rota');
            }, 1500);

        } catch (error) {
            console.error('[PWA] Erro ao registrar não atendimento:', error);
            showToast('Erro: ' + (error.message || 'Falha ao registrar'), 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Confirmar Não Atendimento';
            }
        }
    }

    /**
     * Salvar não atendimento no IndexedDB para envio posterior
     */
    async function salvarNaoAtendimentoLocal(dados) {
        try {
            if (typeof offlineDB !== 'undefined') {
                await offlineDB.init();
                await offlineDB.adicionarRegistroFila({
                    tipo: 'nao_atendimento',
                    ...dados,
                    syncStatus: 'pending'
                });
            }

            // Backup em localStorage como fallback
            const pendentes = JSON.parse(localStorage.getItem('pwa_na_pendentes') || '[]');
            pendentes.push(dados);
            localStorage.setItem('pwa_na_pendentes', JSON.stringify(pendentes));
        } catch (e) {
            console.error('[PWA] Erro ao salvar NA local:', e);
            // Pelo menos salvar no localStorage
            const pendentes = JSON.parse(localStorage.getItem('pwa_na_pendentes') || '[]');
            pendentes.push(dados);
            localStorage.setItem('pwa_na_pendentes', JSON.stringify(pendentes));
        }
    }

    async function marcarNaoAtendimentoEnviado(dados) {
        try {
            // Remover do localStorage
            const pendentes = JSON.parse(localStorage.getItem('pwa_na_pendentes') || '[]');
            const filtrados = pendentes.filter(p =>
                !(p.cliente_id === dados.cliente_id && p.data_visita === dados.data_visita)
            );
            localStorage.setItem('pwa_na_pendentes', JSON.stringify(filtrados));
        } catch (e) {
            console.warn('[PWA] Erro ao marcar NA como enviado:', e);
        }
    }

    function voltarDeNaoAtendimento(tabAnterior) {
        if (tabAnterior && tabAnterior !== 'pwa-home') {
            navigate(tabAnterior);
        } else {
            navigate('registro-rota');
        }
    }

    // ==================== PÁGINA: MAIS ====================

    function renderMais() {
        const usuario = getUsuario();
        const ultimoSync = localStorage.getItem('ultimo_sync');
        const syncText = ultimoSync
            ? new Date(ultimoSync).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : 'Nunca';

        pwaContent.innerHTML = `
            <div class="pwa-page">
                <!-- Perfil -->
                <div class="pwa-card" style="text-align:center; padding: 24px 16px;">
                    <div class="pwa-avatar">
                        ${(usuario.nome_completo || usuario.username || 'R')[0].toUpperCase()}
                    </div>
                    <div style="font-size:16px; font-weight:600; color:#1f2937; margin-top: 8px;">
                        ${escapeHtml(usuario.nome_completo || usuario.username || 'Repositor')}
                    </div>
                    <div style="font-size:12px; color:#9ca3af; margin-top:2px;">${escapeHtml(usuario.perfil || 'repositor')}</div>
                </div>

                <div class="pwa-section-title">Sincronização</div>
                <div class="pwa-menu-group">
                    <div class="pwa-menu-item" id="pwaMenuSync">
                        <span class="pwa-menu-icon">&#8635;</span>
                        <span class="pwa-menu-label">Sincronizar agora</span>
                        <span class="pwa-menu-value">${navigator.onLine ? 'Online' : 'Offline'}</span>
                    </div>
                    <div class="pwa-menu-item">
                        <span class="pwa-menu-icon">&#128338;</span>
                        <span class="pwa-menu-label">Último sync</span>
                        <span class="pwa-menu-value">${syncText}</span>
                    </div>
                    <div class="pwa-menu-item" id="pwaMenuPendentes">
                        <span class="pwa-menu-icon">&#128228;</span>
                        <span class="pwa-menu-label">Itens pendentes</span>
                        <span class="pwa-menu-value" id="pwaMenuPendentesCount">Verificando...</span>
                    </div>
                </div>

                <div class="pwa-section-title">Conta</div>
                <div class="pwa-menu-group">
                    <div class="pwa-menu-item danger" id="pwaMenuSair">
                        <span class="pwa-menu-icon">&#10005;</span>
                        <span class="pwa-menu-label">Sair</span>
                    </div>
                </div>

                <div style="text-align:center; margin-top: 24px; font-size: 11px; color: #d1d5db;">
                    v2.0 - PWA Offline-First
                </div>
            </div>
        `;

        // Event listeners
        document.getElementById('pwaMenuSync')?.addEventListener('click', async () => {
            if (typeof syncService !== 'undefined') {
                try {
                    showSyncIndicator(true);
                    await syncService.sincronizarAgora();
                    await loadLocalData();
                    showSyncIndicator(false);
                    showToast('Sincronizado com sucesso');
                    renderMais(); // Re-render
                } catch (e) {
                    showSyncIndicator(false);
                    showToast('Erro: ' + e.message, 'error');
                }
            }
        });

        document.getElementById('pwaMenuSair')?.addEventListener('click', () => {
            if (confirm('Deseja realmente sair?')) {
                if (typeof authManager !== 'undefined') authManager.logout();
                window.location.reload();
            }
        });

        loadPendingCountMais();
    }

    async function loadPendingCountMais() {
        const el = document.getElementById('pwaMenuPendentesCount');
        if (!el) return;
        try {
            if (typeof offlineDB !== 'undefined' && offlineDB.contarPendentes) {
                const pendentes = await offlineDB.contarPendentes();
                const total = Object.values(pendentes).reduce((a, b) => a + b, 0);
                el.textContent = total > 0 ? `${total} itens` : 'Nenhum';
            } else {
                el.textContent = '0';
            }
        } catch (e) {
            el.textContent = 'Erro';
        }
    }

})();
