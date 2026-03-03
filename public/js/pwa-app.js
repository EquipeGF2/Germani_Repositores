/**
 * PWA App Controller - v3.0
 * Motor de navegação e renderização para o modo mobile PWA
 * Prioridade: INLINE-FIRST, zero popups, tabs sempre visíveis
 *
 * Princípios:
 * 1. Dados do IndexedDB primeiro, fallback para API
 * 2. Sync com servidor em background
 * 3. TUDO renderizado inline no pwaContent (sem modais/popups)
 * 4. Bottom tabs SEMPRE visíveis
 * 5. Repositor logado = filtro automático
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
    let previousTab = null;
    let navigationStack = ['pwa-home'];
    let pwaContent = null;
    let isInitialized = false;
    let initialSyncDone = false;
    let toastTimer = null;
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
        voltarHome,
        abrirCheckinTela,
        voltarDeCheckin
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
        setupBackNavigation();
        interceptModalCaptura();

        // Render home imediatamente
        navigate('pwa-home');

        // Carga inicial em background
        triggerInitialSync();

        console.log('[PWA] App v3.0 inicializado - inline-first, zero popups');
    }

    // ==================== INTERCEPTAR MODAL CAPTURA ====================
    // Substitui o modal overlay do app.js por tela inline no PWA

    function interceptModalCaptura() {
        // Guardar referência original
        const waitForApp = () => {
            if (typeof window.app !== 'undefined' && window.app.abrirModalCaptura) {
                const originalAbrir = window.app.abrirModalCaptura.bind(window.app);
                const originalFechar = window.app.fecharModalCaptura.bind(window.app);

                // Substituir por versão inline do PWA
                window.app.abrirModalCaptura = function(repId, clienteId, clienteNome, enderecoLinha, dataVisita, tipoRegistro, enderecoCadastro, novaVisita) {
                    if (authManager?.isPWA) {
                        pwaApp.abrirCheckinTela(repId, clienteId, clienteNome, enderecoLinha, dataVisita, tipoRegistro, enderecoCadastro, novaVisita);
                    } else {
                        originalAbrir(repId, clienteId, clienteNome, enderecoLinha, dataVisita, tipoRegistro, enderecoCadastro, novaVisita);
                    }
                };

                window.app.fecharModalCaptura = function() {
                    if (authManager?.isPWA) {
                        pwaApp.voltarDeCheckin();
                    } else {
                        originalFechar();
                    }
                };

                // Guardar original para uso interno
                window.app._originalAbrirModalCaptura = originalAbrir;
                window.app._originalFecharModalCaptura = originalFechar;

                console.log('[PWA] Modal captura interceptado - será inline');
            } else {
                setTimeout(waitForApp, 200);
            }
        };
        waitForApp();
    }

    // ==================== DADOS OFFLINE-FIRST + API FALLBACK ====================

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

            console.log('[PWA] Dados locais:', {
                roteiro: roteiro.length,
                clientes: clientes.length
            });
        } catch (e) {
            console.error('[PWA] Erro dados locais:', e);
        }
    }

    function getDiaSemanaHoje() {
        const diasMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        try {
            const now = new Date();
            // Usar timezone de Brasília
            const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            return diasMap[brDate.getDay()];
        } catch (e) {
            return diasMap[new Date().getDay()];
        }
    }

    function filtrarRoteiroDia(roteiro, diaSemana) {
        if (!roteiro || roteiro.length === 0) return [];
        // Filtrar por dia_semana (formato usado pelo backend: seg, ter, qua, etc.)
        const filtrado = roteiro.filter(r => r.dia_semana === diaSemana);
        if (filtrado.length > 0) return filtrado;
        // Fallback: filtrar por data_visita (caso dados tenham esse campo)
        const hoje = getHojeBR();
        const filtradoPorData = roteiro.filter(r => r.data_visita === hoje);
        if (filtradoPorData.length > 0) return filtradoPorData;
        return [];
    }

    async function getRoteiroHoje() {
        const diaSemana = getDiaSemanaHoje();

        // 1. Tentar IndexedDB
        try {
            if (typeof offlineDB !== 'undefined') {
                await offlineDB.init();
                // Tentar buscar todos e filtrar por dia_semana
                const todos = await offlineDB.getAll('roteiro');
                const filtrado = filtrarRoteiroDia(todos, diaSemana);
                if (filtrado.length > 0) return filtrado;
            }
        } catch (e) {
            console.warn('[PWA] Erro IndexedDB roteiro:', e);
        }

        // 2. Fallback: cache geral
        if (cachedData.roteiro && cachedData.roteiro.length > 0) {
            const filtrado = filtrarRoteiroDia(cachedData.roteiro, diaSemana);
            if (filtrado.length > 0) return filtrado;
        }

        // 3. Fallback: buscar direto da API
        if (navigator.onLine) {
            try {
                const token = localStorage.getItem('auth_token');
                const resp = await fetch(`${API_BASE_URL}/api/sync/roteiro`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                const data = await resp.json();
                if (data.ok && data.roteiro && data.roteiro.length > 0) {
                    // Salvar no IndexedDB para próxima vez
                    if (typeof offlineDB !== 'undefined') {
                        try {
                            await offlineDB.init();
                            await offlineDB.salvarRoteiro(data.roteiro);
                        } catch (e) { /* silent */ }
                    }
                    cachedData.roteiro = data.roteiro;
                    return filtrarRoteiroDia(data.roteiro, diaSemana);
                }
            } catch (e) {
                console.warn('[PWA] Erro API roteiro:', e);
            }
        }

        return [];
    }

    async function getTiposDocumento() {
        try {
            if (typeof offlineDB !== 'undefined') {
                await offlineDB.init();
                const tipos = await offlineDB.getTiposDocumento();
                if (tipos && tipos.length > 0) return tipos;
            }
        } catch (e) { /* silent */ }

        if (navigator.onLine) {
            try {
                const token = localStorage.getItem('auth_token');
                const resp = await fetch(`${API_BASE_URL}/api/documentos/tipos`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                const data = await resp.json();
                if (data.tipos && data.tipos.length > 0) {
                    if (typeof offlineDB !== 'undefined') {
                        await offlineDB.salvarTiposDocumento(data.tipos);
                    }
                    return data.tipos;
                }
            } catch (e) { /* silent */ }
        }

        return cachedData.tiposDocumento || [];
    }

    // ==================== SYNC INICIAL ====================

    async function triggerInitialSync() {
        if (initialSyncDone) return;
        initialSyncDone = true;

        try {
            await loadLocalData();

            const hoje = getHojeBR();
            const ultimoSyncDia = localStorage.getItem('pwa_ultimo_sync_dia');

            if (ultimoSyncDia === hoje) {
                console.log('[PWA] Sync do dia já realizado');
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
                console.log('[PWA] Iniciando carga do dia...');
                const result = await syncService.sincronizarDownload();
                if (result && result.ok) {
                    localStorage.setItem('pwa_ultimo_sync_dia', hoje);
                    localStorage.setItem('ultimo_sync', new Date().toISOString());
                    await loadLocalData();
                }
            }

            showSyncIndicator(false);
            if (currentTab === 'pwa-home') renderHome();
        } catch (e) {
            console.error('[PWA] Erro sync inicial:', e);
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

    function navigate(tabId, skipHistory) {
        if (!PWA_TABS[tabId] && !tabId.startsWith('consulta-')) return;

        previousTab = currentTab;
        currentTab = tabId;

        if (!skipHistory) {
            navigationStack.push(tabId);
            if (navigationStack.length > 20) navigationStack.shift();
            history.pushState({ pwaTab: tabId }, '', '');
        }

        // Update tab active state - SEMPRE visível
        document.querySelectorAll('.pwa-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.pwaTab === tabId ||
                (tabId.startsWith('consulta-') && t.dataset.pwaTab === 'pwa-consultas'));
        });

        // Garantir tabs visíveis
        showBottomTabs(true);

        if (pwaContent) pwaContent.scrollTop = 0;

        const pageConfig = PWA_TABS[tabId];
        if (pageConfig) {
            pageConfig.render();
        } else if (tabId.startsWith('consulta-')) {
            renderConsultaDetalhe(tabId);
        }
    }

    function showBottomTabs(visible) {
        // Bottom tabs devem SEMPRE ficar visíveis
        const tabs = document.querySelector('.pwa-tabs');
        if (tabs) {
            tabs.style.display = 'flex';
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
                    if (currentTab === 'pwa-home') renderHome();
                } catch (e) {
                    showSyncIndicator(false);
                    showToast('Erro ao sincronizar', 'error');
                }
            }
        });
        updatePendingCount();
        setInterval(updatePendingCount, 30000);
    }

    // ==================== BACK NAVIGATION ====================

    function setupBackNavigation() {
        history.replaceState({ pwaTab: 'pwa-home' }, '', '');

        window.addEventListener('popstate', function(e) {
            if (navigationStack.length > 1) {
                navigationStack.pop();
                const prevTab = navigationStack[navigationStack.length - 1];
                navigate(prevTab, true);
            } else {
                history.pushState({ pwaTab: 'pwa-home' }, '', '');
                if (currentTab !== 'pwa-home') {
                    navigate('pwa-home', true);
                }
            }
        });
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
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }

        let toast = document.getElementById('pwaToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pwaToast';
            document.body.appendChild(toast);
        }
        toast.style.display = 'block';
        toast.className = `pwa-toast pwa-toast-${type} pwa-toast-show`;
        toast.textContent = msg;
        toast.style.pointerEvents = 'none';

        toastTimer = setTimeout(() => {
            toast.classList.remove('pwa-toast-show');
            setTimeout(() => {
                toast.style.display = 'none';
            }, 400);
        }, 2500);
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

                <button class="pwa-action-btn" onclick="pwaApp.navigate('pwa-consultas')">
                    <span class="pwa-action-icon">&#128270;</span>
                    <span class="pwa-action-text">Consultas</span>
                    <span class="pwa-action-arrow">&#8250;</span>
                </button>

                <div class="pwa-section-title" style="display:flex;align-items:center;justify-content:space-between;">
                    <span>Roteiro de Hoje</span>
                    <button onclick="pwaApp.navigate('registro-rota')" style="background:none;border:none;color:#dc2626;font-size:13px;font-weight:600;cursor:pointer;">Ver roteiro &#8250;</button>
                </div>
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

    async function getClientesMap() {
        // Buscar clientes do cache ou IndexedDB para enriquecer roteiro
        if (cachedData.clientes && cachedData.clientes.length > 0) {
            const map = {};
            cachedData.clientes.forEach(c => {
                const id = String(c.cli_codigo || c.cliente_id || '').trim();
                if (id) map[id] = c;
            });
            return map;
        }
        try {
            if (typeof offlineDB !== 'undefined') {
                await offlineDB.init();
                const clientes = await offlineDB.getAll('clientes');
                if (clientes && clientes.length > 0) {
                    const map = {};
                    clientes.forEach(c => {
                        const id = String(c.cli_codigo || c.cliente_id || '').trim();
                        if (id) map[id] = c;
                    });
                    return map;
                }
            }
        } catch (e) { /* silent */ }
        return {};
    }

    async function loadRoteiroHome() {
        const container = document.getElementById('pwaRoteiroHoje');
        if (!container) return;

        try {
            const roteiro = await getRoteiroHoje();

            if (roteiro && roteiro.length > 0) {
                // Enriquecer roteiro com dados de clientes
                const clientesMap = await getClientesMap();

                let visitados = 0;
                const items = roteiro.slice(0, 20).map(item => {
                    const clienteId = String(item.cliente_id || item.cli_codigo || '').trim();
                    const clienteInfo = clientesMap[clienteId] || {};
                    const nome = item.cli_nome || clienteInfo.cli_nome || clienteInfo.cli_fantasia || item.nome || clienteId || 'Cliente';
                    const cidade = item.cli_cidade || clienteInfo.cli_cidade || item.cidade || '';

                    const isVisitado = item.visitado || item.status === 'finalizado';
                    if (isVisitado) visitados++;
                    return `
                        <div class="pwa-roteiro-item">
                            <div class="pwa-roteiro-status ${isVisitado ? 'visitado' : 'pendente'}"></div>
                            <div class="pwa-roteiro-info">
                                <div class="pwa-roteiro-nome">${escapeHtml(nome)}</div>
                                <div class="pwa-roteiro-detalhe">${escapeHtml(cidade)}</div>
                            </div>
                            ${item.hora ? `<div class="pwa-roteiro-hora">${escapeHtml(item.hora)}</div>` : ''}
                        </div>
                    `;
                }).join('');

                container.innerHTML = items;

                const visitasEl = document.getElementById('pwaVisitasHoje');
                const pendentesEl = document.getElementById('pwaPendentesHoje');
                if (visitasEl) visitasEl.textContent = visitados;
                if (pendentesEl) pendentesEl.textContent = roteiro.length - visitados;
            } else {
                // Sem dados - mostrar botão de retry se online
                container.innerHTML = `
                    <div class="pwa-empty-state">
                        <div class="pwa-empty-icon">&#128203;</div>
                        <div class="pwa-empty-text">Nenhum roteiro para hoje</div>
                        <div class="pwa-empty-hint">${navigator.onLine ? 'Toque para sincronizar' : 'Conecte-se para sincronizar'}</div>
                    </div>
                `;
                if (navigator.onLine) {
                    container.style.cursor = 'pointer';
                    container.onclick = async () => {
                        container.onclick = null;
                        container.style.cursor = '';
                        container.innerHTML = '<div class="pwa-loading-inline"><div class="pwa-spinner-small"></div><span>Sincronizando...</span></div>';
                        try {
                            if (typeof syncService !== 'undefined') {
                                showSyncIndicator(true);
                                await syncService.sincronizarDownload();
                                await loadLocalData();
                                localStorage.setItem('pwa_ultimo_sync_dia', getHojeBR());
                                localStorage.setItem('ultimo_sync', new Date().toISOString());
                                showSyncIndicator(false);
                            }
                            await loadRoteiroHome();
                        } catch (e) {
                            showSyncIndicator(false);
                            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Erro ao sincronizar. Tente novamente.</div></div>';
                        }
                    };
                }
            }
        } catch (e) {
            console.error('[PWA] Erro roteiro home:', e);
            container.innerHTML = `
                <div class="pwa-empty-state">
                    <div class="pwa-empty-icon">&#128203;</div>
                    <div class="pwa-empty-text">Roteiro será carregado ao sincronizar</div>
                </div>
            `;
        }
    }

    // ==================== PÁGINA: REGISTRO DE ROTA ====================

    function renderRegistroRota() {
        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page">
                <div class="pwa-page-header-bar">
                    <button class="pwa-back-btn" onclick="pwaApp.voltarHome()">&#8592;</button>
                    <span class="pwa-page-header-title">Registro de Rota</span>
                </div>
                <div id="pwaRegistroRotaContent" class="pwa-page-body pwa-rota-body">
                    <div class="pwa-loading-inline">
                        <div class="pwa-spinner-small"></div>
                        <span>Carregando roteiro...</span>
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('pwaRegistroRotaContent');
        if (typeof window.app !== 'undefined' && window.app.navigateTo) {
            window.app.navigateTo('registro-rota', {}, { replaceHistory: true, pwaMode: true, pwaContainer: container });
        } else {
            console.warn('[PWA] window.app não disponível');
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Módulo carregando...</div></div>';
        }
    }

    // ==================== PÁGINA: DOCUMENTOS ====================

    function renderDocumentos() {
        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page">
                <div class="pwa-page-header-bar">
                    <button class="pwa-back-btn" onclick="pwaApp.voltarHome()">&#8592;</button>
                    <span class="pwa-page-header-title">Registro de Documentos</span>
                </div>
                <div id="pwaDocumentosContent" class="pwa-page-body">
                    <div class="pwa-loading-inline">
                        <div class="pwa-spinner-small"></div>
                        <span>Carregando...</span>
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('pwaDocumentosContent');

        preloadTiposDocumentos().then(() => {
            if (typeof window.app !== 'undefined' && window.app.navigateTo) {
                window.app.navigateTo('documentos', {}, { replaceHistory: true, pwaMode: true, pwaContainer: container });
            } else {
                container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Módulo carregando...</div></div>';
            }
        });
    }

    async function preloadTiposDocumentos() {
        try {
            const tipos = await getTiposDocumento();
            if (tipos && tipos.length > 0 && typeof window.app !== 'undefined') {
                if (window.app.documentosState) {
                    window.app.documentosState.tipos = tipos;
                }
            }
        } catch (e) { /* silent */ }
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

            setTimeout(() => {
                ajustarFiltrosPWA(container);
                esconderSelectRepositor(container);
            }, 500);
        } else {
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Carregando...</div></div>';
        }
    }

    function ajustarFiltrosPWA(container) {
        if (!container) return;

        const filterBars = container.querySelectorAll('.filter-bar, .doc-filter-section, .performance-filters');
        filterBars.forEach(bar => {
            if (bar.dataset.pwaAjustado) return;
            bar.dataset.pwaAjustado = 'true';

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

            wrapper.classList.remove('pwa-filtros-aberto');
        });
    }

    function esconderSelectRepositor(container) {
        if (!container) return;

        const repId = getRepId();
        if (!repId) return;

        const selectIds = [
            'consultaRepositor', 'perfRepositor', 'filtro_repositor_consulta_roteiro',
            'uploadRepositor', 'registroRepositor'
        ];

        selectIds.forEach(id => {
            const select = container.querySelector(`#${id}`) || document.getElementById(id);
            if (select) {
                select.value = String(repId);
                const group = select.closest('.form-group, .filter-group');
                if (group) {
                    group.style.display = 'none';
                }
            }
        });
    }

    function toggleFiltros() {
        const wrapper = document.querySelector('.pwa-filtros-wrapper');
        if (wrapper) {
            wrapper.classList.toggle('pwa-filtros-aberto');
        }
    }

    function buscarConsulta(tipo) {
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

    // ==================== NÃO ATENDIMENTO - INLINE ====================

    function abrirNaoAtendimento(repId, clienteId, clienteNome, dataVisita) {
        const tabAnterior = currentTab;

        navigationStack.push('pwa-nao-atendimento');
        history.pushState({ pwaTab: 'pwa-nao-atendimento' }, '', '');

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
            await salvarNaoAtendimentoLocal(dados);

            if (typeof window.app !== 'undefined' && window.app.atualizarStatusClienteLocal) {
                const normalizeClienteId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
                window.app.atualizarStatusClienteLocal(normalizeClienteId(clienteId), {
                    status: 'nao_atendido',
                    nao_atendimento_motivo: motivo,
                    rep_id: repId
                });
            }

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
                } catch (e) { /* será reenviado */ }
            }

            if (statusDiv) {
                statusDiv.style.display = 'block';
                statusDiv.innerHTML = enviadoAoServidor
                    ? '<div class="pwa-alert-success">Não atendimento registrado e sincronizado.</div>'
                    : '<div class="pwa-alert-warning">Salvo localmente. Será enviado na próxima sincronização.</div>';
            }

            showToast('Não atendimento registrado');

            setTimeout(() => {
                showBottomTabs(true);
                navigate('registro-rota');
            }, 1500);

        } catch (error) {
            console.error('[PWA] Erro ao registrar NA:', error);
            showToast('Erro: ' + (error.message || 'Falha'), 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Confirmar Não Atendimento';
            }
        }
    }

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
            const pendentes = JSON.parse(localStorage.getItem('pwa_na_pendentes') || '[]');
            pendentes.push(dados);
            localStorage.setItem('pwa_na_pendentes', JSON.stringify(pendentes));
        } catch (e) {
            const pendentes = JSON.parse(localStorage.getItem('pwa_na_pendentes') || '[]');
            pendentes.push(dados);
            localStorage.setItem('pwa_na_pendentes', JSON.stringify(pendentes));
        }
    }

    async function marcarNaoAtendimentoEnviado(dados) {
        try {
            const pendentes = JSON.parse(localStorage.getItem('pwa_na_pendentes') || '[]');
            const filtrados = pendentes.filter(p =>
                !(p.cliente_id === dados.cliente_id && p.data_visita === dados.data_visita)
            );
            localStorage.setItem('pwa_na_pendentes', JSON.stringify(filtrados));
        } catch (e) { /* silent */ }
    }

    function voltarDeNaoAtendimento(tabAnterior) {
        showBottomTabs(true);
        if (tabAnterior && tabAnterior !== 'pwa-home') {
            navigate(tabAnterior);
        } else {
            navigate('registro-rota');
        }
    }

    // ==================== CHECK-IN/CHECKOUT INLINE (substitui modal overlay) ====================

    /**
     * Renderiza a tela de checkin/checkout DENTRO do pwaContent
     * Sem modal overlay - as tabs continuam visíveis
     * O modal de captura do app.js é renderizado inline aqui
     */
    function abrirCheckinTela(repId, clienteId, clienteNome, enderecoLinha, dataVisita, tipoRegistro, enderecoCadastro, novaVisita) {
        previousTab = currentTab;

        navigationStack.push('pwa-checkin');
        history.pushState({ pwaTab: 'pwa-checkin' }, '', '');

        const tipoLabel = (tipoRegistro || 'checkin').toUpperCase();
        const tipoColor = tipoRegistro === 'checkout' ? '#dc2626'
            : tipoRegistro === 'campanha' ? '#f59e0b'
            : '#3b82f6';

        // CRÍTICO: Salvar o modal ANTES de substituir o innerHTML,
        // pois ele faz parte do conteúdo da página registro-rota que será destruída
        const modalSalvo = document.getElementById('modalCapturarVisita');
        if (modalSalvo && modalSalvo.parentNode) {
            modalSalvo.parentNode.removeChild(modalSalvo);
        }

        // Renderizar tela inline com área para o modal de captura
        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page pwa-checkin-page">
                <div class="pwa-page-header-bar">
                    <button class="pwa-back-btn" onclick="pwaApp.voltarDeCheckin()">&#8592;</button>
                    <span class="pwa-page-header-title">${escapeHtml(clienteNome)}</span>
                    <span class="pwa-checkin-badge" style="background:${tipoColor};">${tipoLabel}</span>
                </div>
                <div class="pwa-checkin-info">
                    <div class="pwa-checkin-cliente">${escapeHtml(clienteId)} - ${escapeHtml(clienteNome)}</div>
                    ${enderecoLinha ? `<div class="pwa-checkin-endereco">${escapeHtml(enderecoLinha)}</div>` : ''}
                    <div class="pwa-checkin-data">${formatarData(dataVisita)}</div>
                </div>
                <div id="pwaCheckinInlineArea" class="pwa-checkin-inline-area">
                    <div class="pwa-loading-inline">
                        <div class="pwa-spinner-small"></div>
                        <span>Obtendo localização...</span>
                    </div>
                </div>
            </div>
        `;

        // Injetar o modal salvo na área inline
        const inlineArea = document.getElementById('pwaCheckinInlineArea');
        if (modalSalvo && inlineArea) {
            inlineArea.innerHTML = '';
            modalSalvo.classList.remove('active');
            modalSalvo.classList.add('pwa-inline-modal');
            inlineArea.appendChild(modalSalvo);
        }

        // Chamar a lógica original do app.js
        setTimeout(() => {
            // Se o modal não foi salvo (primeira navegação ou erro), tentar injetar do DOM
            if (!modalSalvo) {
                injectCaptureModalInline();
            }
            if (typeof window.app !== 'undefined' && window.app._originalAbrirModalCaptura) {
                window.app._originalAbrirModalCaptura(repId, clienteId, clienteNome, enderecoLinha, dataVisita, tipoRegistro, enderecoCadastro, novaVisita);
            }
        }, 50);
    }

    /**
     * Move o modal de captura para dentro da área inline do checkin
     * Em vez de ficar como overlay sobre tudo
     */
    function injectCaptureModalInline() {
        const modal = document.getElementById('modalCapturarVisita');
        const inlineArea = document.getElementById('pwaCheckinInlineArea');
        if (!modal || !inlineArea) return;

        // Mover modal para dentro da área inline
        inlineArea.innerHTML = '';
        inlineArea.appendChild(modal);

        // Forçar o modal a se comportar como conteúdo inline (sem overlay)
        modal.classList.add('pwa-inline-modal');
    }

    function voltarDeCheckin() {
        // Restaurar o modal para sua posição original no DOM
        restoreCaptureModal();

        // Fechar câmera
        if (typeof window.app !== 'undefined') {
            try {
                window.app.pararStreamVideo?.();
                // Limpar state sem chamar fecharModalCaptura (que chamaria voltarDeCheckin de novo)
                const video = document.getElementById('videoPreview');
                if (video) {
                    video.srcObject = null;
                    video.style.display = 'none';
                }
                const modal = document.getElementById('modalCapturarVisita');
                if (modal) modal.classList.remove('active');
            } catch (e) { /* silent */ }
        }

        showBottomTabs(true);

        if (navigationStack.length > 1) {
            navigationStack.pop();
        }
        navigate(previousTab || 'registro-rota');
    }

    /**
     * Remove o modal de captura do inline area.
     * Não precisa restaurar - ao navegar de volta para registro-rota,
     * um novo modal será criado pela renderização da página.
     */
    function restoreCaptureModal() {
        const modal = document.getElementById('modalCapturarVisita');
        if (!modal) return;

        modal.classList.remove('pwa-inline-modal');
        modal.classList.remove('active');
        modal.remove();
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
                    v3.0 - PWA Inline-First
                </div>
            </div>
        `;

        // Event listeners
        document.getElementById('pwaMenuSync')?.addEventListener('click', async () => {
            const syncItem = document.getElementById('pwaMenuSync');
            const syncLabel = syncItem?.querySelector('.pwa-menu-label');
            const syncValue = syncItem?.querySelector('.pwa-menu-value');

            if (typeof syncService !== 'undefined') {
                try {
                    if (syncLabel) syncLabel.textContent = 'Sincronizando...';
                    if (syncValue) syncValue.innerHTML = '<span class="pwa-spinner-small" style="width:16px;height:16px;display:inline-block;"></span>';
                    showSyncIndicator(true);

                    await syncService.sincronizarAgora();
                    await loadLocalData();

                    showSyncIndicator(false);

                    if (syncLabel) syncLabel.textContent = 'Sincronizar agora';
                    if (syncValue) syncValue.textContent = 'Sincronizado';
                    const syncTimeEl = syncItem?.parentElement?.querySelector('.pwa-menu-item:nth-child(2) .pwa-menu-value');
                    if (syncTimeEl) syncTimeEl.textContent = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                    showToast('Sincronizado com sucesso');
                    loadPendingCountMais();
                } catch (e) {
                    showSyncIndicator(false);
                    if (syncLabel) syncLabel.textContent = 'Sincronizar agora';
                    if (syncValue) syncValue.textContent = 'Erro';
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
