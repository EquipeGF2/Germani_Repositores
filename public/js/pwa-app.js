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

    // ==================== CONSOLE VISUAL MOBILE ====================
    const _mobileConsole = {
        logs: [],
        maxLogs: 150,
        visible: false,
        el: null,
        _originalConsole: {
            log: console.log.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            info: console.info.bind(console)
        },
        init() {
            // Criar container fixo
            const el = document.createElement('div');
            el.id = 'pwaDebugConsole';
            el.innerHTML = `
                <div id="pwaDebugHeader" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#1e293b;border-bottom:1px solid #334155;cursor:pointer;">
                    <span style="font-weight:700;font-size:12px;color:#38bdf8;">Console Debug</span>
                    <div style="display:flex;gap:8px;">
                        <button onclick="pwaApp.copyDebugConsole()" style="background:#2563eb;color:white;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Copiar</button>
                        <button onclick="pwaApp.clearDebugConsole()" style="background:#ef4444;color:white;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Limpar</button>
                        <button onclick="pwaApp.toggleDebugConsole()" style="background:#475569;color:white;border:none;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;">Fechar</button>
                    </div>
                </div>
                <div id="pwaDebugBody" style="flex:1;overflow-y:auto;padding:4px 8px;font-family:monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;"></div>
            `;
            el.style.cssText = 'display:none;position:fixed;bottom:60px;left:0;right:0;height:45vh;background:#0f172a;color:#e2e8f0;z-index:99999;flex-direction:column;border-top:2px solid #38bdf8;';
            document.body.appendChild(el);
            this.el = el;

            // Interceptar console.log/warn/error
            const self = this;
            ['log', 'warn', 'error', 'info'].forEach(method => {
                console[method] = function(...args) {
                    self._originalConsole[method](...args);
                    self.addLog(method, args);
                };
            });

            // Capturar erros globais
            window.addEventListener('error', (e) => {
                self.addLog('error', [`[UNCAUGHT] ${e.message} (${e.filename}:${e.lineno})`]);
            });
            window.addEventListener('unhandledrejection', (e) => {
                self.addLog('error', [`[PROMISE] ${e.reason?.message || e.reason}`]);
            });
        },
        addLog(type, args) {
            const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const text = args.map(a => {
                if (typeof a === 'object') {
                    try { return JSON.stringify(a, null, 0).substring(0, 300); } catch { return String(a); }
                }
                return String(a);
            }).join(' ');
            const colors = { log: '#e2e8f0', warn: '#fbbf24', error: '#f87171', info: '#38bdf8' };
            this.logs.push({ time, type, text, color: colors[type] || '#e2e8f0' });
            if (this.logs.length > this.maxLogs) this.logs.shift();
            this.render();
        },
        render() {
            if (!this.visible) return;
            const body = document.getElementById('pwaDebugBody');
            if (!body) return;
            body.innerHTML = this.logs.map(l =>
                `<div style="color:${l.color};border-bottom:1px solid #1e293b;padding:2px 0;"><span style="color:#64748b;">${l.time}</span> <span style="color:${l.color};font-weight:${l.type === 'error' ? '700' : '400'}">[${l.type.toUpperCase()}]</span> ${l.text.replace(/</g, '&lt;')}</div>`
            ).join('');
            body.scrollTop = body.scrollHeight;
        },
        toggle() {
            this.visible = !this.visible;
            if (this.el) this.el.style.display = this.visible ? 'flex' : 'none';
            if (this.visible) this.render();
        },
        clear() {
            this.logs = [];
            this.render();
        },
        copy() {
            const text = this.logs.map(l => `${l.time} [${l.type.toUpperCase()}] ${l.text}`).join('\n');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    const btn = document.querySelector('#pwaDebugHeader button');
                    if (btn) { const orig = btn.textContent; btn.textContent = 'Copiado!'; setTimeout(() => btn.textContent = orig, 1500); }
                }).catch(() => this._fallbackCopy(text));
            } else {
                this._fallbackCopy(text);
            }
        },
        _fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            const btn = document.querySelector('#pwaDebugHeader button');
            if (btn) { const orig = btn.textContent; btn.textContent = 'Copiado!'; setTimeout(() => btn.textContent = orig, 1500); }
        }
    };

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
        // Debug console
        toggleDebugConsole: () => _mobileConsole.toggle(),
        clearDebugConsole: () => _mobileConsole.clear(),
        copyDebugConsole: () => _mobileConsole.copy(),
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
        getClientesCache: () => cachedData.clientes || [],
        getRubricasCache: () => cachedData.tiposGasto || []
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
        _mobileConsole.init();
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

        if (precisaSincronizarHoje) {
            if (navigator.onLine) {
                // Primeira abertura do dia com internet: sincronização bloqueante
                await performDailySync();
            } else {
                // Offline e não sincronizou hoje: bloquear até ter conexão
                showWaitingForConnectionScreen();
                await new Promise(resolve => {
                    const checkConnection = () => {
                        if (navigator.onLine) {
                            window.removeEventListener('online', checkConnection);
                            resolve();
                        }
                    };
                    window.addEventListener('online', checkConnection);
                    // Também verificar periodicamente (fallback)
                    const interval = setInterval(() => {
                        if (navigator.onLine) {
                            clearInterval(interval);
                            window.removeEventListener('online', checkConnection);
                            resolve();
                        }
                    }, 3000);
                });
                hideWaitingForConnectionScreen();
                await performDailySync();
            }
        } else {
            // Já sincronizado hoje: ir direto para home com dados em cache
            navigate('pwa-home');
        }

        // Iniciar monitoramento de sync silencioso no horário de almoço (11:30-13:30)
        setupMiddaySilentSync();

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
                clientes: clientes.length,
                tiposDoc: tiposDoc.length,
                tiposGasto: tiposGasto.length
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

    // ==================== TELA DE AGUARDANDO CONEXÃO ====================

    function showWaitingForConnectionScreen() {
        // Reutilizar a tela de sync diária com mensagem de aguardando conexão
        const screen = document.getElementById('pwaDailySyncScreen');
        if (screen) {
            screen.classList.remove('hidden');
            const statusEl = document.getElementById('pwaDailySyncStatus');
            if (statusEl) statusEl.textContent = 'Aguardando conexão com a internet...';
            // Esconder os steps
            for (let i = 1; i <= 3; i++) {
                const step = document.getElementById('pwaSyncStep' + i);
                if (step) step.style.display = 'none';
            }
        }
        // Também mostrar overlay próprio se a tela de sync não existir
        if (!screen) {
            const overlay = document.createElement('div');
            overlay.id = 'pwaWaitingConnection';
            overlay.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
            overlay.innerHTML = `
                <div style="font-size:48px;">📡</div>
                <h3 style="margin:0;color:#374151;">Conexão necessária</h3>
                <p style="margin:0;color:#6b7280;text-align:center;max-width:280px;">
                    A sincronização diária é obrigatória no primeiro acesso do dia.
                    Conecte-se à internet para continuar.
                </p>
                <div class="pwa-spinner-small" style="margin-top:8px;"></div>
                <p style="margin:0;color:#9ca3af;font-size:13px;">Conectando automaticamente...</p>
            `;
            document.body.appendChild(overlay);
        }
    }

    function hideWaitingForConnectionScreen() {
        const overlay = document.getElementById('pwaWaitingConnection');
        if (overlay) overlay.remove();
        // Restaurar steps da tela de sync
        for (let i = 1; i <= 3; i++) {
            const step = document.getElementById('pwaSyncStep' + i);
            if (step) step.style.display = '';
        }
    }

    // ==================== SYNC SILENCIOSO HORÁRIO DE ALMOÇO ====================

    let middaySyncInterval = null;
    let middaySyncDone = false;

    function setupMiddaySilentSync() {
        // Verificar a cada minuto se estamos na janela 12:00-13:30
        middaySyncInterval = setInterval(checkMiddaySync, 60 * 1000);
        // Verificar imediatamente também
        checkMiddaySync();
    }

    async function checkMiddaySync() {
        if (middaySyncDone) return;

        const agora = new Date();
        // Usar horário de São Paulo
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        const dayFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            weekday: 'short'
        });
        const parts = formatter.formatToParts(agora);
        const hora = parseInt(parts.find(p => p.type === 'hour').value);
        const minuto = parseInt(parts.find(p => p.type === 'minute').value);
        const totalMinutos = hora * 60 + minuto;

        // Janela: 12:00 (720min) até 13:30 (810min)
        if (totalMinutos < 720 || totalMinutos > 810) return;

        // Verificar se é dia útil (seg-sex)
        const diaSemana = dayFormatter.format(agora);
        const diasUteis = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        if (!diasUteis.includes(diaSemana)) return;

        // Verificar se o repositor possui agenda de visita hoje
        try {
            const diasMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
            const spFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
            const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                .indexOf(spFormatter.format(agora));
            const diaHoje = diasMap[dayIndex >= 0 ? dayIndex : agora.getDay()];

            const repIdSync = typeof authManager !== 'undefined' ? authManager.getRepId?.() : null;
            if (repIdSync) {
                const cacheKeyRoteiro = `roteiro_completo_${repIdSync}_${diaHoje}`;
                const cachedRoteiro = localStorage.getItem(cacheKeyRoteiro);
                if (!cachedRoteiro) {
                    // Sem roteiro hoje - não precisa sync
                    return;
                }
                const parsed = JSON.parse(cachedRoteiro);
                const roteiro = parsed.roteiro || parsed;
                if (!roteiro || roteiro.length === 0) return;
            }
        } catch (_) {}

        // Verificar conexão (a cada 15 minutos)
        const ultimaTentativa = parseInt(localStorage.getItem('pwa_midday_sync_last') || '0');
        if (Date.now() - ultimaTentativa < 15 * 60 * 1000) return;

        // Sem conexão? Registrar tentativa e sair
        if (!navigator.onLine) {
            localStorage.setItem('pwa_midday_sync_last', String(Date.now()));
            return;
        }

        // Verificar se já fez sync de meio-dia hoje
        const hojeBR = getHojeBR();
        const ultimoMiddaySync = localStorage.getItem('pwa_midday_sync_dia');
        if (ultimoMiddaySync === hojeBR) {
            middaySyncDone = true;
            return;
        }

        console.log('[PWA] Iniciando sync silencioso de meio-dia...');
        localStorage.setItem('pwa_midday_sync_last', String(Date.now()));

        try {
            const token = localStorage.getItem('auth_token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };
            const repId = typeof authManager !== 'undefined' ? authManager.getRepId?.() : null;
            if (!repId) return;

            const hojePesq = new Date().toISOString().split('T')[0];

            // 1. Sync completo em background via syncService (baixa todos os dados)
            if (typeof syncService !== 'undefined') {
                await syncService.sincronizarDownload().catch(e => console.warn('[PWA] Erro sync download meio-dia:', e));
            }

            // 2. Atualizar resumo de visitas de hoje
            try {
                const resumoRes = await syncService.fetchWithTimeout(
                    `${API_BASE_URL}/api/registro-rota/visitas?rep_id=${repId}&data_inicio=${hojePesq}&data_fim=${hojePesq}&modo=resumo`,
                    { headers }
                ).then(r => r.json());
                const resumo = resumoRes?.resumo || resumoRes?.visitas || [];
                if (resumo.length > 0) {
                    localStorage.setItem(`resumo_visitas_${repId}_${hojePesq}`, JSON.stringify(resumo));
                }
            } catch (_) {}

            // 3. Atualizar atendimentos abertos
            try {
                const abertosRes = await syncService.fetchWithTimeout(
                    `${API_BASE_URL}/api/registro-rota/atendimentos-abertos?repositor_id=${repId}`,
                    { headers }
                ).then(r => r.json());
                const abertos = abertosRes?.atendimentos_abertos || [];
                localStorage.setItem(`atendimentos_abertos_${repId}`, JSON.stringify(abertos));
            } catch (_) {}

            // 4. Enviar pendentes
            if (typeof syncService !== 'undefined') {
                await syncService.enviarPendentes().catch(() => {});
            }
            if (typeof app !== 'undefined' && typeof app.syncDespesasPendentes === 'function') {
                await app.syncDespesasPendentes().catch(() => {});
            }
            if (typeof app !== 'undefined' && typeof app.syncCheckoutsPendentes === 'function') {
                await app.syncCheckoutsPendentes().catch(() => {});
            }

            // Marcar como feito
            localStorage.setItem('pwa_midday_sync_dia', hojeBR);
            middaySyncDone = true;
            console.log('[PWA] Sync silencioso de meio-dia concluído');

        } catch (e) {
            console.warn('[PWA] Erro no sync silencioso de meio-dia:', e);
            // Não marca como feito - vai tentar novamente em 15 min
        }
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
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/roteiro`, { headers }).then(r => r.json()).catch(e => { console.warn('[PWA] Erro sync roteiro:', e.message); return { ok: false }; }),
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/clientes`, { headers }).then(r => r.json()).catch(e => { console.warn('[PWA] Erro sync clientes:', e.message); return { ok: false }; }),
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/coordenadas`, { headers }).then(r => r.json()).catch(e => { console.warn('[PWA] Erro sync coordenadas:', e.message); return { ok: false }; })
                ]);

                try { if (roteiroRes.ok) { await offlineDB.salvarRoteiro(roteiroRes.roteiro || []); console.log(`[PWA Sync] Roteiro: ${roteiroRes.roteiro?.length || 0} itens`); } } catch (e) { console.error('[PWA] Erro save roteiro:', e.message); }
                try { if (clientesRes.ok) { await offlineDB.salvarClientes(clientesRes.clientes || []); console.log(`[PWA Sync] Clientes: ${clientesRes.clientes?.length || 0} itens`); } } catch (e) { console.error('[PWA] Erro save clientes:', e.message); }
                try { if (coordenadasRes.ok) { await offlineDB.salvarCoordenadas(coordenadasRes.coordenadas || []); console.log(`[PWA Sync] Coordenadas: ${coordenadasRes.coordenadas?.length || 0} itens`); } } catch (e) { console.error('[PWA] Erro save coordenadas:', e.message); }
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
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/tipos-documento`, { headers }).then(r => r.json()).catch(e => { console.warn('[PWA] Erro sync tipos-doc:', e.message); return { ok: false }; }),
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/tipos-gasto`, { headers }).then(r => r.json()).catch(e => { console.warn('[PWA] Erro sync tipos-gasto:', e.message); return { ok: false }; })
                ]);
                try { if (tiposDocRes.ok) { await offlineDB.salvarTiposDocumento(tiposDocRes.tipos || []); console.log(`[PWA Sync] Tipos documento: ${tiposDocRes.tipos?.length || 0} itens`); } } catch (e) { console.error('[PWA] Erro save tipos-doc:', e.message); }
                try {
                    if (tiposGastoRes.ok) {
                        const tipos = tiposGastoRes.tipos || [];
                        console.log(`[PWA Sync] Rubricas recebidas da API: ${tipos.length} itens`, tipos.length > 0 ? tipos[0] : 'VAZIO');
                        await offlineDB.salvarTiposGasto(tipos);
                        cachedData.tiposGasto = tipos;
                        // Verificar se salvou corretamente
                        const verificar = await offlineDB.getTiposGasto().catch(() => []);
                        console.log(`[PWA Sync] Rubricas verificação IndexedDB: ${verificar.length} itens`);
                    } else {
                        console.warn('[PWA Sync] Rubricas API retornou ok=false:', JSON.stringify(tiposGastoRes).substring(0, 200));
                    }
                } catch (e) { console.error('[PWA] Erro save tipos-gasto:', e.message); }
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
                        // Também salvar no store sessoesRecentes (usado pela tela Consulta Visitas da PWA)
                        try {
                            await offlineDB.salvarSessoesRecentes(visitasRes.sessoes);
                            console.log(`[PWA Sync] Sessões recentes: ${visitasRes.sessoes.length} itens`);
                        } catch (e) { console.error('[PWA] Erro save sessoesRecentes:', e.message); }
                    }
                }
            } catch (e) {
                console.warn('[PWA] Erro ao cachear visitas:', e);
            }

            updateDailySyncStatus('Pré-carregando roteiros...');

            // Pré-cachear roteiros completos (com nomes/endereços) no localStorage
            // Isso garante acesso instantâneo no Registro de Rota (online e offline)
            try {
                const repIdSync = typeof authManager !== 'undefined' ? authManager.getRepId?.() : null;
                if (repIdSync && typeof db !== 'undefined') {
                    const diasMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
                    const hojeDate = new Date();
                    // Cachear hoje + 7 dias à frente
                    for (let i = 0; i <= 7; i++) {
                        const dataAlvo = new Date(hojeDate);
                        dataAlvo.setDate(hojeDate.getDate() + i);
                        const diaAlvo = diasMap[dataAlvo.getDay()];
                        const cacheKey = `roteiro_completo_${repIdSync}_${diaAlvo}`;
                        try {
                            const roteiroCompleto = await db.carregarRoteiroRepositorDia(repIdSync, diaAlvo);
                            if (roteiroCompleto && roteiroCompleto.length > 0) {
                                localStorage.setItem(cacheKey, JSON.stringify({
                                    roteiro: roteiroCompleto,
                                    timestamp: Date.now()
                                }));
                                console.log(`[Sync] Cache roteiro ${diaAlvo}: ${roteiroCompleto.length} clientes`);
                            }
                        } catch (e) {
                            console.warn(`[Sync] Erro ao cachear roteiro ${diaAlvo}:`, e);
                        }
                    }
                }
            } catch (e) {
                console.warn('[PWA] Erro ao pré-cachear roteiros:', e);
            }

            updateDailySyncStatus('Carregando dados de visitas...');

            // Pré-cachear resumo de visitas, não atendimentos e atendimentos abertos
            // Necessário para avisos na home e para status offline no Registro de Rota
            try {
                const repIdVisitas = typeof authManager !== 'undefined' ? authManager.getRepId?.() : null;
                if (repIdVisitas) {
                    const hojeVisitas = new Date();

                    // Cachear resumo visitas e não atendimentos: 2 dias atrás + hoje
                    for (let i = -2; i <= 0; i++) {
                        const dataAlvo = new Date(hojeVisitas);
                        dataAlvo.setDate(hojeVisitas.getDate() + i);
                        const dataStr = dataAlvo.toISOString().split('T')[0];

                        try {
                            // Resumo de visitas do dia
                            const resumoRes = await syncService.fetchWithTimeout(
                                `${API_BASE_URL}/api/registro-rota/visitas?rep_id=${repIdVisitas}&data_inicio=${dataStr}&data_fim=${dataStr}&modo=resumo`,
                                { headers }
                            ).then(r => r.json());
                            const resumo = resumoRes?.resumo || resumoRes?.visitas || [];
                            if (resumo.length > 0) {
                                localStorage.setItem(`resumo_visitas_${repIdVisitas}_${dataStr}`, JSON.stringify(resumo));
                            }

                            // Não atendimentos do dia
                            const naRes = await syncService.fetchWithTimeout(
                                `${API_BASE_URL}/api/registro-rota/nao-atendimentos?repositor_id=${repIdVisitas}&data=${dataStr}`,
                                { headers }
                            ).then(r => r.ok ? r.json() : null);
                            if (naRes?.ok && naRes.data) {
                                localStorage.setItem(`nao_atendimentos_${repIdVisitas}_${dataStr}`, JSON.stringify(naRes.data));
                            }
                        } catch (e) {
                            console.warn(`[Sync] Erro ao cachear visitas ${dataStr}:`, e);
                        }
                    }

                    // Cachear atendimentos abertos (para verificação de sessão no checkin offline)
                    try {
                        const abertosRes = await syncService.fetchWithTimeout(
                            `${API_BASE_URL}/api/registro-rota/atendimentos-abertos?repositor_id=${repIdVisitas}`,
                            { headers }
                        ).then(r => r.json());
                        const abertos = abertosRes?.atendimentos_abertos || [];
                        localStorage.setItem(`atendimentos_abertos_${repIdVisitas}`, JSON.stringify(abertos));
                    } catch (_) {}

                    console.log('[Sync] Resumo visitas, não atendimentos e atendimentos abertos cacheados');
                }
            } catch (e) {
                console.warn('[PWA] Erro ao pré-cachear visitas:', e);
            }

            updateDailySyncStatus('Carregando pesquisas e espaços...');

            // Pesquisas e espaços agora são baixados automaticamente pelo syncService.sincronizarDownload()
            // que já salva em IndexedDB (pesquisasClientes, espacosClientes)
            // Manter compatibilidade com localStorage para código legado
            try {
                const repIdPesq = typeof authManager !== 'undefined' ? authManager.getRepId?.() : null;
                if (repIdPesq && typeof offlineDB !== 'undefined') {
                    const hojePesq = new Date().toISOString().split('T')[0];
                    // Ler pesquisas do IndexedDB (já foram salvas pelo syncService)
                    const pesquisasClientes = await offlineDB.getAllPesquisasClientes();
                    if (pesquisasClientes && pesquisasClientes.length > 0) {
                        const pesquisasCache = {};
                        for (const item of pesquisasClientes) {
                            if (item.pesquisas && item.pesquisas.length > 0) {
                                pesquisasCache[item.clienteId] = item.pesquisas;
                            }
                        }
                        // Salvar também no localStorage para compatibilidade com código legado
                        const pesqCacheKey = `pesquisas_cache_${repIdPesq}_${hojePesq}`;
                        localStorage.setItem(pesqCacheKey, JSON.stringify({ timestamp: Date.now(), data: pesquisasCache }));
                        console.log(`[Sync] Pesquisas: ${Object.keys(pesquisasCache).length} clientes com pesquisas pendentes`);
                    }
                }
            } catch (e) {
                console.warn('[PWA] Erro ao processar pesquisas/espaços do cache:', e);
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
            // Sincronizar checkouts offline pendentes
            if (typeof app !== 'undefined' && typeof app.syncCheckoutsPendentes === 'function') {
                app.syncCheckoutsPendentes().catch(e => console.warn('[PWA] Erro sync checkouts offline:', e));
            }
            // Cache de dados para consultas offline (BLOQUEANTE - deve completar antes de "Pronto!")
            updateDailySyncStatus('Salvando consultas...');
            try {
                const [docsRes, despesasRes, rotConsultaRes, campanhasRes] = await Promise.all([
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/documentos-cache`, { headers }, 10000)
                        .then(r => r.json()).catch(() => ({ ok: false })),
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/despesas`, { headers }, 10000)
                        .then(r => r.json()).catch(() => ({ ok: false })),
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/roteiros-consulta`, { headers }, 10000)
                        .then(r => r.json()).catch(() => ({ ok: false })),
                    syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/campanhas`, { headers }, 10000)
                        .then(r => r.json()).catch(() => ({ ok: false }))
                ]);
                try { if (docsRes.ok) { await offlineDB.salvarDocumentosCache(docsRes.documentos || []); console.log(`[PWA Sync] Docs cache: ${docsRes.documentos?.length || 0} itens`); } } catch (e) { console.warn('[PWA Sync] Erro save docs:', e.message); }
                try { if (despesasRes.ok) { await offlineDB.salvarDespesas(despesasRes.despesas || []); console.log(`[PWA Sync] Despesas cache: ${despesasRes.despesas?.length || 0} itens`); } } catch (e) { console.warn('[PWA Sync] Erro save despesas:', e.message); }
                try { if (rotConsultaRes.ok) { await offlineDB.salvarRoteirosConsulta(rotConsultaRes.roteiros || []); console.log(`[PWA Sync] Roteiros consulta: ${rotConsultaRes.roteiros?.length || 0} itens`); } } catch (e) { console.warn('[PWA Sync] Erro save roteiros:', e.message); }
                try { if (campanhasRes.ok) { await offlineDB.salvarCampanhas(campanhasRes.campanhas || []); console.log(`[PWA Sync] Campanhas: ${campanhasRes.campanhas?.length || 0} itens`); } } catch (e) { console.warn('[PWA Sync] Erro save campanhas:', e.message); }
                console.log('[PWA] Cache consultas salvo com sucesso');
            } catch (e) { console.warn('[PWA] Erro cache consultas:', e.message); }

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
                // Atualizar contagem de pendentes após sync
                updatePendingCount();
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
                    updatePendingCount();
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
                const total = pendentes.total || 0;
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

                <div id="pwaAvisosHome"></div>

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

        // Carregar avisos de clientes não atendidos (async)
        carregarAvisosHome();
    }

    async function getClientesMap() {
        const buildMap = (clientes) => {
            const map = {};
            clientes.forEach(c => {
                const id = String(c.cli_codigo || c.cliente_id || '').trim().replace(/\.0$/, '');
                if (id) map[id] = c;
            });
            return map;
        };

        if (cachedData.clientes && cachedData.clientes.length > 0) {
            return buildMap(cachedData.clientes);
        }
        try {
            if (typeof offlineDB !== 'undefined') {
                await offlineDB.init();
                const clientes = await offlineDB.getAll('clientes');
                if (clientes && clientes.length > 0) {
                    cachedData.clientes = clientes;
                    return buildMap(clientes);
                }
            }
        } catch (e) { /* silent */ }
        return {};
    }

    /**
     * Carrega avisos na home:
     * - Clientes não atendidos nos últimos 2 dias
     */
    async function carregarAvisosHome() {
        const container = document.getElementById('pwaAvisosHome');
        if (!container) return;

        try {
            const repId = getRepId();
            if (!repId) return;

            // Buscar não atendimentos dos últimos 2 dias do cache localStorage
            const hoje = new Date();
            const naoAtendidosTotal = [];

            for (let i = 1; i <= 2; i++) {
                const dia = new Date(hoje);
                dia.setDate(dia.getDate() - i);
                const dataStr = dia.toISOString().split('T')[0];
                try {
                    const cached = localStorage.getItem(`nao_atendimentos_${repId}_${dataStr}`);
                    if (cached) {
                        const lista = JSON.parse(cached);
                        lista.forEach(na => {
                            naoAtendidosTotal.push({ ...na, data: dataStr });
                        });
                    }
                } catch (_) {}
            }

            // Buscar resumo de visitas dos últimos 2 dias para identificar pendentes
            const clientesPendentes = [];
            for (let i = 1; i <= 2; i++) {
                const dia = new Date(hoje);
                dia.setDate(dia.getDate() - i);
                const dataStr = dia.toISOString().split('T')[0];
                try {
                    const cached = localStorage.getItem(`resumo_visitas_${repId}_${dataStr}`);
                    if (cached) {
                        const resumo = JSON.parse(cached);
                        resumo.forEach(v => {
                            if (v.status === 'nao_atendido') {
                                const cliId = String(v.cliente_id || '').trim().replace(/\.0$/, '');
                                // Evitar duplicatas com a lista de não atendimentos
                                if (!naoAtendidosTotal.some(na => String(na.na_cliente_id || '').trim().replace(/\.0$/, '') === cliId)) {
                                    clientesPendentes.push({ cli_id: cliId, data: dataStr, motivo: v.nao_atendimento_motivo || '' });
                                }
                            }
                        });
                    }
                } catch (_) {}
            }

            // Combinar listas
            const todosNaoAtendidos = [
                ...naoAtendidosTotal.map(na => ({
                    clienteId: String(na.na_cliente_id || '').trim().replace(/\.0$/, ''),
                    clienteNome: na.na_cliente_nome || na.cliente_nome || '',
                    motivo: na.na_motivo || '',
                    data: na.data
                })),
                ...clientesPendentes.map(p => ({
                    clienteId: p.cli_id,
                    clienteNome: '',
                    motivo: p.motivo,
                    data: p.data
                }))
            ];

            if (todosNaoAtendidos.length === 0) {
                container.innerHTML = '';
                return;
            }

            // Enriquecer com nomes de clientes
            const clientesMap = await getClientesMap();
            todosNaoAtendidos.forEach(item => {
                if (!item.clienteNome && clientesMap[item.clienteId]) {
                    item.clienteNome = clientesMap[item.clienteId].cli_nome || clientesMap[item.clienteId].cli_fantasia || '';
                }
            });

            // Filtrar sem nome (dados incompletos)
            const comNome = todosNaoAtendidos.filter(i => i.clienteNome || i.clienteId);

            if (comNome.length === 0) {
                container.innerHTML = '';
                return;
            }

            const itensHtml = comNome.slice(0, 10).map(item => {
                const nome = escapeHtml(item.clienteNome || item.clienteId);
                const dataFmt = (() => {
                    try {
                        const [a, m, d] = item.data.split('-');
                        return `${d}/${m}`;
                    } catch (_) { return item.data; }
                })();
                return `<div style="display:flex;align-items:center;padding:8px 12px;background:#fff;border-radius:6px;margin-bottom:4px;">
                    <div style="color:#f59e0b;font-size:14px;margin-right:10px;">&#9888;</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:12px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nome}</div>
                        <div style="font-size:10px;color:#6b7280;">${dataFmt}${item.motivo ? ' - ' + escapeHtml(item.motivo) : ''}</div>
                    </div>
                </div>`;
            }).join('');

            container.innerHTML = `
                <div style="margin-bottom:12px;">
                    <div style="font-size:13px;font-weight:600;color:#92400e;margin-bottom:6px;padding:0 4px;">
                        &#9888; ${comNome.length} cliente${comNome.length > 1 ? 's' : ''} não atendido${comNome.length > 1 ? 's' : ''} nos últimos 2 dias
                    </div>
                    ${itensHtml}
                </div>
            `;
        } catch (e) {
            console.error('[PWA] Erro ao carregar avisos home:', e);
            container.innerHTML = '';
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
            try {
                console.log('[PWA] Chamando app.navigateTo(registro-rota)...');
                window.app.navigateTo('registro-rota', {}, { replaceHistory: true, pwaMode: true, pwaContainer: container });
                console.log('[PWA] app.navigateTo(registro-rota) OK');
            } catch (e) {
                console.error('[PWA] Erro ao chamar navigateTo(registro-rota):', e.message, e.stack);
                container.innerHTML = `<div class="pwa-empty-state"><div class="pwa-empty-text">Erro: ${escapeHtml(e.message)}</div></div>`;
            }
        } else {
            console.error('[PWA] window.app não disponível. typeof app:', typeof window.app, 'navigateTo:', typeof window.app?.navigateTo);
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Módulo carregando... tente novamente</div></div>';
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
            // Precarregar rubricas (tipos de gasto) para despesa de viagem
            let tiposGasto = [];
            if (typeof offlineDB !== 'undefined') {
                tiposGasto = await offlineDB.getTiposGasto().catch(() => []);
            }
            // Se IndexedDB vazio, buscar da API e salvar
            if ((!tiposGasto || tiposGasto.length === 0) && navigator.onLine) {
                try {
                    const token = localStorage.getItem('auth_token');
                    const res = await syncService.fetchWithTimeout(`${API_BASE_URL}/api/sync/tipos-gasto`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                    }, 10000).then(r => r.json());
                    if (res.ok && res.tipos?.length > 0) {
                        tiposGasto = res.tipos;
                        if (typeof offlineDB !== 'undefined') {
                            offlineDB.salvarTiposGasto(tiposGasto).catch(() => {});
                        }
                        console.log(`[PWA] Rubricas preload API: ${tiposGasto.length} itens`);
                    }
                } catch (e) { console.warn('[PWA] Erro preload rubricas:', e.message); }
            }
            if (tiposGasto && tiposGasto.length > 0) {
                cachedData.tiposGasto = tiposGasto;
            }
        } catch (e) { /* silent */ }
    }

    // ==================== PÁGINA: CONSULTAS ====================

    async function renderConsultas() {
        let consultasVisiveis;
        if (navigator.onLine) {
            // Online: todas as consultas disponíveis
            consultasVisiveis = CONSULTAS;
        } else {
            // Offline: visitas sempre, demais apenas se houver registros offline pendentes
            consultasVisiveis = [CONSULTAS.find(c => c.id === 'consulta-visitas')];
            try {
                const pendingDocs = typeof offlineDB !== 'undefined' ? await offlineDB.getPendingDocumentos().catch(() => []) : [];
                if (pendingDocs && pendingDocs.length > 0) {
                    consultasVisiveis.push(CONSULTAS.find(c => c.id === 'consulta-documentos'));
                }
                // Campanhas: verificar se há fotos de campanha em checkouts pendentes
                const allMeta = typeof offlineDB !== 'undefined' ? await offlineDB.getAll('syncMeta').catch(() => []) : [];
                const hasCampanha = (allMeta || []).some(item => item.key && item.key.startsWith('pendingCheckout_') && item.value?.campanhaFotos?.length > 0);
                if (hasCampanha) {
                    consultasVisiveis.push(CONSULTAS.find(c => c.id === 'consulta-campanha'));
                }
                // Despesas: verificar pendentes
                const pendingDesp = typeof offlineDB !== 'undefined' ? await offlineDB.getPendingDespesas().catch(() => []) : [];
                if (pendingDesp && pendingDesp.length > 0) {
                    consultasVisiveis.push(CONSULTAS.find(c => c.id === 'consulta-despesas'));
                }
            } catch (e) { console.warn('[PWA] Erro ao verificar pendentes para consultas:', e.message); }
            consultasVisiveis = consultasVisiveis.filter(Boolean);
        }

        pwaContent.innerHTML = `
            <div class="pwa-page pwa-fullscreen-page">
                <div class="pwa-page-header-bar">
                    <button class="pwa-back-btn" onclick="pwaApp.voltarHome()">&#8592;</button>
                    <span class="pwa-page-header-title">Consultas</span>
                </div>
                <div class="pwa-page-body">
                ${!navigator.onLine ? '<div style="background:#fef3c7;padding:8px 12px;border-radius:8px;margin-bottom:12px;font-size:12px;color:#92400e;text-align:center;">Modo offline — exibindo registros offline pendentes</div>' : ''}
                ${consultasVisiveis.map(c => `
                    <div class="pwa-consulta-item" onclick="pwaApp.navigate('${c.id}')">
                        <span class="pwa-consulta-icon">${c.icon}</span>
                        <span class="pwa-consulta-label">${c.label}</span>
                        <span class="pwa-consulta-arrow">&#8250;</span>
                    </div>
                `).join('')}
                ${!navigator.onLine && consultasVisiveis.length <= 1 ? '<div style="padding:20px;text-align:center;font-size:13px;color:#9ca3af;">Nenhum registro offline pendente para exibir</div>' : ''}
                </div>
            </div>
        `;
    }

    function renderConsultaDetalhe(consultaId) {
        const consultaInfo = CONSULTAS.find(c => c.id === consultaId);
        const titulo = consultaInfo?.label || 'Consulta';

        // Consulta Roteiro: usar mesma sistemática do modo web (navigateTo) com layout PWA
        if (consultaId === 'consulta-roteiro' && typeof window.app !== 'undefined' && window.app.navigateTo) {
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
            window.app.navigateTo('consulta-roteiro', {}, { replaceHistory: true, pwaMode: true, pwaContainer: container });
            return;
        }

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

        // Demais consultas usam cache-first (dados já sincronizados via sync diário)
        if (typeof offlineDB !== 'undefined') {
            renderConsultaFromCache(consultaId, container);
            return;
        }

        container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Dados não disponíveis. Execute a sincronização.</div></div>';
    }

    // ==================== CONSULTAS DO CACHE (offline-first, online fallback) ====================

    // Helper: buscar dados da API quando cache está vazio e estamos online
    // Online: últimos 90 dias (3 meses). Offline sync: 15 dias (definido no performDailySync)
    async function fetchConsultaOnline(endpoint, dataField, dias = 90) {
        if (!navigator.onLine) return null;
        try {
            const token = localStorage.getItem('auth_token');
            const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
            const url = `${API_BASE_URL}/api/sync/${endpoint}?dias=${dias}`;
            const res = await syncService.fetchWithTimeout(url, { headers }, 15000);
            const data = await res.json();
            if (data.ok && data[dataField]) {
                console.log(`[PWA Consulta] ${endpoint} (${dias}d): ${data[dataField].length} itens da API`);
                return data[dataField];
            }
        } catch (e) { console.warn(`[PWA Consulta] Erro fetch ${endpoint}:`, e.message); }
        return null;
    }

    async function renderConsultaFromCache(consultaId, container) {
        try {
            let dados = [];
            // Semana atual para filtro default
            const hoje = new Date();
            const inicioSemana = new Date(hoje); inicioSemana.setDate(hoje.getDate() - 7);
            const hojeStr = hoje.toISOString().split('T')[0];
            const semanaStr = inicioSemana.toISOString().split('T')[0];

            switch (consultaId) {
                case 'consulta-visitas': {
                    // Offline: cache 15 dias + registros offline pendentes
                    // Online: cache + fetch com filtro de data
                    dados = await offlineDB.getSessoesRecentes();
                    // Merge pending sessions
                    const pendingSessions = await offlineDB.getPendingSessions();
                    const pendingMapped = pendingSessions.map(s => ({
                        sessao_id: s.localId || `pending_${s.createdAt}`,
                        cliente_id: s.cliente_id || s.clienteId || '',
                        cliente_nome: s.cliente_nome || s.clienteNome || 'N/D',
                        checkin_data_hora: s.checkin_data_hora || s.checkinDataHora || s.createdAt,
                        checkout_data_hora: s.checkout_data_hora || s.checkoutDataHora || null,
                        status: s.checkout_data_hora ? 'finalizado' : 'em_atendimento',
                        endereco_cliente: s.endereco_cliente || s.enderecoCliente || '',
                        _pendente: true
                    }));
                    dados = [...dados, ...pendingMapped];
                    cachedData._visitas = dados;
                    renderVisitasInline(dados, container, hojeStr, semanaStr);
                    break;
                }
                case 'consulta-campanha': {
                    if (navigator.onLine) {
                        // Online: buscar da API com filtros
                        dados = await offlineDB.getCampanhas();
                        cachedData._campanhas = dados;
                        renderCampanhasInline(dados, container, hojeStr, semanaStr);
                    } else {
                        // Offline: mostrar apenas registros pendentes de campanha
                        const allMeta = await offlineDB.getAll('syncMeta').catch(() => []);
                        const pendingCheckouts = (allMeta || []).filter(item => item.key && item.key.startsWith('pendingCheckout_') && item.value?.campanhaFotos?.length > 0);
                        dados = pendingCheckouts.map(item => ({
                            id: `pending_${item.key}`,
                            cliente_nome: item.value?.clienteNome || 'N/D',
                            cliente_id: item.value?.clienteId || '',
                            data_planejada: item.value?.dataVisita || item.value?.timestamp || '',
                            _pendente: true,
                            fotos_count: item.value?.campanhaFotos?.length || 0
                        }));
                        cachedData._campanhas = dados;
                        renderCampanhasInline(dados, container, hojeStr, semanaStr);
                    }
                    break;
                }
                case 'consulta-roteiro': {
                    dados = await offlineDB.getRoteirosConsulta();
                    if ((!dados || dados.length === 0) && navigator.onLine) {
                        const fresh = await fetchConsultaOnline('roteiros-consulta', 'roteiros');
                        if (fresh) { await offlineDB.salvarRoteirosConsulta(fresh).catch(() => {}); dados = fresh; }
                    }
                    await renderRoteirosInline(dados, container);
                    break;
                }
                case 'consulta-documentos': {
                    if (navigator.onLine) {
                        // Online: cache do servidor + pendentes
                        dados = await offlineDB.getDocumentosCache();
                    } else {
                        // Offline: apenas documentos pendentes
                        dados = [];
                    }
                    const pendingDocs = await offlineDB.getPendingDocumentos();
                    const pendingDocsMapped = pendingDocs.map(d => ({
                        doc_id: d.id || `pending_${d.createdAt}`,
                        tipo_nome: d.tipoNome || d.tipo_nome || 'Documento',
                        doc_status: 'PENDENTE',
                        doc_data_ref: d.dataRef || (d.createdAt ? d.createdAt.split('T')[0] : ''),
                        doc_hora_ref: d.horaRef || '',
                        doc_nome_original: d.nomeOriginal || '',
                        doc_observacao: d.observacao || '',
                        _pendente: true
                    }));
                    dados = [...dados, ...pendingDocsMapped];
                    cachedData._documentos = dados;
                    renderDocumentosInline(dados, container, hojeStr, semanaStr);
                    break;
                }
                case 'consulta-despesas': {
                    if (navigator.onLine) {
                        // Online: cache do servidor + pendentes
                        dados = await offlineDB.getDespesas();
                    } else {
                        // Offline: apenas despesas pendentes
                        dados = [];
                    }
                    const pendingDesp = await offlineDB.getPendingDespesas();
                    for (const desp of pendingDesp) {
                        if (desp.rubricas && Array.isArray(desp.rubricas)) {
                            for (const rub of desp.rubricas) {
                                if (Number(rub.valor) > 0) {
                                    dados.push({
                                        id: `pending_${desp.id}_${rub.id}`,
                                        dv_data_ref: desp.dataRef || (desp.createdAt ? desp.createdAt.split('T')[0] : ''),
                                        dv_valor: rub.valor,
                                        rubrica_nome: rub.nome || rub.codigo || '-',
                                        dv_gst_codigo: rub.codigo || '',
                                        _pendente: true
                                    });
                                }
                            }
                        }
                    }
                    cachedData._despesas = dados;
                    renderDespesasInline(dados, container, hojeStr, semanaStr);
                    break;
                }
                default:
                    container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Consulta não disponível no cache</div></div>';
                    break;
            }
        } catch (e) {
            console.error('[PWA] Erro ao renderizar consulta do cache:', e);
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Erro ao carregar dados</div></div>';
        }
    }

    function formatarData(dataStr) {
        if (!dataStr) return '-';
        try {
            const parts = dataStr.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        } catch (_) {}
        return dataStr;
    }

    function renderVisitasInline(dados, container, hojeStr, semanaStr) {
        // Build client options from data
        const clientesUnicos = {};
        (dados || []).forEach(s => {
            const id = String(s.cliente_id || '');
            if (id && !clientesUnicos[id]) {
                clientesUnicos[id] = s.cliente_nome || id;
            }
        });
        const clienteOptions = Object.entries(clientesUnicos)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, nome]) => `<option value="${id}">${escapeHtml(id)} - ${escapeHtml(nome)}</option>`)
            .join('');

        // Render filters
        let html = `
            <div style="background:#f9fafb;padding:10px;border-radius:8px;margin-bottom:12px;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                    <input type="date" id="pwaFiltroVisitaDataIni" value="${semanaStr || ''}" style="flex:1;min-width:120px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
                    <input type="date" id="pwaFiltroVisitaDataFim" value="${hojeStr || ''}" style="flex:1;min-width:120px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                    <select id="pwaFiltroVisitaCliente" style="flex:2;min-width:140px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
                        <option value="">Todos os clientes</option>
                        ${clienteOptions}
                    </select>
                    <select id="pwaFiltroVisitaStatus" style="flex:1;min-width:100px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
                        <option value="">Todos</option>
                        <option value="finalizado">Finalizado</option>
                        <option value="em_atendimento">Em atendimento</option>
                    </select>
                </div>
                <div style="display:flex;gap:6px;">
                    <button onclick="pwaApp.filtrarVisitas()" style="flex:1;padding:8px;background:#ef4444;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Buscar</button>
                    <button onclick="pwaApp.limparFiltrosVisitas()" style="flex:1;padding:8px;background:#e5e7eb;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Limpar</button>
                </div>
                ${!navigator.onLine ? '<div style="font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Offline — dados do cache local (15 dias)</div>' : '<div style="font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Online — busque até 3 meses</div>'}
            </div>
            <div id="pwaVisitasResultados"></div>`;

        container.innerHTML = html;
        // Filtrar dados da semana para exibição inicial
        const filtrados = filtrarPorData(dados || [], semanaStr, hojeStr, 'checkin_data_hora', 'data_planejada');
        renderVisitasResultados(filtrados);
    }

    function renderVisitasResultados(dados) {
        const container = document.getElementById('pwaVisitasResultados');
        if (!container) return;

        if (!dados || dados.length === 0) {
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Nenhuma visita encontrada</div></div>';
            return;
        }

        // Agrupar por data
        const porData = {};
        for (const s of dados) {
            const checkinDate = s.checkin_data_hora || s.data_planejada || '';
            const dataKey = checkinDate ? checkinDate.split('T')[0] : 'sem-data';
            if (!porData[dataKey]) porData[dataKey] = [];
            porData[dataKey].push(s);
        }

        const datasOrdenadas = Object.keys(porData).sort().reverse();
        let html = `<div class="pwa-consulta-list">
            <div style="background: #eff6ff; padding: 10px; border-radius: 8px; margin-bottom: 12px; text-align: center;">
                <div style="font-size: 13px; color: #1e40af;">Total: ${dados.length} visitas</div>
            </div>`;

        for (const data of datasOrdenadas) {
            const sessoes = porData[data];
            html += `<div style="font-weight: 700; color: #ef4444; margin: 12px 0 8px; font-size: 15px;">${formatarData(data)} (${sessoes.length} visitas)</div>`;
            for (const s of sessoes) {
                const statusColor = s.status === 'finalizado' ? '#10b981' : s.status === 'em_atendimento' ? '#f59e0b' : '#9ca3af';
                const statusLabel = s.status === 'finalizado' ? 'Finalizado' : s.status === 'em_atendimento' ? 'Em atendimento' : 'Sem check-in';
                const checkinHora = s.checkin_data_hora ? new Date(s.checkin_data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
                const checkoutHora = s.checkout_data_hora ? new Date(s.checkout_data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
                const pendenteBadge = s._pendente ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#fef3c7;color:#92400e;margin-left:6px;">Pendente de envio</span>' : '';

                html += `
                    <div class="pwa-card" style="margin-bottom: 6px; padding: 10px;${s._pendente ? 'border-left:3px solid #f59e0b;' : ''}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="font-weight: 600; font-size: 13px; color: #1f2937;">${escapeHtml(String(s.cliente_id || ''))} - ${escapeHtml(s.cliente_nome || 'N/D')}${pendenteBadge}</div>
                            <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: ${statusColor}20; color: ${statusColor};">${statusLabel}</span>
                        </div>
                        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                            Checkin: ${checkinHora} | Checkout: ${checkoutHora}
                        </div>
                        ${s.endereco_cliente ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${escapeHtml(s.endereco_cliente)}</div>` : ''}
                    </div>`;
            }
        }
        html += '</div>';
        container.innerHTML = html;
    }

    // Filtrar visitas em memória
    window.pwaApp = window.pwaApp || {};
    pwaApp.filtrarVisitas = async function() {
        const dataIni = document.getElementById('pwaFiltroVisitaDataIni')?.value || '';
        const dataFim = document.getElementById('pwaFiltroVisitaDataFim')?.value || '';
        const clienteId = document.getElementById('pwaFiltroVisitaCliente')?.value || '';
        const status = document.getElementById('pwaFiltroVisitaStatus')?.value || '';

        // Online: buscar da API com o período selecionado
        if (navigator.onLine && dataIni) {
            const resultsEl = document.getElementById('pwaVisitasResultados');
            if (resultsEl) resultsEl.innerHTML = '<div class="pwa-loading-inline"><div class="pwa-spinner-small"></div><span>Buscando...</span></div>';
            try {
                const repId = typeof authManager !== 'undefined' ? authManager.getRepId?.() : null;
                if (repId) {
                    const fim = dataFim || new Date().toISOString().split('T')[0];
                    const token = localStorage.getItem('auth_token');
                    const url = `${API_BASE_URL}/api/registro-rota/sessoes?data_checkin_inicio=${dataIni}&data_checkin_fim=${fim}&rep_id=${repId}&status=todos`;
                    const res = await syncService.fetchWithTimeout(url, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }, 15000).then(r => r.json());
                    if (res.sessoes) {
                        await offlineDB.salvarSessoesRecentes(res.sessoes).catch(() => {});
                        cachedData._visitas = res.sessoes;
                    }
                }
            } catch (e) { console.warn('[PWA Consulta] Erro fetch visitas:', e.message); }
        }

        let filtrados = cachedData._visitas || [];
        if (dataIni) {
            filtrados = filtrados.filter(s => {
                const d = (s.checkin_data_hora || s.data_planejada || '').split('T')[0];
                return d >= dataIni;
            });
        }
        if (dataFim) {
            filtrados = filtrados.filter(s => {
                const d = (s.checkin_data_hora || s.data_planejada || '').split('T')[0];
                return d <= dataFim;
            });
        }
        if (clienteId) {
            filtrados = filtrados.filter(s => String(s.cliente_id) === clienteId);
        }
        if (status) {
            filtrados = filtrados.filter(s => s.status === status);
        }
        renderVisitasResultados(filtrados);
    };

    pwaApp.limparFiltrosVisitas = function() {
        const el1 = document.getElementById('pwaFiltroVisitaDataIni'); if (el1) el1.value = '';
        const el2 = document.getElementById('pwaFiltroVisitaDataFim'); if (el2) el2.value = '';
        const el3 = document.getElementById('pwaFiltroVisitaCliente'); if (el3) el3.value = '';
        const el4 = document.getElementById('pwaFiltroVisitaStatus'); if (el4) el4.value = '';
        renderVisitasResultados(cachedData._visitas || []);
    };

    // ==================== HELPER: Filtrar por data ====================
    function filtrarPorData(dados, dataIni, dataFim, ...camposData) {
        if (!dados || dados.length === 0) return [];
        let filtrados = dados;
        if (dataIni) {
            filtrados = filtrados.filter(item => {
                for (const campo of camposData) {
                    const val = item[campo];
                    if (val) { return (val.split('T')[0] || val) >= dataIni; }
                }
                return false;
            });
        }
        if (dataFim) {
            filtrados = filtrados.filter(item => {
                for (const campo of camposData) {
                    const val = item[campo];
                    if (val) { return (val.split('T')[0] || val) <= dataFim; }
                }
                return false;
            });
        }
        return filtrados;
    }

    // ==================== FILTROS: Campanhas ====================
    pwaApp.buscarCampanhas = async function() {
        const dataIni = document.getElementById('pwaFiltroCampanhaDataIni')?.value || '';
        const dataFim = document.getElementById('pwaFiltroCampanhaDataFim')?.value || '';
        // Online: buscar da API com o período selecionado
        if (navigator.onLine && dataIni) {
            const resultsEl = document.getElementById('pwaCampanhasResultados');
            if (resultsEl) resultsEl.innerHTML = '<div class="pwa-loading-inline"><div class="pwa-spinner-small"></div><span>Buscando...</span></div>';
            const dias = Math.min(90, Math.ceil((new Date(dataFim || new Date()) - new Date(dataIni)) / 86400000) + 7);
            const fresh = await fetchConsultaOnline('campanhas', 'campanhas', dias);
            if (fresh) {
                await offlineDB.salvarCampanhas(fresh).catch(() => {});
                cachedData._campanhas = fresh;
            }
        }
        const filtrados = filtrarPorData(cachedData._campanhas || [], dataIni, dataFim, 'data_planejada', 'data_hora');
        renderCampanhasResultados(filtrados);
    };
    pwaApp.limparFiltrosCampanhas = function() {
        const el1 = document.getElementById('pwaFiltroCampanhaDataIni'); if (el1) el1.value = '';
        const el2 = document.getElementById('pwaFiltroCampanhaDataFim'); if (el2) el2.value = '';
        renderCampanhasResultados(cachedData._campanhas || []);
    };

    // ==================== FILTROS: Documentos ====================
    pwaApp.buscarDocumentos = async function() {
        const dataIni = document.getElementById('pwaFiltroDocDataIni')?.value || '';
        const dataFim = document.getElementById('pwaFiltroDocDataFim')?.value || '';
        if (navigator.onLine && dataIni) {
            const resultsEl = document.getElementById('pwaDocumentosResultados');
            if (resultsEl) resultsEl.innerHTML = '<div class="pwa-loading-inline"><div class="pwa-spinner-small"></div><span>Buscando...</span></div>';
            const dias = Math.min(90, Math.ceil((new Date(dataFim || new Date()) - new Date(dataIni)) / 86400000) + 7);
            const fresh = await fetchConsultaOnline('documentos-cache', 'documentos', dias);
            if (fresh) {
                await offlineDB.salvarDocumentosCache(fresh).catch(() => {});
                // Merge pendentes
                const pendingDocs = await offlineDB.getPendingDocumentos().catch(() => []);
                const merged = [...fresh, ...pendingDocs.map(d => ({
                    doc_id: d.id || `pending_${d.createdAt}`, tipo_nome: d.tipoNome || 'Documento',
                    doc_status: 'PENDENTE', doc_data_ref: d.dataRef || '', _pendente: true
                }))];
                cachedData._documentos = merged;
            }
        }
        const filtrados = filtrarPorData(cachedData._documentos || [], dataIni, dataFim, 'doc_data_ref');
        renderDocumentosResultados(filtrados);
    };
    pwaApp.limparFiltrosDocumentos = function() {
        const el1 = document.getElementById('pwaFiltroDocDataIni'); if (el1) el1.value = '';
        const el2 = document.getElementById('pwaFiltroDocDataFim'); if (el2) el2.value = '';
        renderDocumentosResultados(cachedData._documentos || []);
    };

    // ==================== FILTROS: Despesas ====================
    pwaApp.buscarDespesas = async function() {
        const dataIni = document.getElementById('pwaFiltroDespDataIni')?.value || '';
        const dataFim = document.getElementById('pwaFiltroDespDataFim')?.value || '';
        if (navigator.onLine && dataIni) {
            const resultsEl = document.getElementById('pwaDespesasResultados');
            if (resultsEl) resultsEl.innerHTML = '<div class="pwa-loading-inline"><div class="pwa-spinner-small"></div><span>Buscando...</span></div>';
            const dias = Math.min(90, Math.ceil((new Date(dataFim || new Date()) - new Date(dataIni)) / 86400000) + 7);
            const fresh = await fetchConsultaOnline('despesas', 'despesas', dias);
            if (fresh) {
                await offlineDB.salvarDespesas(fresh).catch(() => {});
                // Merge pendentes
                const pendingDesp = await offlineDB.getPendingDespesas().catch(() => []);
                const merged = [...fresh];
                for (const desp of pendingDesp) {
                    if (desp.rubricas && Array.isArray(desp.rubricas)) {
                        for (const rub of desp.rubricas) {
                            if (Number(rub.valor) > 0) {
                                merged.push({ id: `pending_${desp.id}_${rub.id}`, dv_data_ref: desp.dataRef || '', dv_valor: rub.valor, rubrica_nome: rub.nome || '-', _pendente: true });
                            }
                        }
                    }
                }
                cachedData._despesas = merged;
            }
        }
        const filtrados = filtrarPorData(cachedData._despesas || [], dataIni, dataFim, 'dv_data_ref');
        renderDespesasResultados(filtrados);
    };
    pwaApp.limparFiltrosDespesas = function() {
        const el1 = document.getElementById('pwaFiltroDespDataIni'); if (el1) el1.value = '';
        const el2 = document.getElementById('pwaFiltroDespDataFim'); if (el2) el2.value = '';
        renderDespesasResultados(cachedData._despesas || []);
    };

    async function renderCampanhasInline(dados, container, hojeStr, semanaStr) {
        const html = `
            <div style="background:#f9fafb;padding:10px;border-radius:8px;margin-bottom:12px;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                    <input type="date" id="pwaFiltroCampanhaDataIni" value="${semanaStr || ''}" style="flex:1;min-width:120px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
                    <input type="date" id="pwaFiltroCampanhaDataFim" value="${hojeStr || ''}" style="flex:1;min-width:120px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
                </div>
                <div style="display:flex;gap:6px;">
                    <button onclick="pwaApp.buscarCampanhas()" style="flex:1;padding:8px;background:#ef4444;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Buscar</button>
                    <button onclick="pwaApp.limparFiltrosCampanhas()" style="flex:1;padding:8px;background:#e5e7eb;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Limpar</button>
                </div>
                ${!navigator.onLine ? '<div style="font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Offline — dados do cache local (15 dias)</div>' : '<div style="font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Online — busque até 3 meses</div>'}
            </div>
            <div id="pwaCampanhasResultados"></div>`;
        container.innerHTML = html;
        // Filtrar dados da semana para exibição inicial
        const filtrados = filtrarPorData(dados || [], semanaStr, hojeStr, 'data_planejada', 'data_hora');
        renderCampanhasResultados(filtrados);
    }

    function renderCampanhasResultados(dados) {
        const container = document.getElementById('pwaCampanhasResultados');
        if (!container) return;
        if (!dados || dados.length === 0) {
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Nenhuma campanha no período</div></div>';
            return;
        }
        let html = `<div class="pwa-consulta-list">
            <div style="background:#eff6ff;padding:10px;border-radius:8px;margin-bottom:12px;text-align:center;">
                <div style="font-size:13px;color:#1e40af;">Total: ${dados.length} campanhas</div>
            </div>`;
        for (const item of dados) {
            const data = formatarData(item.data_planejada || (item.data_hora ? item.data_hora.split('T')[0] : ''));
            html += `
                <div class="pwa-card" style="margin-bottom: 8px; padding: 12px;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 14px;">${escapeHtml(item.cliente_nome || item.cliente_id || '-')}</div>
                    <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">Data: ${data}</div>
                    ${item.descricao ? `<div style="font-size: 13px; color: #374151; margin-top: 4px;">${escapeHtml(item.descricao)}</div>` : ''}
                </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    }

    async function renderRoteirosInline(dados, container) {
        if (!dados || dados.length === 0) {
            const ultimaSync = typeof offlineDB !== 'undefined' ? await offlineDB.getUltimaSync() : null;
            const syncInfo = ultimaSync ? `Última sincronização: ${new Date(ultimaSync).toLocaleString('pt-BR')}` : 'Nenhuma sincronização realizada';
            container.innerHTML = `<div class="pwa-empty-state"><div class="pwa-empty-text">Nenhum roteiro vigente</div><div style="font-size:12px;color:#9ca3af;margin-top:4px">${syncInfo}</div></div>`;
            return;
        }

        // JOIN com clientes do cache para obter nome, fantasia, endereço
        let clienteMap = {};
        try {
            const clientes = await offlineDB.getAll('clientes');
            clientes.forEach(c => { clienteMap[String(c.cli_codigo)] = c; });
        } catch (_) {}

        const repId = getRepId();
        const usuario = getUsuario();
        const repoNome = usuario.nome_completo || usuario.username || `Repositor ${repId}`;

        // Enrich data
        dados.forEach(r => {
            const cli = clienteMap[String(r.cliente_id)] || {};
            r.cli_nome = cli.cli_nome || '';
            r.cli_fantasia = cli.cli_fantasia || '';
            r.cli_endereco = cli.cli_endereco || '';
            r.cli_bairro = cli.cli_bairro || '';
            r.cli_cidade = cli.cli_cidade || r.cidade || '';
        });

        // Store for filtering/export
        cachedData._roteiros = dados;
        cachedData._roteiroRepoInfo = { repo_cod: repId, repo_nome: repoNome };

        const diasLabel = { dom: 'Domingo', seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado' };
        const diasOrdem = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
        const diasOptions = diasOrdem.map(d => `<option value="${d}">${diasLabel[d]}</option>`).join('');

        // Filters + export buttons
        let html = `
            <div style="background:#f9fafb;padding:10px;border-radius:8px;margin-bottom:12px;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                    <select id="pwaFiltroRoteiroDia" style="flex:1;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
                        <option value="">Todos os dias</option>
                        ${diasOptions}
                    </select>
                    <button onclick="pwaApp.filtrarRoteiros()" style="padding:8px 16px;background:#ef4444;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Filtrar</button>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button onclick="pwaApp.exportarRoteiroPDF('detalhado')" style="flex:1;padding:6px;background:#1e40af;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">PDF Detalhado</button>
                    <button onclick="pwaApp.exportarRoteiroPDF('semanal')" style="flex:1;padding:6px;background:#1e40af;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">PDF Semanal</button>
                    <button onclick="pwaApp.exportarRoteiroXLS()" style="flex:1;padding:6px;background:#047857;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">Excel</button>
                    <button onclick="pwaApp.enviarRoteiroWhatsApp()" style="flex:1;padding:6px;background:#25d366;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">WhatsApp</button>
                </div>
            </div>
            <div id="pwaRoteirosResultados"></div>`;

        container.innerHTML = html;
        renderRoteirosResultados(dados);
    }

    function renderRoteirosResultados(dados) {
        const container = document.getElementById('pwaRoteirosResultados');
        if (!container) return;

        if (!dados || dados.length === 0) {
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Nenhum roteiro encontrado</div></div>';
            return;
        }

        const diasLabel = { dom: 'Domingo', seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado' };
        const diasOrdem = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

        // Agrupar por dia + cidade (estilo web mobile)
        const grupos = {};
        for (const item of dados) {
            const dia = item.dia_semana || 'outro';
            const cidade = item.cli_cidade || item.cidade || 'Sem cidade';
            const key = `${dia}|${cidade}`;
            if (!grupos[key]) grupos[key] = { dia, cidade, items: [] };
            grupos[key].items.push(item);
        }

        // Ordenar por dia da semana
        const gruposOrdenados = Object.values(grupos).sort((a, b) => {
            const ia = diasOrdem.indexOf(a.dia);
            const ib = diasOrdem.indexOf(b.dia);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

        let html = `<div style="font-size:13px;color:#6b7280;margin-bottom:8px;">Total: ${dados.length} clientes</div>`;
        html += '<div style="display:flex;flex-direction:column;gap:12px;">';

        for (const grupo of gruposOrdenados) {
            html += `
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                    <div style="background:linear-gradient(135deg,#dc2626,#ef4444);color:white;padding:10px 12px;">
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <span style="font-weight:700;font-size:0.95rem;">${diasLabel[grupo.dia] || grupo.dia}</span>
                            <span style="font-size:0.85rem;opacity:0.9;">${escapeHtml(grupo.cidade)}</span>
                        </div>
                    </div>
                    <div style="padding:8px 0;">`;

            for (const item of grupo.items) {
                html += `
                        <div style="display:flex;align-items:baseline;gap:8px;padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:0.85rem;">
                            <span style="font-weight:700;color:#dc2626;min-width:28px;">#${item.ordem_visita || '-'}</span>
                            <span style="color:#374151;flex:1;">${escapeHtml(String(item.cliente_id || ''))} - ${escapeHtml(item.cli_nome || '-')}</span>
                            ${item.cli_fantasia ? `<span style="color:#6b7280;font-size:0.8rem;">(${escapeHtml(item.cli_fantasia)})</span>` : ''}
                        </div>`;
            }

            html += '</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    // Roteiro filter + export functions
    pwaApp.filtrarRoteiros = function() {
        const dia = document.getElementById('pwaFiltroRoteiroDia')?.value || '';
        let filtrados = cachedData._roteiros || [];
        if (dia) filtrados = filtrados.filter(r => r.dia_semana === dia);
        renderRoteirosResultados(filtrados);
    };

    function mapRoteirosParaExport(dados) {
        const repId = getRepId();
        const usuario = getUsuario();
        const repoNome = usuario.nome_completo || usuario.username || `Repositor ${repId}`;
        return (dados || []).map(r => ({
            rot_repositor_id: r.repo_cod || repId,
            rot_dia_semana: r.dia_semana,
            rot_cidade: r.cli_cidade || r.cidade || '',
            rot_ordem_cidade: r.rot_ordem_cidade || 0,
            rot_cliente_codigo: r.cliente_id,
            rot_ordem_visita: r.ordem_visita,
            repo_cod: r.repo_cod || repId,
            repo_nome: r.repo_nome || repoNome,
            rot_venda_centralizada: r.venda_centralizada,
            cliente_dados: {
                nome: r.cli_nome || '',
                fantasia: r.cli_fantasia || '',
                endereco: r.cli_endereco || '',
                bairro: r.cli_bairro || '',
                grupo_desc: ''
            }
        }));
    }

    pwaApp.exportarRoteiroPDF = function(formato) {
        if (typeof window.app === 'undefined') { showToast('Módulo de exportação não disponível', 'error'); return; }
        const registros = mapRoteirosParaExport(cachedData._roteiros);
        const repoInfo = cachedData._roteiroRepoInfo || {};
        const dataGeracao = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const dataNome = window.app.formatarDataParaNomeArquivo ? window.app.formatarDataParaNomeArquivo(new Date()) : new Date().toISOString().split('T')[0];
        const ctx = { dataGeracao, dataAtualizacao: dataGeracao };
        try {
            if (formato === 'semanal' && window.app.gerarPDFRoteiroSemanal) {
                window.app.gerarPDFRoteiroSemanal(registros, repoInfo, ctx, dataNome);
            } else if (window.app.gerarPDFRoteiroDetalhado) {
                window.app.gerarPDFRoteiroDetalhado(registros, repoInfo, ctx, dataNome);
            }
            showToast('PDF gerado com sucesso');
        } catch (e) { showToast('Erro ao gerar PDF: ' + e.message, 'error'); }
    };

    pwaApp.exportarRoteiroXLS = function() {
        if (typeof window.app === 'undefined' || !window.app.gerarExcelRoteiroDetalhado) { showToast('Módulo de exportação não disponível', 'error'); return; }
        const registros = mapRoteirosParaExport(cachedData._roteiros);
        const repoInfo = cachedData._roteiroRepoInfo || {};
        const dataNome = new Date().toISOString().split('T')[0].replace(/-/g, '');
        try {
            window.app.gerarExcelRoteiroDetalhado(registros, repoInfo, dataNome);
            showToast('Excel gerado com sucesso');
        } catch (e) { showToast('Erro ao gerar Excel: ' + e.message, 'error'); }
    };

    pwaApp.enviarRoteiroWhatsApp = function() {
        if (typeof window.app === 'undefined' || !window.app.gerarMensagemWhatsAppRoteiro) { showToast('Módulo não disponível', 'error'); return; }
        const registros = mapRoteirosParaExport(cachedData._roteiros);
        const repoInfo = cachedData._roteiroRepoInfo || {};
        const dataAtual = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        try {
            window.app.gerarMensagemWhatsAppRoteiro(registros, repoInfo, dataAtual);
        } catch (e) { showToast('Erro ao gerar mensagem: ' + e.message, 'error'); }
    };

    async function renderDocumentosInline(dados, container, hojeStr, semanaStr) {
        const html = `
            <div style="background:#f9fafb;padding:10px;border-radius:8px;margin-bottom:12px;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                    <input type="date" id="pwaFiltroDocDataIni" value="${semanaStr || ''}" style="flex:1;min-width:120px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
                    <input type="date" id="pwaFiltroDocDataFim" value="${hojeStr || ''}" style="flex:1;min-width:120px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
                </div>
                <div style="display:flex;gap:6px;">
                    <button onclick="pwaApp.buscarDocumentos()" style="flex:1;padding:8px;background:#ef4444;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Buscar</button>
                    <button onclick="pwaApp.limparFiltrosDocumentos()" style="flex:1;padding:8px;background:#e5e7eb;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Limpar</button>
                </div>
                ${!navigator.onLine ? '<div style="font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Offline — dados do cache local (15 dias)</div>' : '<div style="font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Online — busque até 3 meses</div>'}
            </div>
            <div id="pwaDocumentosResultados"></div>`;
        container.innerHTML = html;
        const filtrados = filtrarPorData(dados || [], semanaStr, hojeStr, 'doc_data_ref');
        renderDocumentosResultados(filtrados);
    }

    function renderDocumentosResultados(dados) {
        const container = document.getElementById('pwaDocumentosResultados');
        if (!container) return;
        if (!dados || dados.length === 0) {
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Nenhum documento no período</div></div>';
            return;
        }
        let html = `<div class="pwa-consulta-list">
            <div style="background:#eff6ff;padding:10px;border-radius:8px;margin-bottom:12px;text-align:center;">
                <div style="font-size:13px;color:#1e40af;">Total: ${dados.length} documentos</div>
            </div>`;
        for (const doc of dados) {
            const data = formatarData(doc.doc_data_ref);
            const isPendente = doc._pendente;
            const statusColor = isPendente ? '#f59e0b' : (doc.doc_status === 'ENVIADO' ? '#10b981' : '#f59e0b');
            const statusText = isPendente ? 'PENDENTE' : (doc.doc_status || '-');
            const pendenteBadge = isPendente ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:#fef3c7;color:#92400e;margin-left:6px;">Pendente de envio</span>' : '';
            html += `
                <div class="pwa-card" style="margin-bottom: 8px; padding: 12px;${isPendente ? 'border-left:3px solid #f59e0b;' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-weight: 600; font-size: 14px; color: #1f2937;">${escapeHtml(doc.tipo_nome || 'Documento')}${pendenteBadge}</div>
                        <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: ${statusColor}20; color: ${statusColor};">${statusText}</span>
                    </div>
                    <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">Data: ${data} ${doc.doc_hora_ref || ''}</div>
                    <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">${escapeHtml(doc.doc_nome_original || '')}</div>
                    ${doc.doc_observacao ? `<div style="font-size: 12px; color: #374151; margin-top: 4px;">${escapeHtml(doc.doc_observacao)}</div>` : ''}
                </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    }

    async function renderDespesasInline(dados, container, hojeStr, semanaStr) {
        const html = `
            <div style="background:#f9fafb;padding:10px;border-radius:8px;margin-bottom:12px;">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                    <input type="date" id="pwaFiltroDespDataIni" value="${semanaStr || ''}" style="flex:1;min-width:120px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
                    <input type="date" id="pwaFiltroDespDataFim" value="${hojeStr || ''}" style="flex:1;min-width:120px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;" />
                </div>
                <div style="display:flex;gap:6px;">
                    <button onclick="pwaApp.buscarDespesas()" style="flex:1;padding:8px;background:#ef4444;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Buscar</button>
                    <button onclick="pwaApp.limparFiltrosDespesas()" style="flex:1;padding:8px;background:#e5e7eb;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Limpar</button>
                </div>
                ${!navigator.onLine ? '<div style="font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Offline — dados do cache local</div>' : '<div style="font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Online — busque até 3 meses</div>'}
            </div>
            <div id="pwaDespesasResultados"></div>`;
        container.innerHTML = html;
        const filtrados = filtrarPorData(dados || [], semanaStr, hojeStr, 'dv_data_ref');
        renderDespesasResultados(filtrados);
    }

    function renderDespesasResultados(dados) {
        const container = document.getElementById('pwaDespesasResultados');
        if (!container) return;
        if (!dados || dados.length === 0) {
            container.innerHTML = '<div class="pwa-empty-state"><div class="pwa-empty-text">Nenhuma despesa no período</div></div>';
            return;
        }
        const porData = {};
        let totalGeral = 0;
        for (const d of dados) {
            const data = d.dv_data_ref || 'sem-data';
            if (!porData[data]) porData[data] = [];
            porData[data].push(d);
            totalGeral += Number(d.dv_valor) || 0;
        }
        let html = `<div class="pwa-consulta-list">
            <div style="background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 12px; text-align: center;">
                <div style="font-size: 13px; color: #92400e;">Total do período</div>
                <div style="font-size: 20px; font-weight: 700; color: #78350f;">R$ ${totalGeral.toFixed(2).replace('.', ',')}</div>
            </div>`;
        const datasOrdenadas = Object.keys(porData).sort().reverse();
        for (const data of datasOrdenadas) {
            const itens = porData[data];
            const totalDia = itens.reduce((s, i) => s + (Number(i.dv_valor) || 0), 0);
            html += `<div style="font-weight: 600; color: #374151; margin: 12px 0 6px; font-size: 14px;">${formatarData(data)} - R$ ${totalDia.toFixed(2).replace('.', ',')}</div>`;
            for (const item of itens) {
                const isPendente = item._pendente === true;
                const borderStyle = isPendente ? 'border-left: 3px solid #f59e0b;' : '';
                html += `
                    <div class="pwa-card" style="margin-bottom: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center; ${borderStyle}">
                        <div>
                            <div style="font-size: 13px; color: #1f2937;">${escapeHtml(item.rubrica_nome || item.dv_gst_codigo || '-')}</div>
                            ${isPendente ? '<div style="font-size:11px;color:#f59e0b;font-weight:600;margin-top:2px;">Pendente de envio</div>' : ''}
                        </div>
                        <div style="font-weight: 600; color: #1f2937;">R$ ${(Number(item.dv_valor) || 0).toFixed(2).replace('.', ',')}</div>
                    </div>`;
            }
        }
        html += '</div>';
        container.innerHTML = html;
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
            data_hora: new Date().toISOString(),
            motivo: motivo,
            descricao: motivo,
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

            // Atualizar cache de não-atendimentos para exibição instantânea
            try {
                const cacheKey = `nao_atendimentos_${repId}_${dataVisita}`;
                const cachedNA = JSON.parse(localStorage.getItem(cacheKey) || '[]');
                cachedNA.push({ na_cliente_id: clienteId, na_motivo: motivo });
                localStorage.setItem(cacheKey, JSON.stringify(cachedNA));
            } catch (_) {}

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
                    <button class="pwa-atendimento-action-btn hidden" id="pwaAtendimentoBtnEspacos" onclick="pwaApp.atendimentoAbrirEspaco()">
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
     * Prioridade: IndexedDB cache (offline-first) > mapa app.js > fallback API
     */
    function _verificarPesquisaAtendimento(clienteId, repId, dataVisita) {
        const normalizeId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const cliNorm = normalizeId(clienteId);

        // 1. Verificar cache IndexedDB (offline-first, preenchido pela sync diária)
        if (typeof offlineDB !== 'undefined') {
            offlineDB.getPesquisasCliente(cliNorm)
                .then(pesquisas => {
                    if (pesquisas !== null) {
                        // Cache encontrado - decisão definitiva
                        _mostrarBotaoPesquisa(pesquisas.length > 0);
                        return;
                    }
                    // Sem dados no cache deste cliente - verificar mapa do app.js
                    _verificarPesquisaFallback(cliNorm, repId, dataVisita);
                })
                .catch(() => _verificarPesquisaFallback(cliNorm, repId, dataVisita));
        } else {
            _verificarPesquisaFallback(cliNorm, repId, dataVisita);
        }
    }

    function _verificarPesquisaFallback(cliNorm, repId, dataVisita) {
        // Verificar o mapa já existente no app.js
        const mapa = window.app?.registroRotaState?.pesquisasPendentesMap;
        if (mapa) {
            const pendentes = mapa.get(cliNorm) || [];
            if (pendentes.length > 0) {
                _mostrarBotaoPesquisa(true);
                return;
            }
            if (mapa.has(cliNorm)) {
                _mostrarBotaoPesquisa(false);
                return;
            }
        }

        // Sem dados em cache nem mapa - esconder botão (não fazer busca remota)
        _mostrarBotaoPesquisa(false);
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

    /** Verifica se o cliente tem espaços cadastrados e mostra/esconde botão Espaços.
     *  Prioridade: IndexedDB cache (offline-first) > localStorage > set app.js
     *  Sem fallback para servidor - dados vêm da sync diária.
     */
    function _verificarEspacoAtendimento(clienteId) {
        const normalizeId = (v) => String(v ?? '').trim().replace(/\.0$/, '');
        const cliNorm = normalizeId(clienteId);

        // 1. Verificar cache IndexedDB (offline-first, preenchido pela sync diária)
        if (typeof offlineDB !== 'undefined') {
            offlineDB.getEspacosCliente(cliNorm)
                .then(cached => {
                    if (cached?.temEspacos) {
                        _mostrarBotaoEspacos(true);
                        return;
                    }
                    // Fallback para localStorage
                    _verificarEspacoLocalStorage(cliNorm);
                })
                .catch(() => _verificarEspacoLocalStorage(cliNorm));
        } else {
            _verificarEspacoLocalStorage(cliNorm);
        }
    }

    function _verificarEspacoLocalStorage(cliNorm) {
        // Verificar cache localStorage (instantâneo)
        try {
            const repId = typeof authManager !== 'undefined' ? authManager.getRepId?.() :
                          (window.app?.registroRotaState?.repositorSelecionado ||
                           window.app?.registroRotaState?._cacheRepId);
            if (repId) {
                const cachedEspacos = localStorage.getItem(`espacos_clientes_${repId}`);
                if (cachedEspacos) {
                    const lista = JSON.parse(cachedEspacos);
                    _mostrarBotaoEspacos(lista.includes(cliNorm));
                    return;
                }
            }
        } catch (_) {}

        // Verificar set já carregado no app.js
        const clientesComEspaco = window.app?.registroRotaState?.clientesComEspaco;
        if (clientesComEspaco && clientesComEspaco.size > 0) {
            _mostrarBotaoEspacos(clientesComEspaco.has(cliNorm));
            return;
        }

        // Sem dados - esconder botão (não buscar do servidor)
        _mostrarBotaoEspacos(false);
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

                <div id="pwaListaPendentes"></div>

                <div class="pwa-section-title">Conta</div>
                <div class="pwa-menu-group">
                    <div class="pwa-menu-item danger" id="pwaMenuSair">
                        <span class="pwa-menu-icon">&#10005;</span>
                        <span class="pwa-menu-label">Sair</span>
                    </div>
                </div>

                <div class="pwa-section-title">Desenvolvimento</div>
                <div class="pwa-menu-group">
                    <div class="pwa-menu-item" onclick="pwaApp.toggleDebugConsole()">
                        <span class="pwa-menu-icon">&#128187;</span>
                        <span class="pwa-menu-label">Console Debug</span>
                        <span class="pwa-menu-value">Ver logs</span>
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

                    // Enviar despesas/documentos/checkouts pendentes via app.js
                    if (typeof window.app !== 'undefined') {
                        if (typeof window.app.syncCheckoutsPendentes === 'function') await window.app.syncCheckoutsPendentes().catch(() => {});
                        if (typeof window.app.syncDespesasPendentes === 'function') await window.app.syncDespesasPendentes().catch(() => {});
                        if (typeof window.app.syncDocumentosPendentes === 'function') await window.app.syncDocumentosPendentes().catch(() => {});
                    }

                    await loadLocalData();
                    loadPendingCountMais();

                    showSyncIndicator(false);

                    if (syncLabel) syncLabel.textContent = 'Sincronizar agora';
                    if (syncValue) syncValue.textContent = 'Sincronizado';
                    const syncTimeEl = syncItem?.parentElement?.querySelector('.pwa-menu-item:nth-child(2) .pwa-menu-value');
                    if (syncTimeEl) syncTimeEl.textContent = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                    showToast('Sincronizado com sucesso');
                } catch (e) {
                    showSyncIndicator(false);
                    if (syncLabel) syncLabel.textContent = 'Sincronizar agora';
                    if (syncValue) syncValue.textContent = 'Erro';
                    showToast('Erro: ' + e.message, 'error');
                }
            }
        });

        document.getElementById('pwaMenuSair')?.addEventListener('click', async () => {
            if (confirm('Deseja realmente sair?')) {
                // Tentar enviar pendentes (pesquisas, fotos, etc.) antes de sair
                if (typeof syncService !== 'undefined' && navigator.onLine) {
                    try {
                        showToast('Enviando dados pendentes...');
                        await syncService.enviarPendentes();
                    } catch (e) {
                        console.warn('[PWA] Erro ao enviar pendentes no logout:', e);
                    }
                }
                if (typeof authManager !== 'undefined') authManager.logout();
                window.location.reload();
            }
        });

        loadPendingCountMais();
    }

    async function loadPendingCountMais() {
        const el = document.getElementById('pwaMenuPendentesCount');
        const listaEl = document.getElementById('pwaListaPendentes');
        if (!el) return;
        try {
            if (typeof offlineDB !== 'undefined' && offlineDB.contarPendentes) {
                const pendentes = await offlineDB.contarPendentes();
                const total = pendentes.total || 0;
                el.textContent = total > 0 ? `${total} itens` : 'Nenhum';

                // Mostrar lista detalhada de pendentes
                if (listaEl && total > 0) {
                    const itens = [];
                    if (pendentes.sessoes > 0) itens.push({ icon: '&#128247;', label: 'Sessões de visita', count: pendentes.sessoes });
                    if (pendentes.registros > 0) itens.push({ icon: '&#128221;', label: 'Registros', count: pendentes.registros });
                    if (pendentes.fotos > 0) itens.push({ icon: '&#128248;', label: 'Fotos', count: pendentes.fotos });
                    if (pendentes.rotas > 0) itens.push({ icon: '&#128205;', label: 'Rotas', count: pendentes.rotas });
                    if (pendentes.pesquisas > 0) itens.push({ icon: '&#128203;', label: 'Pesquisas', count: pendentes.pesquisas });
                    if (pendentes.espacos > 0) itens.push({ icon: '&#127981;', label: 'Espaços', count: pendentes.espacos });
                    if (pendentes.checkinLocal > 0) itens.push({ icon: '&#9989;', label: 'Check-in local', count: pendentes.checkinLocal });
                    if (pendentes.checkoutsPendentes > 0) itens.push({ icon: '&#128682;', label: 'Checkouts', count: pendentes.checkoutsPendentes });
                    if (pendentes.despesasPendentes > 0) itens.push({ icon: '&#128176;', label: 'Despesas de viagem', count: pendentes.despesasPendentes });
                    if (pendentes.documentosPendentes > 0) itens.push({ icon: '&#128196;', label: 'Documentos', count: pendentes.documentosPendentes });
                    if (pendentes.deadLetters > 0) itens.push({ icon: '&#9888;', label: 'Itens com erro (retry)', count: pendentes.deadLetters });

                    listaEl.innerHTML = `
                        <div class="pwa-section-title">Detalhes pendentes</div>
                        <div class="pwa-menu-group">
                            ${itens.map(item => `
                                <div class="pwa-menu-item" style="cursor:default;">
                                    <span class="pwa-menu-icon">${item.icon}</span>
                                    <span class="pwa-menu-label">${escapeHtml(item.label)}</span>
                                    <span class="pwa-menu-value" style="color:#f59e0b; font-weight:600;">${item.count}</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                } else if (listaEl) {
                    listaEl.innerHTML = '';
                }
            } else {
                el.textContent = '0';
                if (listaEl) listaEl.innerHTML = '';
            }
        } catch (e) {
            el.textContent = 'Erro';
        }
    }

})();
