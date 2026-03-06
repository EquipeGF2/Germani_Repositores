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
    let currentCheckContext = null;     // Contexto do checkin em andamento
    let currentAtendimentoContext = null; // Contexto da tela de atendimento aberta
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
        voltarDeCheckin,
        abrirAtividadesInline,
        fecharAtividadesInline,
        sincronizarHome,
        // Tela de atendimento pós-checkin
        abrirAtendimentoTela,
        voltarAtendimento,
        reabrirAtendimento,
        atendimentoAbrirAtividade,
        atendimentoAbrirCampanha,
        atendimentoAbrirPesquisa,
        atendimentoAbrirEspaco,
        atendimentoAbrirCheckout,
        atendimentoCancelar,
        atualizarEstadoBtnCheckout: _atualizarEstadoBtnCheckout,
        getRoteiroCache: () => cachedData.roteiro || [],
        getClientesCache: () => cachedData.clientes || []
    };

    async function init() {
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
        setupFiltroRepositorObserver();

        // Carregar dados locais do IndexedDB para cache em memória
        await loadLocalData();

        const hoje = getHojeBR();
        const ultimoSyncDia = localStorage.getItem('pwa_ultimo_sync_dia');
        const precisaSincronizarHoje = ultimoSyncDia !== hoje;

        if (precisaSincronizarHoje && navigator.onLine) {
            // Primeira abertura do dia com internet: sincronização bloqueante
            await performDailySync();
        } else {
            // Já sincronizado hoje ou offline: ir direto para home com dados em cache
            navigate('pwa-home');
            if (!navigator.onLine && precisaSincronizarHoje) {
                showToast('Offline - usando dados anteriores', 'warning');
            }
        }

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
                        const ctx = currentCheckContext;
                        if (ctx?.tipoRegistro === 'checkin') {
                            // Check-in concluído → abrir tela de atendimento
                            restoreCaptureModal();
                            try {
                                window.app.pararStreamVideo?.();
                                const video = document.getElementById('videoPreview');
                                if (video) { video.srcObject = null; video.style.display = 'none'; }
                                const modal = document.getElementById('modalCapturarVisita');
                                if (modal) modal.classList.remove('active');
                            } catch (e) { /* silent */ }
                            showBottomTabs(true);
                            if (navigationStack.length > 1) navigationStack.pop();
                            abrirAtendimentoTela(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.enderecoLinha, ctx.dataVisita, ctx.enderecoCadastro);
                        } else if (ctx?.tipoRegistro === 'campanha') {
                            // Campanha registrada → voltar à tela de atendimento (se aberta) ou à lista
                            voltarDeCheckinParaAtendimento();
                        } else if (ctx?.tipoRegistro === 'checkout') {
                            // Checkout: verificar se foi concluído ou cancelado pelo usuário
                            const normalizeId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
                            const cliNorm = ctx.clienteId ? normalizeId(ctx.clienteId) : null;
                            const statusCliente = cliNorm ? window.app?.registroRotaState?.resumoVisitas?.get(cliNorm) : null;
                            if (statusCliente?.status === 'finalizado') {
                                // Checkout concluído com sucesso → limpar contexto e voltar à lista
                                currentAtendimentoContext = null;
                            }
                            // Se checkout cancelado, currentAtendimentoContext permanece → voltarDeCheckinParaAtendimento volta ao atendimento
                            voltarDeCheckinParaAtendimento();
                        } else {
                            // Cancelamento ou outros → voltar à lista
                            currentAtendimentoContext = null;
                            pwaApp.voltarDeCheckin();
                        }
                    } else {
                        originalFechar();
                    }
                };

                // Guardar original para uso interno
                window.app._originalAbrirModalCaptura = originalAbrir;
                window.app._originalFecharModalCaptura = originalFechar;

                // Interceptar modal de atividades - renderizar inline no PWA
                if (window.app.abrirModalAtividades) {
                    const originalAbrirAtiv = window.app.abrirModalAtividades.bind(window.app);
                    const originalFecharAtiv = window.app.fecharModalAtividades.bind(window.app);

                    window.app.abrirModalAtividades = function(repId, clienteId, clienteNome, dataPlanejada) {
                        if (authManager?.isPWA) {
                            pwaApp.abrirAtividadesInline(repId, clienteId, clienteNome, dataPlanejada);
                        } else {
                            originalAbrirAtiv(repId, clienteId, clienteNome, dataPlanejada);
                        }
                    };

                    window.app.fecharModalAtividades = function() {
                        if (authManager?.isPWA) {
                            pwaApp.fecharAtividadesInline();
                        } else {
                            originalFecharAtiv();
                        }
                    };

                    window.app._originalAbrirModalAtividades = originalAbrirAtiv;
                    window.app._originalFecharModalAtividades = originalFecharAtiv;
                }

                console.log('[PWA] Modais interceptados - captura e atividades serão inline');
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
        const diaLower = (diaSemana || '').toLowerCase().trim();

        // Filtrar por dia_semana (formato usado pelo backend: seg, ter, qua, etc.)
        // Comparação case-insensitive para robustez
        const filtrado = roteiro.filter(r => {
            const val = (r.dia_semana || '').toLowerCase().trim();
            return val === diaLower;
        });
        if (filtrado.length > 0) return filtrado;

        // Fallback: filtrar por data_visita (caso dados tenham esse campo)
        const hoje = getHojeBR();
        const filtradoPorData = roteiro.filter(r => r.data_visita === hoje);
        if (filtradoPorData.length > 0) return filtradoPorData;

        return [];
    }

    async function getRoteiroHoje() {
        const diaSemana = getDiaSemanaHoje();
        let todosRoteiro = null;

        // 1. Tentar IndexedDB
        try {
            if (typeof offlineDB !== 'undefined') {
                await offlineDB.init();
                const todos = await offlineDB.getAll('roteiro');
                if (todos && todos.length > 0) {
                    todosRoteiro = todos;
                    const filtrado = filtrarRoteiroDia(todos, diaSemana);
                    if (filtrado.length > 0) return filtrado;
                }
            }
        } catch (e) {
            console.warn('[PWA] Erro IndexedDB roteiro:', e);
        }

        // 2. Fallback: cache geral
        if (cachedData.roteiro && cachedData.roteiro.length > 0) {
            todosRoteiro = todosRoteiro || cachedData.roteiro;
            const filtrado = filtrarRoteiroDia(cachedData.roteiro, diaSemana);
            if (filtrado.length > 0) return filtrado;
        }

        // 3. Fallback: buscar direto da API
        if (navigator.onLine) {
            try {
                const token = localStorage.getItem('auth_token');
                if (token) {
                    const resp = await fetch(`${API_BASE_URL}/api/sync/roteiro`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.ok && data.roteiro && data.roteiro.length > 0) {
                            todosRoteiro = data.roteiro;
                            // Salvar no IndexedDB para próxima vez
                            if (typeof offlineDB !== 'undefined') {
                                try {
                                    await offlineDB.init();
                                    await offlineDB.salvarRoteiro(data.roteiro);
                                } catch (e) { /* silent */ }
                            }
                            cachedData.roteiro = data.roteiro;
                            const filtrado = filtrarRoteiroDia(data.roteiro, diaSemana);
                            if (filtrado.length > 0) return filtrado;
                        }
                    }
                }
            } catch (e) {
                console.warn('[PWA] Erro API roteiro:', e);
            }
        }

        // 4. Se temos dados mas o filtro do dia não encontrou nada,
        // retornar todos os itens para que o home não fique vazio
        if (todosRoteiro && todosRoteiro.length > 0) {
            console.log('[PWA] Roteiro do dia não encontrado, mostrando todos os itens');
            return todosRoteiro;
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

    // ==================== TELA DE SINCRONIZAÇÃO DIÁRIA ====================

    function showDailySyncScreen() {
        const screen = document.getElementById('pwaDailySyncScreen');
        if (screen) screen.classList.remove('hidden');
    }

    function hideDailySyncScreen() {
        const screen = document.getElementById('pwaDailySyncScreen');
        if (screen) screen.classList.add('hidden');
    }

    function updateDailySyncStatus(msg) {
        const el = document.getElementById('pwaDailySyncStatus');
        if (el) el.textContent = msg;
    }

    function setDailySyncStep(stepNum, state) {
        // state: 'active' | 'done' | 'pending'
        const el = document.getElementById('pwaSyncStep' + stepNum);
        if (!el) return;
        el.className = 'pwa-sync-step ' + state;
    }

    /**
     * Realiza a sincronização diária com tela bloqueante de progresso.
     * Chamado apenas na primeira abertura do dia quando há internet.
     */
    async function performDailySync() {
        if (initialSyncDone) return;
        initialSyncDone = true;

        showDailySyncScreen();
        showSyncIndicator(true);

        try {
            if (typeof syncService === 'undefined' || typeof offlineDB === 'undefined') {
                console.warn('[PWA] SyncService ou OfflineDB não disponível');
                hideDailySyncScreen();
                navigate('pwa-home');
                return;
            }

            await offlineDB.init();

            // Passo 1: Roteiro e clientes
            setDailySyncStep(1, 'active');
            updateDailySyncStatus('Baixando roteiro e clientes...');

            const token = localStorage.getItem('auth_token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            let step1Ok = false;
            try {
                const [roteiroRes, clientesRes, coordenadasRes] = await Promise.all([
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/roteiro`, { headers }).then(r => r.json()),
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/clientes`, { headers }).then(r => r.json()),
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/coordenadas`, { headers }).then(r => r.json())
                ]);

                if (roteiroRes.ok) await offlineDB.salvarRoteiro(roteiroRes.roteiro || []);
                if (clientesRes.ok) await offlineDB.salvarClientes(clientesRes.clientes || []);
                if (coordenadasRes.ok) await offlineDB.salvarCoordenadas(coordenadasRes.coordenadas || []);
                step1Ok = true;
            } catch (e) {
                console.warn('[PWA] Erro parcial no passo 1:', e);
            }
            setDailySyncStep(1, 'done');

            // Passo 2: Tipos e configurações
            setDailySyncStep(2, 'active');
            updateDailySyncStatus('Atualizando configurações...');

            try {
                const [tiposDocRes, tiposGastoRes] = await Promise.all([
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/tipos-documento`, { headers }).then(r => r.json()),
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/tipos-gasto`, { headers }).then(r => r.json())
                ]);
                if (tiposDocRes.ok) await offlineDB.salvarTiposDocumento(tiposDocRes.tipos || []);
                if (tiposGastoRes.ok) await offlineDB.salvarTiposGasto(tiposGastoRes.tipos || []);
            } catch (e) {
                console.warn('[PWA] Erro parcial no passo 2:', e);
            }
            setDailySyncStep(2, 'done');

            // Passo 3: Visitas recentes para consulta offline
            setDailySyncStep(3, 'active');
            updateDailySyncStatus('Baixando visitas recentes...');

            try {
                const repId = typeof authManager !== 'undefined' ? authManager.getRepId?.() : null;
                if (repId) {
                    const hoje = new Date().toISOString().split('T')[0];
                    const quinzeDiasAtras = new Date();
                    quinzeDiasAtras.setDate(quinzeDiasAtras.getDate() - 15);
                    const dataInicio = quinzeDiasAtras.toISOString().split('T')[0];
                    const visitasUrl = `${API_BASE_URL}/api/registro-rota/sessoes?data_checkin_inicio=${dataInicio}&data_checkin_fim=${hoje}&rep_id=${repId}&status=todos`;
                    const visitasRes = await syncService.fetchWithTimeout(visitasUrl, { headers }).then(r => r.json());
                    if (visitasRes.sessoes) {
                        await offlineDB.setSyncMeta('consultaVisitasCache', {
                            sessoes: visitasRes.sessoes,
                            cachedAt: new Date().toISOString(),
                            repId,
                            dataInicio,
                            dataFim: hoje
                        });
                    }
                }
            } catch (e) {
                console.warn('[PWA] Erro ao cachear visitas:', e);
            }

            updateDailySyncStatus('Carregando dados para navegação...');

            // Recarregar cache em memória com dados recém-sincronizados
            await loadLocalData();

            // Registrar sync completo
            const hoje = getHojeBR();
            localStorage.setItem('pwa_ultimo_sync_dia', hoje);
            localStorage.setItem('ultimo_sync', new Date().toISOString());

            // Tentar enviar pendentes em background (não bloqueia)
            if (typeof syncService !== 'undefined') {
                syncService.enviarPendentes().catch(e => console.warn('[PWA] Erro envio pendentes:', e));
            }
            // Sincronizar despesas de viagem salvas offline
            if (typeof app !== 'undefined' && typeof app.syncDespesasPendentes === 'function') {
                app.syncDespesasPendentes().catch(e => console.warn('[PWA] Erro sync despesas offline:', e));
            }

            setDailySyncStep(3, 'done');
            updateDailySyncStatus('Pronto!');

            // Pequena pausa para o usuário ver o "Pronto!" antes de navegar
            await new Promise(resolve => setTimeout(resolve, 600));

        } catch (e) {
            console.error('[PWA] Erro na sincronização diária:', e);
            updateDailySyncStatus('Erro ao sincronizar - usando dados anteriores');
            await new Promise(resolve => setTimeout(resolve, 1500));
        } finally {
            showSyncIndicator(false);
            hideDailySyncScreen();
            navigate('pwa-home');
        }
    }

    // ==================== SYNC INICIAL (legado - mantido para compatibilidade) ====================

    async function triggerInitialSync() {
        // Esta função foi substituída por performDailySync() chamada no init().
        // Mantida para compatibilidade com chamadas externas.
        if (initialSyncDone) return;
        initialSyncDone = true;

        try {
            await loadLocalData();
            showSyncIndicator(false);
            if (currentTab === 'pwa-home') renderHome();
        } catch (e) {
            showSyncIndicator(false);
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

    // ==================== SINCRONIZAÇÃO HOME ====================

    async function sincronizarHome() {
        const btn = document.getElementById('pwaHomeSyncBtn');
        if (btn) {
            btn.style.opacity = '0.6';
            btn.style.pointerEvents = 'none';
            const textEl = btn.querySelector('.pwa-action-text');
            if (textEl) textEl.textContent = 'Sincronizando...';
        }
        try {
            if (typeof syncService !== 'undefined') {
                showSyncIndicator(true);
                await syncService.sincronizarAgora();
                await loadLocalData();
                localStorage.setItem('pwa_ultimo_sync_dia', getHojeBR());
                localStorage.setItem('ultimo_sync', new Date().toISOString());
                // Sincronizar despesas de viagem salvas offline
                if (typeof app !== 'undefined' && typeof app.syncDespesasPendentes === 'function') {
                    await app.syncDespesasPendentes().catch(e => console.warn('[PWA] Erro sync despesas:', e));
                }
                showSyncIndicator(false);
                showToast('Sincronizado com sucesso');
            } else {
                showToast('Serviço de sincronização não disponível', 'error');
            }
        } catch (e) {
            console.error('[PWA] Erro sincronização home:', e);
            showSyncIndicator(false);
            showToast('Erro ao sincronizar', 'error');
        } finally {
            if (btn) {
                btn.style.opacity = '';
                btn.style.pointerEvents = '';
                const textEl = btn.querySelector('.pwa-action-text');
                if (textEl) textEl.textContent = 'Sincronização';
            }
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
                // Telas especiais não estão em PWA_TABS - tratar manualmente
                if (prevTab === 'pwa-atendimento' && currentAtendimentoContext) {
                    const ctx = currentAtendimentoContext;
                    abrirAtendimentoTela(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.endereco, ctx.dataVisita, ctx.enderecoCadastro);
                } else {
                    navigate(prevTab, true);
                }
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

        // Ensure currentAtendimentoContext is recovered from checkinLocal if available
        if (!currentAtendimentoContext && typeof window.app !== 'undefined' && window.app.registroRotaState && window.app.registroRotaState._checkinLocal) {
            const checkin = window.app.registroRotaState._checkinLocal;
            currentAtendimentoContext = {
                repId: checkin.repId,
                clienteId: checkin.clienteId,
                clienteNome: checkin.clienteNome,
                endereco: checkin.enderecoRoteiro || '',
                dataVisita: new Date().toISOString().split('T')[0], // Approximation
                enderecoCadastro: checkin.enderecoResolvido || ''
            };
        }

        const avisoAtendimento = currentAtendimentoContext ? (() => {
            const ctx = currentAtendimentoContext;
            return `
            <div class="pwa-home-atendimento-aviso" onclick="pwaApp.reabrirAtendimento()">
                <div class="pwa-home-aviso-icon">&#9888;</div>
                <div class="pwa-home-aviso-info">
                    <div class="pwa-home-aviso-title">Atendimento em andamento</div>
                    <div class="pwa-home-aviso-nome">${escapeHtml(ctx.clienteNome || '')}</div>
                </div>
                <div class="pwa-home-aviso-btn">Continuar &#8250;</div>
            </div>`;
        })() : '';

        pwaContent.innerHTML = `
            <div class="pwa-page">
                <div class="pwa-welcome-card">
                    <div class="pwa-welcome-greeting">${saudacao},</div>
                    <div class="pwa-welcome-name">${escapeHtml(usuario.nome_completo || usuario.username || 'Repositor')}</div>
                    <div class="pwa-welcome-date">
                        ${now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                </div>

                ${avisoAtendimento}

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

                <button class="pwa-action-btn" onclick="pwaApp.navigate('pwa-mais')">
                    <span class="pwa-action-icon">&#8635;</span>
                    <span class="pwa-action-text">Sincronização</span>
                    <span class="pwa-action-arrow">&#8250;</span>
                </button>
            </div>
        `;
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
        const ctx = currentAtendimentoContext;

        const bannerHtml = ctx ? (() => {
            const nomeEsc = escapeHtml(ctx.clienteNome || '');
            const endEsc = escapeHtml(ctx.endereco || '');
            return `
            <div class="pwa-atendimento-ativo-banner" onclick="pwaApp.reabrirAtendimento()">
                <div class="pwa-aab-info">
                    <div class="pwa-aab-label">Em atendimento</div>
                    <div class="pwa-aab-nome">${nomeEsc}</div>
                    ${endEsc ? `<div class="pwa-aab-end">${endEsc}</div>` : ''}
                </div>
                <div class="pwa-aab-btn">Registrar &#8250;</div>
            </div>`;
        })() : '';

        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page${ctx ? ' pwa-atendimento-ativo' : ''}">
                <div class="pwa-page-header-bar">
                    <button class="pwa-back-btn" onclick="pwaApp.voltarHome()">&#8592;</button>
                    <span class="pwa-page-header-title">Registro de Rota</span>
                </div>
                ${bannerHtml}
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
                // Auto-preencher repId nos selects de consulta em modo PWA
                const repId = typeof authManager !== 'undefined' ? String(authManager.getRepId?.() || '') : '';
                if (repId) {
                    container.querySelectorAll('select[id*="Repositor"], select[id*="repositor"]').forEach(sel => {
                        if (!sel.querySelector(`option[value="${repId}"]`)) {
                            const opt = document.createElement('option');
                            opt.value = repId;
                            opt.textContent = repId;
                            sel.appendChild(opt);
                        }
                        sel.value = repId;
                    });
                }
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

        const usuario = getUsuario();
        const repNome = usuario.nome_completo || usuario.username || `Repositor ${repId}`;

        const selectIds = [
            'consultaRepositor', 'perfRepositor', 'filtro_repositor_consulta_roteiro',
            'uploadRepositor', 'registroRepositor', 'filtro_repositor',
            'filtro_repositor_cadastro', 'filtro_repositor_roteiro',
            'filtro_repositor_checking_cancelado', 'filtro_repositor_validacao',
            'filtro_supervisor', 'filtro_representante', 'filtro_cidade_roteiro'
        ];

        selectIds.forEach(id => {
            const select = container.querySelector(`#${id}`) || document.getElementById(id);
            if (select) {
                if (id.includes('repositor') || id.includes('Repositor')) {
                    // Garantir que a opção do repositor logado existe no select (modo offline)
                    const repIdStr = String(repId);
                    const optionExiste = Array.from(select.options).some(opt => String(opt.value) === repIdStr);
                    if (!optionExiste) {
                        // Injetar opção para o repositor logado
                        const novaOpcao = document.createElement('option');
                        novaOpcao.value = repIdStr;
                        novaOpcao.textContent = repNome;
                        novaOpcao.selected = true;
                        select.appendChild(novaOpcao);
                    }
                    select.value = repIdStr;
                    // Disparar evento change para atualizar filtros dependentes
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const group = select.closest('.form-group, .filter-group, .filter-item');
                if (group) {
                    group.style.display = 'none';
                } else {
                    select.style.display = 'none';
                }
            }
        });

        // Also hide text input filters for repositor
        const textInputIds = ['filtro_nome_repositor', 'filtro_nome_repositor_roteiro'];
        textInputIds.forEach(id => {
            const input = container.querySelector(`#${id}`) || document.getElementById(id);
            if (input) {
                input.value = repNome;
                const group = input.closest('.form-group, .filter-group, .filter-item');
                if (group) group.style.display = 'none';
            }
        });
    }

    /**
     * Observa o pwaContent e esconde campos de filtro repositor quando aparecerem no DOM.
     * Garante que campos dinâmicos (carregados assincronamente) também sejam ocultados.
     */
    function setupFiltroRepositorObserver() {
        const repId = getRepId();
        if (!repId) return;

        const FILTER_IDS = new Set([
            'consultaRepositor', 'perfRepositor', 'filtro_repositor_consulta_roteiro',
            'uploadRepositor', 'registroRepositor', 'filtro_repositor',
            'filtro_repositor_cadastro', 'filtro_repositor_roteiro',
            'filtro_repositor_checking_cancelado', 'filtro_repositor_validacao',
            'filtro_supervisor', 'filtro_representante', 'filtro_cidade_roteiro',
            'filtro_nome_repositor', 'filtro_nome_repositor_roteiro'
        ]);

        const ocultarElemento = (el) => {
            const group = el.closest('.form-group, .filter-group, .filter-item, .pwa-filter-group');
            if (group) { group.style.display = 'none'; } else { el.style.display = 'none'; }
        };

        const obs = new MutationObserver(() => {
            FILTER_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.style.display !== 'none' && !el.closest('.pwa-filtros-wrapper[style*="none"]')) {
                    ocultarElemento(el);
                }
            });
        });

        const content = document.getElementById('pwaContent') || document.body;
        obs.observe(content, { childList: true, subtree: true });
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
        currentCheckContext = { repId, clienteId, clienteNome, enderecoLinha, dataVisita, tipoRegistro, enderecoCadastro };

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
                    <span class="pwa-page-header-title">${tipoLabel}</span>
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

            // Limpar estado visual anterior (evita foto do checkin aparecer na campanha)
            const canvasClear = modalSalvo.querySelector('#canvasCaptura');
            if (canvasClear) {
                try { canvasClear.getContext('2d').clearRect(0, 0, canvasClear.width, canvasClear.height); } catch (_) {}
                canvasClear.style.display = 'none';
            }
            const galeriaClear = modalSalvo.querySelector('#galeriaCampanha');
            if (galeriaClear) galeriaClear.innerHTML = '';
            const galWrapperClear = modalSalvo.querySelector('#galeriaCampanhaWrapper');
            if (galWrapperClear) galWrapperClear.style.display = 'none';
            if (window.app?.registroRotaState) {
                window.app.registroRotaState.fotosCapturadas.forEach(f => f?.url && URL.revokeObjectURL(f.url));
                window.app.registroRotaState.fotosCapturadas = [];
            }

            inlineArea.appendChild(modalSalvo);
        }

        // Chamar a lógica original do app.js
        setTimeout(async () => {
            // Se o modal não foi salvo (primeira navegação ou erro), tentar injetar do DOM
            if (!modalSalvo) {
                injectCaptureModalInline();
            }
            if (typeof window.app !== 'undefined' && window.app._originalAbrirModalCaptura) {
                await window.app._originalAbrirModalCaptura(repId, clienteId, clienteNome, enderecoLinha, dataVisita, tipoRegistro, enderecoCadastro, novaVisita);
            }
            // Checkout: interceptar botão salvar para mostrar overlay bloqueante
            if (tipoRegistro === 'checkout') {
                const btnSalvar = document.getElementById('btnSalvarVisita');
                if (btnSalvar) {
                    btnSalvar.onclick = async () => {
                        mostrarOverlaySync('Enviando checkout...');
                        await window.app.salvarVisita?.();
                        ocultarOverlaySync();
                    };
                }
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

        // Garantir que previousTab seja uma tab válida; senão, ir para registro-rota
        const targetTab = (previousTab && PWA_TABS[previousTab]) ? previousTab : 'registro-rota';
        navigate(targetTab);

        // Refresh route to prevent white screen
        if (typeof window.app !== 'undefined' && window.app.carregarRoteiroRepositor) {
            setTimeout(() => window.app.carregarRoteiroRepositor(), 50);
        }
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
        // Mover de volta ao body (NÃO remover - precisa persistir para próximos usos)
        document.body.appendChild(modal);
    }

    // ==================== TELA DE ATENDIMENTO EM ANDAMENTO ====================

    /**
     * Abre tela full-screen de atendimento após o check-in.
     * Exibe nome/endereço do cliente e ações: atividade, campanha,
     * pesquisa, checkout, cancelar.
     */
    function abrirAtendimentoTela(repId, clienteId, clienteNome, endereco, dataVisita, enderecoCadastro) {
        // Limpar contexto de checkin (já foi usado)
        currentCheckContext = null;

        previousTab = currentTab;
        currentTab = 'pwa-atendimento';
        navigationStack.push('pwa-atendimento');
        history.pushState({ pwaTab: 'pwa-atendimento' }, '', '');

        showBottomTabs(true);
        if (pwaContent) pwaContent.scrollTop = 0;

        currentAtendimentoContext = { repId, clienteId, clienteNome, endereco, dataVisita, enderecoCadastro };
        // Checar pesquisas e espaços pendentes em background para mostrar/esconder botões
        _verificarPesquisaAtendimento(clienteId, repId, dataVisita);
        _verificarEspacoAtendimento(clienteId);

        const hora = new Date().toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
        });

        const nomeEsc = escapeHtml(clienteNome || '');
        const endEsc = escapeHtml(endereco || '');
        const clienteIdEsc = String(clienteId || '').replace(/'/g, "\\'");
        const endCadEsc = String(enderecoCadastro || '').replace(/'/g, "\\'");
        const dataEsc = String(dataVisita || '').replace(/'/g, "\\'");

        pwaContent.innerHTML = `
            <div class="pwa-page pwa-atendimento-page">
                <div class="pwa-page-header-bar">
                    <button class="pwa-back-btn" onclick="pwaApp.voltarAtendimento()">&#8592;</button>
                    <span class="pwa-page-header-title">Atendimento em Andamento</span>
                </div>

                <div class="pwa-atendimento-cliente-card">
                    <div class="pwa-atendimento-cliente-nome">${nomeEsc}</div>
                    ${endEsc ? `<div class="pwa-atendimento-cliente-end">&#128205; ${endEsc}</div>` : ''}
                    <div class="pwa-atendimento-checkin-hora">&#10003; Check-in realizado ${hora}</div>
                </div>

                <div class="pwa-section-title">O que deseja registrar?</div>

                <div class="pwa-atendimento-grid" id="pwaAtendimentoGrid">
                    <button class="pwa-atendimento-action-btn" onclick="pwaApp.atendimentoAbrirAtividade()">
                        <span class="pwa-atendimento-action-icon">&#128203;</span>
                        <span>Atividade</span>
                    </button>
                    <button class="pwa-atendimento-action-btn" onclick="pwaApp.atendimentoAbrirCampanha()">
                        <span class="pwa-atendimento-action-icon">&#128248;</span>
                        <span>Campanha</span>
                    </button>
                    <button class="pwa-atendimento-action-btn" id="pwaAtendimentoBtnEspacos" onclick="pwaApp.atendimentoAbrirEspaco()">
                        <span class="pwa-atendimento-action-icon">&#128230;</span>
                        <span>Espa&#231;os</span>
                    </button>
                    <button class="pwa-atendimento-action-btn" id="pwaAtendimentoBtnPesquisa" onclick="pwaApp.atendimentoAbrirPesquisa()">
                        <span class="pwa-atendimento-action-icon">&#128196;</span>
                        <span>Pesquisa</span>
                    </button>
                    <button id="pwaAtendimentoBtnCheckout" class="pwa-atendimento-action-btn pwa-atendimento-action-checkout pwa-checkout-bloqueado" onclick="pwaApp.atendimentoAbrirCheckout()" disabled>
                        <span class="pwa-atendimento-action-icon">&#128682;</span>
                        <span>Checkout</span>
                    </button>
                </div>

                <div style="padding: 0 16px 16px;">
                    <button class="pwa-atendimento-cancelar-btn" onclick="pwaApp.atendimentoCancelar()">
                        &#9940; Cancelar atendimento
                    </button>
                </div>
            </div>
        `;
        // Atualizar estado do botão checkout com base no que já foi registrado
        _atualizarEstadoBtnCheckout();
    }

    /**
     * Verifica se há pesquisas pendentes para o cliente e mostra/esconde botão Pesquisa.
     * Usa o mapa já calculado pelo app.js após checkin ou faz busca leve.
     */
    function _verificarPesquisaAtendimento(clienteId, repId, dataVisita) {
        const normalizeId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const cliNorm = normalizeId(clienteId);

        // 1. Verificar o mapa já existente no app.js (populado pelo verificarPesquisasAposCheckin)
        const mapa = window.app?.registroRotaState?.pesquisasPendentesMap;
        if (mapa) {
            const pendentes = mapa.get(cliNorm) || [];
            if (pendentes.length > 0) {
                _mostrarBotaoPesquisa(true);
                return;
            }
            // Se o mapa tem a chave mas está vazia, não há pesquisas
            if (mapa.has(cliNorm)) {
                _mostrarBotaoPesquisa(false);
                return;
            }
        }

        // 2. Se não há mapa, fazer busca em background
        if (typeof window.app?.buscarPesquisasPendentes === 'function' && navigator.onLine) {
            window.app.buscarPesquisasPendentes(repId, cliNorm, dataVisita, false)
                .then(pesquisas => _mostrarBotaoPesquisa(pesquisas && pesquisas.length > 0))
                .catch(() => _mostrarBotaoPesquisa(false));
        } else {
            _mostrarBotaoPesquisa(false);
        }
    }

    function _mostrarBotaoPesquisa(mostrar) {
        const btn = document.getElementById('pwaAtendimentoBtnPesquisa');
        if (!btn) return;
        if (mostrar) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }

    /** Verifica se o cliente tem espaços cadastrados e mostra/esconde botão Espaços */
    function _verificarEspacoAtendimento(clienteId) {
        const normalizeId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const cliNorm = normalizeId(clienteId);
        const clientesComEspaco = window.app?.registroRotaState?.clientesComEspaco;
        if (clientesComEspaco) {
            _mostrarBotaoEspacos(clientesComEspaco.has(cliNorm));
            return;
        }
        // Se o set não está disponível, tentar buscar do servidor em background
        if (navigator.onLine && typeof window.app?.verificarEspacosPendentes === 'function') {
            const ctx = currentAtendimentoContext;
            if (!ctx) return;
            window.app.verificarEspacosPendentes(ctx.repId, cliNorm)
                .then(res => _mostrarBotaoEspacos(res?.temEspacos === true))
                .catch(() => _mostrarBotaoEspacos(false));
        }
    }

    function _mostrarBotaoEspacos(mostrar) {
        const btn = document.getElementById('pwaAtendimentoBtnEspacos');
        if (!btn) return;
        if (mostrar) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }

    function _atualizarEstadoBtnCheckout() {
        const btn = document.getElementById('pwaAtendimentoBtnCheckout');
        if (!btn || !currentAtendimentoContext) return;
        const normId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const cliNorm = normId(currentAtendimentoContext.clienteId);
        const state = window.app?.registroRotaState;
        const statusCliente = state?.resumoVisitas?.get(cliNorm);
        const atividadesCount = Number(statusCliente?.atividades_count || 0);
        const temAtividadesLocal = state?._atividadesLocal?.clienteId === cliNorm;
        const temCampanhaLocal = (state?._campanhaFotosLocal || []).some(f => normId(f.clienteId) === cliNorm);
        const liberado = atividadesCount > 0 || temAtividadesLocal || temCampanhaLocal;
        btn.disabled = !liberado;
        if (liberado) {
            btn.classList.remove('pwa-checkout-bloqueado');
        } else {
            btn.classList.add('pwa-checkout-bloqueado');
        }
    }

    /** Navega de volta à lista de roteiro a partir da tela de atendimento */
    function voltarAtendimento() {
        // NÃO limpar currentAtendimentoContext — atendimento ainda está ativo.
        // Contexto só é limpo após checkout ou confirmação de cancelamento.
        navigate('registro-rota');
    }

    /** Reabre a tela de atendimento a partir do banner no roteiro */
    function reabrirAtendimento() {
        const ctx = currentAtendimentoContext;
        if (!ctx) return;
        abrirAtendimentoTela(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.endereco, ctx.dataVisita, ctx.enderecoCadastro);
    }

    /** Abre atividades a partir da tela de atendimento */
    function atendimentoAbrirAtividade() {
        const ctx = currentAtendimentoContext;
        if (!ctx) return;
        if (typeof window.app !== 'undefined' && window.app.abrirModalAtividades) {
            window.app.abrirModalAtividades(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.dataVisita);
        }
    }

    /** Abre campanha (foto) a partir da tela de atendimento */
    function atendimentoAbrirCampanha() {
        const ctx = currentAtendimentoContext;
        if (!ctx) return;
        if (typeof window.app !== 'undefined' && window.app.abrirModalCaptura) {
            window.app.abrirModalCaptura(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.endereco, ctx.dataVisita, 'campanha', ctx.enderecoCadastro);
        }
    }

    /** Abre pesquisa a partir da tela de atendimento */
    function atendimentoAbrirPesquisa() {
        const ctx = currentAtendimentoContext;
        if (!ctx) return;
        if (typeof window.app !== 'undefined' && window.app.abrirPesquisaCliente) {
            window.app.abrirPesquisaCliente(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.dataVisita);
        }
    }

    /** Abre registro de espaços a partir da tela de atendimento */
    function atendimentoAbrirEspaco() {
        const ctx = currentAtendimentoContext;
        if (!ctx) return;
        if (typeof window.app !== 'undefined' && window.app.verificarEAbrirRegistroEspacos) {
            window.app.verificarEAbrirRegistroEspacos(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.dataVisita);
        }
    }

    /** Abre checkout a partir da tela de atendimento */
    function atendimentoAbrirCheckout() {
        const ctx = currentAtendimentoContext;
        if (!ctx) return;

        // Verificar se há atividades registradas antes de permitir checkout
        const normId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const cliNorm = normId(ctx.clienteId);
        const state = window.app?.registroRotaState;
        const statusCliente = state?.resumoVisitas?.get(cliNorm);
        const atividadesCount = Number(statusCliente?.atividades_count || 0);
        const temAtividadesLocal = state?._atividadesLocal?.clienteId === cliNorm;
        const temCampanhaLocal = (state?._campanhaFotosLocal || []).some(f => normId(f.clienteId) === cliNorm);

        if (atividadesCount <= 0 && !temAtividadesLocal && !temCampanhaLocal) {
            window.app?.showNotification('Registre ao menos 1 atividade ou campanha antes do checkout.', 'warning');
            return;
        }

        if (typeof window.app !== 'undefined' && window.app.abrirModalCaptura) {
            window.app.abrirModalCaptura(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.endereco, ctx.dataVisita, 'checkout', ctx.enderecoCadastro);
        }
    }

    /** Cancela o atendimento a partir da tela de atendimento */
    function atendimentoCancelar() {
        const ctx = currentAtendimentoContext;
        if (!ctx) return;
        if (typeof window.app !== 'undefined' && window.app.confirmarCancelarAtendimento) {
            const normalizeId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
            const cliNorm = normalizeId(ctx.clienteId);

            // Observer que detecta ABERTURA e FECHAMENTO do modal de confirmação
            let modalAberto = false;
            let obsTimeout = null;

            const obs = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1 && (node.classList?.contains('modal-backdrop') || node.classList?.contains('modal-overlay'))) {
                            modalAberto = true;
                            if (obsTimeout) { clearTimeout(obsTimeout); obsTimeout = null; }
                        }
                    }
                    for (const node of mutation.removedNodes) {
                        if (node.nodeType === 1 && (node.classList?.contains('modal-backdrop') || node.classList?.contains('modal-overlay')) && modalAberto) {
                            obs.disconnect();
                            if (obsTimeout) { clearTimeout(obsTimeout); obsTimeout = null; }
                            // Verificar se cancelamento foi confirmado (status não é mais em_atendimento)
                            const status = window.app?.registroRotaState?.resumoVisitas?.get(cliNorm);
                            if (!status || status.status !== 'em_atendimento') {
                                currentAtendimentoContext = null;
                                navigate('registro-rota');
                            }
                        }
                    }
                }
            });
            obs.observe(document.body, { childList: true, subtree: false });

            // Se modal não abre em 1.5s, desconectar observer (erro interno)
            obsTimeout = setTimeout(() => {
                if (!modalAberto) obs.disconnect();
            }, 1500);

            window.app.confirmarCancelarAtendimento(ctx.repId, ctx.clienteId, ctx.clienteNome);
        }
    }

    /**
     * Mostra overlay bloqueante de sincronização (impede navegação durante envio)
     */
    function mostrarOverlaySync(msg) {
        ocultarOverlaySync(); // remover se já existir
        const overlay = document.createElement('div');
        overlay.id = 'pwaCheckoutOverlay';
        overlay.innerHTML = `
            <div class="pwa-checkout-overlay-inner">
                <div class="pwa-spinner"></div>
                <p class="pwa-checkout-overlay-msg">${msg || 'Enviando...'}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function ocultarOverlaySync() {
        document.getElementById('pwaCheckoutOverlay')?.remove();
    }

    /**
     * Chamado pelo fecharModalCaptura após checkout/cancelamento concluído
     * para retornar à tela de atendimento ou à lista.
     */
    function voltarDeCheckinParaAtendimento() {
        ocultarOverlaySync();
        restoreCaptureModal();
        if (typeof window.app !== 'undefined') {
            try {
                window.app.pararStreamVideo?.();
                const video = document.getElementById('videoPreview');
                if (video) { video.srcObject = null; video.style.display = 'none'; }
                const modal = document.getElementById('modalCapturarVisita');
                if (modal) modal.classList.remove('active');
            } catch (e) { /* silent */ }
        }
        showBottomTabs(true);
        if (navigationStack.length > 1) navigationStack.pop();

        const ctx = currentAtendimentoContext;
        if (ctx) {
            // Voltar à tela de atendimento (contexto ainda existe → não foi checkout)
            abrirAtendimentoTela(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.endereco, ctx.dataVisita, ctx.enderecoCadastro);
        } else {
            // Checkout/cancelamento finalizado → ir para lista
            navigate('registro-rota');

            // Refresh route to prevent white screen
            if (typeof window.app !== 'undefined' && window.app.carregarRoteiroRepositor) {
                setTimeout(() => window.app.carregarRoteiroRepositor(), 50);
            }
        }
    }

    // ==================== PÁGINA: MAIS ====================

    // ==================== ATIVIDADES INLINE (substitui modal overlay) ====================

    /**
     * Renderiza a tela de atividades DENTRO do pwaContent como tela independente
     * Sem modal overlay - navegação inline com botão voltar
     */
    function abrirAtividadesInline(repId, clienteId, clienteNome, dataPlanejada) {
        previousTab = currentTab;

        navigationStack.push('pwa-atividades');
        history.pushState({ pwaTab: 'pwa-atividades' }, '', '');

        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page">
                <div class="pwa-page-header-bar">
                    <button class="pwa-back-btn" onclick="pwaApp.fecharAtividadesInline()">&#8592;</button>
                    <span class="pwa-page-header-title">Atividades</span>
                    <button class="pwa-header-confirmar-btn" onclick="window.app && window.app.salvarAtividades()">&#10003; Confirmar</button>
                </div>
                <div id="pwaAtividadesInlineArea" class="pwa-page-body" style="padding:0; overflow-y:auto;">
                    <div class="pwa-loading-inline">
                        <div class="pwa-spinner-small"></div>
                        <span>Carregando atividades...</span>
                    </div>
                </div>
            </div>
        `;

        // Chamar a lógica original do app.js para popular o modal
        if (typeof window.app !== 'undefined' && window.app._originalAbrirModalAtividades) {
            const promise = window.app._originalAbrirModalAtividades(repId, clienteId, clienteNome, dataPlanejada);
            if (promise && typeof promise.then === 'function') {
                // Injetar APENAS após a promessa resolver, para não wipe dados carregados
                promise.then(() => injectAtividadesModalInline()).catch(() => injectAtividadesModalInline());
            } else {
                setTimeout(() => injectAtividadesModalInline(), 150);
            }
            // NÃO chamar imediatamente: a 2ª chamada apagaria o conteúdo carregado
        }
    }

    /**
     * Move o modal de atividades para dentro da área inline (move, não clona)
     * Isso preserva os event listeners e referências do app.js
     */
    function injectAtividadesModalInline() {
        const modal = document.getElementById('modalAtividades');
        const inlineArea = document.getElementById('pwaAtividadesInlineArea');
        if (!modal || !inlineArea) return;

        inlineArea.innerHTML = '';

        // Mover o conteúdo do modal para inline
        const content = modal.querySelector('.modal-content');
        if (content) {
            content.classList.add('pwa-atividades-inline');
            inlineArea.appendChild(content);

            // Esconder o modal-header (X e título) — no PWA usamos o header-bar próprio
            const modalHeader = content.querySelector('.modal-header');
            if (modalHeader) modalHeader.style.display = 'none';

            // Esconder o modal-footer original — o botão Confirmar está no header-bar
            const modalFooter = content.querySelector('.modal-footer');
            if (modalFooter) modalFooter.style.display = 'none';
        }

        // Esconder o modal container (agora vazio)
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    function fecharAtividadesInline() {
        // Restaurar modal content de volta ao modal container
        const modal = document.getElementById('modalAtividades');
        const inlineArea = document.getElementById('pwaAtividadesInlineArea');

        if (modal && inlineArea) {
            const content = inlineArea.querySelector('.pwa-atividades-inline');
            if (content) {
                content.classList.remove('pwa-atividades-inline');
                modal.appendChild(content);
            }
            modal.style.display = '';
            modal.classList.remove('active');
        }

        // Limpar state de atividades
        if (typeof window.app !== 'undefined') {
            if (window.app.registroRotaState) {
                window.app.registroRotaState.sessaoAtividades = null;
                window.app.registroRotaState.atividadesConfiguradas = null;
            }
        }

        showBottomTabs(true);

        if (navigationStack.length > 1) {
            navigationStack.pop();
        }

        // Se há atendimento em andamento, voltar para a tela de atendimento
        if (currentAtendimentoContext) {
            const ctx = currentAtendimentoContext;
            abrirAtendimentoTela(ctx.repId, ctx.clienteId, ctx.clienteNome, ctx.endereco, ctx.dataVisita, ctx.enderecoCadastro);
        } else {
            navigate(previousTab || 'registro-rota');
        }
    }

    function renderMais() {
        const usuario = getUsuario();
        const ultimoSync = localStorage.getItem('ultimo_sync');
        const syncText = ultimoSync
            ? new Date(ultimoSync).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : 'Nunca';

        pwaContent.innerHTML = `
            <div class="pwa-page-header-bar">
                <button class="pwa-back-btn" onclick="pwaApp.navigate('pwa-home')">&#8592;</button>
                <span class="pwa-page-header-title">Sincronização</span>
            </div>
            <div class="pwa-page">
                <div class="pwa-card" style="text-align:center; padding: 24px 16px; margin-top: 16px;">
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
