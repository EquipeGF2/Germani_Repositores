/**
 * Rotas de Sincronização para PWA Offline
 *
 * Download (GET): Dados filtrados por repositor
 * Upload (POST): Recebe dados do dispositivo
 * Registro: Monitora quando cada repositor sincronizou
 */

import express from 'express';
import { tursoService } from '../services/turso.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Todas as rotas de sync requerem autenticação
router.use(requireAuth);

// ==================== DOWNLOAD DE DADOS ====================

/**
 * GET /api/sync/roteiro - Roteiro do repositor
 * Retorna o roteiro da semana atual
 */
router.get('/roteiro', async (req, res) => {
  try {
    const repId = req.user.rep_id;

    if (!repId) {
      return res.status(400).json({
        ok: false,
        message: 'Usuário não vinculado a um repositor'
      });
    }

    // Buscar roteiro da semana atual
    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay()); // Domingo

    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6); // Sábado

    const roteiro = await tursoService.buscarRoteiroRepositor(
      repId,
      inicioSemana.toISOString().split('T')[0],
      fimSemana.toISOString().split('T')[0]
    );

    console.log(`[Sync] Roteiro para rep_id ${repId}: ${roteiro?.length || 0} itens`);

    return res.json({
      ok: true,
      roteiro: roteiro || [],
      periodo: {
        inicio: inicioSemana.toISOString().split('T')[0],
        fim: fimSemana.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar roteiro:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar roteiro'
    });
  }
});

/**
 * GET /api/sync/clientes - Clientes do repositor
 * Retorna todos os clientes vinculados ao roteiro
 */
router.get('/clientes', async (req, res) => {
  try {
    const repId = req.user.rep_id;

    if (!repId) {
      return res.status(400).json({
        ok: false,
        message: 'Usuário não vinculado a um repositor'
      });
    }

    const clientes = await tursoService.buscarClientesRepositor(repId);

    console.log(`[Sync] Clientes para rep_id ${repId}: ${clientes?.length || 0} itens`);

    return res.json({
      ok: true,
      clientes: clientes || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar clientes:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar clientes'
    });
  }
});

/**
 * GET /api/sync/coordenadas - Coordenadas dos clientes
 */
router.get('/coordenadas', async (req, res) => {
  try {
    const repId = req.user.rep_id;

    if (!repId) {
      return res.status(400).json({
        ok: false,
        message: 'Usuário não vinculado a um repositor'
      });
    }

    const coordenadas = await tursoService.buscarCoordenadasRepositor(repId);

    return res.json({
      ok: true,
      coordenadas: coordenadas || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar coordenadas:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar coordenadas'
    });
  }
});

/**
 * GET /api/sync/tipos-documento - Tipos de documento
 */
router.get('/tipos-documento', async (req, res) => {
  try {
    const tipos = await tursoService.listarTiposDocumento();

    return res.json({
      ok: true,
      tipos: tipos || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar tipos de documento:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar tipos de documento'
    });
  }
});

/**
 * GET /api/sync/tipos-gasto - Tipos de gasto (rubricas)
 */
router.get('/tipos-gasto', async (req, res) => {
  try {
    const tipos = await tursoService.listarTiposGasto();

    return res.json({
      ok: true,
      tipos: tipos || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar tipos de gasto:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar tipos de gasto'
    });
  }
});

// ==================== NOVOS DOWNLOADS SYNC PWA ====================

/**
 * GET /api/sync/campanhas - Campanhas dos últimos 15 dias
 */
router.get('/campanhas', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    if (!repId) return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });

    const dias = parseInt(req.query.dias) || 15;
    const campanhas = await tursoService.buscarCampanhasRepositor(repId, dias);

    return res.json({ ok: true, campanhas: campanhas || [] });
  } catch (error) {
    console.error('[Sync] Erro ao buscar campanhas:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar campanhas' });
  }
});

/**
 * GET /api/sync/documentos-cache - Documentos dos últimos 15 dias
 */
router.get('/documentos-cache', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    if (!repId) return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });

    const dias = parseInt(req.query.dias) || 15;
    const documentos = await tursoService.buscarDocumentosRepositor(repId, dias);

    return res.json({ ok: true, documentos: documentos || [] });
  } catch (error) {
    console.error('[Sync] Erro ao buscar documentos:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar documentos' });
  }
});

/**
 * GET /api/sync/despesas - Despesas do mês corrente
 */
router.get('/despesas', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    if (!repId) return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });

    const dias = parseInt(req.query.dias) || 0;
    const despesas = await tursoService.buscarDespesasRepositor(repId, dias);

    return res.json({ ok: true, despesas: despesas || [] });
  } catch (error) {
    console.error('[Sync] Erro ao buscar despesas:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar despesas' });
  }
});

/**
 * GET /api/sync/roteiros-consulta - Todos os roteiros vigentes
 */
router.get('/roteiros-consulta', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    if (!repId) return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });

    const roteiros = await tursoService.buscarRoteirosConsultaRepositor(repId);

    return res.json({ ok: true, roteiros: roteiros || [] });
  } catch (error) {
    console.error('[Sync] Erro ao buscar roteiros consulta:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar roteiros' });
  }
});

/**
 * GET /api/sync/pesquisas-clientes - Pesquisas ativas por cliente
 */
router.get('/pesquisas-clientes', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    if (!repId) return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });

    const resultado = await tursoService.buscarPesquisasClientesRepositor(repId);

    return res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error('[Sync] Erro ao buscar pesquisas clientes:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar pesquisas' });
  }
});

/**
 * GET /api/sync/espacos-clientes - Clientes com espaços cadastrados
 */
router.get('/espacos-clientes', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    if (!repId) return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });

    const resultado = await tursoService.buscarEspacosClientesRepositor(repId);

    return res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error('[Sync] Erro ao buscar espaços clientes:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar espaços' });
  }
});

/**
 * GET /api/sync/visitas-nao-realizadas - Visitas não realizadas nos últimos 2 dias
 */
router.get('/visitas-nao-realizadas', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    if (!repId) return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });

    const dias = parseInt(req.query.dias) || 2;
    const naoRealizadas = await tursoService.buscarVisitasNaoRealizadas(repId, dias);

    return res.json({ ok: true, naoRealizadas: naoRealizadas || [] });
  } catch (error) {
    console.error('[Sync] Erro ao buscar visitas não realizadas:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar visitas não realizadas' });
  }
});

/**
 * GET /api/sync/sessoes-recentes - Sessões de visita dos últimos 15 dias
 * Retorna sessões com dados de checkin/checkout para consulta offline
 */
router.get('/sessoes-recentes', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    if (!repId) return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });

    const dias = parseInt(req.query.dias) || 15;
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - dias);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];
    const dataFimStr = new Date().toISOString().split('T')[0];

    const checkinDataExpr = `(
      SELECT COALESCE(rv_data_hora_registro, data_hora)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC
      LIMIT 1
    )`;
    const checkoutDataExpr = `(
      SELECT COALESCE(rv_data_hora_registro, data_hora)
      FROM cc_registro_visita rv
      WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkout'
      ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) DESC
      LIMIT 1
    )`;
    const statusExpr = `CASE
      WHEN ${checkoutDataExpr} IS NOT NULL OR s.checkout_at IS NOT NULL THEN 'finalizado'
      WHEN ${checkinDataExpr} IS NOT NULL OR s.checkin_at IS NOT NULL THEN 'em_atendimento'
      ELSE 'sem_checkin'
    END`;

    const sql = `
      SELECT
        s.sessao_id,
        s.rep_id,
        s.cliente_id,
        COALESCE(NULLIF(s.cliente_nome, ''), (
          SELECT rv_cliente_nome FROM cc_registro_visita rv
          WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id
          ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC LIMIT 1
        ), 'N/D') AS cliente_nome,
        s.data_planejada,
        ${checkinDataExpr} AS checkin_data_hora,
        ${checkoutDataExpr} AS checkout_data_hora,
        ${statusExpr} AS status,
        COALESCE(s.dia_previsto, (
          SELECT rv_dia_previsto FROM cc_registro_visita rv
          WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
          ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC LIMIT 1
        )) AS dia_previsto,
        COALESCE(NULLIF(s.endereco_cliente, ''), (
          SELECT rv_endereco_cliente FROM cc_registro_visita rv
          WHERE COALESCE(rv.rv_sessao_id, rv.sessao_id) = s.sessao_id AND rv.rv_tipo = 'checkin'
          ORDER BY COALESCE(rv.rv_data_hora_registro, rv.data_hora) ASC LIMIT 1
        )) AS endereco_cliente
      FROM cc_visita_sessao s
      WHERE s.rep_id = ?
        AND date(COALESCE(${checkinDataExpr}, s.checkin_at, s.data_planejada, s.criado_em)) >= date(?)
        AND date(COALESCE(${checkinDataExpr}, s.checkin_at, s.data_planejada, s.criado_em)) <= date(?)
      ORDER BY ${checkinDataExpr} DESC, COALESCE(s.checkin_at, s.criado_em) DESC
    `;

    const result = await tursoService.execute(sql, [repId, dataInicioStr, dataFimStr]);
    const sessoes = (result.rows || []).map(s => ({
      sessao_id: s.sessao_id,
      rep_id: s.rep_id,
      cliente_id: s.cliente_id,
      cliente_nome: s.cliente_nome,
      data_planejada: s.data_planejada,
      checkin_data_hora: s.checkin_data_hora,
      checkout_data_hora: s.checkout_data_hora,
      status: s.status,
      dia_previsto: s.dia_previsto,
      endereco_cliente: s.endereco_cliente
    }));

    console.log(`[Sync] Sessões recentes para rep_id ${repId}: ${sessoes.length} itens`);
    return res.json({ ok: true, sessoes });
  } catch (error) {
    console.error('[Sync] Erro ao buscar sessões recentes:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar sessões recentes' });
  }
});

// ==================== UPLOAD DE DADOS ====================

/**
 * POST /api/sync/sessao - Receber sessão de visita
 * Recebe check-in e checkout com timestamps originais do dispositivo
 */
router.post('/sessao', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const sessao = req.body;

    if (!repId) {
      return res.status(400).json({
        ok: false,
        message: 'Usuário não vinculado a um repositor'
      });
    }

    if (!sessao.cliente_id) {
      return res.status(400).json({
        ok: false,
        message: 'cliente_id é obrigatório'
      });
    }

    console.log(`[Sync] Recebendo sessão de rep_id ${repId}:`, {
      cliente: sessao.cliente_id,
      checkin: sessao.checkin_at,
      checkout: sessao.checkout_at
    });

    // Validar que o repositor está enviando seus próprios dados
    if (sessao.rep_id && Number(sessao.rep_id) !== Number(repId)) {
      return res.status(403).json({
        ok: false,
        message: 'Não autorizado a enviar dados de outro repositor'
      });
    }

    // Usar timestamps do dispositivo (não do servidor)
    const resultado = await tursoService.criarOuAtualizarSessaoVisita({
      rep_id: repId,
      cliente_id: sessao.cliente_id,
      cliente_nome: sessao.cliente_nome || null,
      endereco_cliente: sessao.endereco_cliente || null,
      endereco_checkin: sessao.endereco_checkin || null,
      endereco_checkout: sessao.endereco_checkout || null,
      checkin_at: sessao.checkin_at,
      checkout_at: sessao.checkout_at,
      data_planejada: sessao.data_planejada,
      observacoes: sessao.observacoes,
      origem: 'pwa_offline',
      localId: sessao.localId
    });

    return res.json({
      ok: true,
      sessao_id: resultado.sessao_id,
      localId: sessao.localId
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar sessão:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || 'Erro ao salvar sessão'
    });
  }
});

/**
 * POST /api/sync/registro - Receber registro de visita
 */
router.post('/registro', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const registro = req.body;

    if (!repId) {
      return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });
    }

    if (!registro.cliente_id) {
      return res.status(400).json({ ok: false, message: 'cliente_id é obrigatório' });
    }

    if (!registro.tipo) {
      return res.status(400).json({ ok: false, message: 'tipo é obrigatório' });
    }

    const resultado = await tursoService.criarRegistroVisita({
      rep_id: repId,
      cliente_id: registro.cliente_id,
      sessao_id: registro.sessao_id,
      tipo: registro.tipo,
      descricao: registro.descricao,
      data_hora: registro.data_hora || new Date().toISOString(),
      latitude: registro.latitude,
      longitude: registro.longitude,
      origem: 'pwa_offline'
    });

    return res.json({
      ok: true,
      registro_id: resultado.registro_id,
      localId: registro.localId
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar registro:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || 'Erro ao salvar registro'
    });
  }
});

/**
 * POST /api/sync/foto - Receber foto
 */
router.post('/foto', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const foto = req.body;

    if (!repId) {
      return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });
    }

    if (!foto.cliente_id) {
      return res.status(400).json({ ok: false, message: 'cliente_id é obrigatório' });
    }

    if (!foto.base64) {
      return res.status(400).json({ ok: false, message: 'base64 da foto é obrigatório' });
    }

    const resultado = await tursoService.salvarFoto({
      rep_id: repId,
      sessao_id: foto.sessao_id,
      cliente_id: foto.cliente_id,
      tipo: foto.tipo,
      base64: foto.base64,
      data_hora: foto.data_hora || new Date().toISOString(),
      latitude: foto.latitude,
      longitude: foto.longitude,
      origem: 'pwa_offline'
    });

    return res.json({
      ok: true,
      foto_id: resultado.foto_id,
      localId: foto.localId
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar foto:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || 'Erro ao salvar foto'
    });
  }
});

/**
 * POST /api/sync/rotas - Receber registros de rota em lote
 */
router.post('/rotas', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const { rotas } = req.body;

    if (!repId) {
      return res.status(400).json({ ok: false, message: 'Usuário não vinculado a um repositor' });
    }

    if (!Array.isArray(rotas) || rotas.length === 0) {
      return res.status(400).json({ ok: false, message: 'Array de rotas é obrigatório e não pode ser vazio' });
    }

    let salvos = 0;
    for (const rota of rotas) {
      if (!rota.latitude || !rota.longitude) {
        console.warn('[Sync] Rota sem coordenadas, ignorando:', rota);
        continue;
      }
      await tursoService.salvarRegistroRota({
        rep_id: repId,
        latitude: rota.latitude,
        longitude: rota.longitude,
        data_hora: rota.data_hora || new Date().toISOString(),
        precisao: rota.precisao,
        origem: 'pwa_offline'
      });
      salvos++;
    }

    return res.json({
      ok: true,
      salvos
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar rotas:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || 'Erro ao salvar rotas'
    });
  }
});

// ==================== REGISTRO DE SINCRONIZAÇÃO ====================

/**
 * POST /api/sync/registrar - Registrar evento de sincronização
 */
router.post('/registrar', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const usuarioId = req.user.usuario_id;
    const { tipo, timestamp, dispositivo } = req.body;

    await tursoService.registrarSync({
      rep_id: repId,
      usuario_id: usuarioId,
      tipo, // 'download' ou 'upload'
      timestamp,
      dispositivo,
      ip: req.ip
    });

    return res.json({ ok: true });

  } catch (error) {
    console.error('[Sync] Erro ao registrar sync:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao registrar sincronização'
    });
  }
});

/**
 * GET /api/sync/status - Status de sincronização dos repositores (admin)
 */
router.get('/status', async (req, res) => {
  try {
    // Apenas admin pode ver status de todos
    if (req.user.perfil !== 'admin') {
      // Repositor vê apenas seu próprio status
      const status = await tursoService.buscarStatusSync(req.user.rep_id);
      return res.json({
        ok: true,
        repositores: [status]
      });
    }

    // Admin vê todos
    const status = await tursoService.buscarStatusSyncTodos();

    return res.json({
      ok: true,
      repositores: status || []
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar status:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar status'
    });
  }
});

// ==================== CONFIGURAÇÕES DE SYNC ====================

/**
 * GET /api/sync/config - Obter configurações de sync
 */
router.get('/config', async (req, res) => {
  try {
    const config = await tursoService.getConfigSync();

    return res.json({
      ok: true,
      config: config || {
        horariosDownload: ['06:00', '12:00'],
        enviarNoCheckout: true
      }
    });

  } catch (error) {
    console.error('[Sync] Erro ao buscar config:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao buscar configurações'
    });
  }
});

/**
 * PUT /api/sync/config - Atualizar configurações de sync (admin)
 */
router.put('/config', async (req, res) => {
  try {
    if (req.user.perfil !== 'admin') {
      return res.status(403).json({
        ok: false,
        message: 'Apenas administradores podem alterar configurações'
      });
    }

    const { horariosDownload, enviarNoCheckout, tempoMaximoCheckout, tempoMinimoEntreVisitas } = req.body;

    await tursoService.salvarConfigSync({
      horariosDownload,
      enviarNoCheckout,
      tempoMaximoCheckout: tempoMaximoCheckout || 30,
      tempoMinimoEntreVisitas: tempoMinimoEntreVisitas || 5
    });

    return res.json({
      ok: true,
      message: 'Configurações salvas'
    });

  } catch (error) {
    console.error('[Sync] Erro ao salvar config:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao salvar configurações'
    });
  }
});

// ==================== VALIDAÇÃO DE TEMPO ====================

/**
 * POST /api/sync/validar-tempo - Validar tempo entre operações
 */
router.post('/validar-tempo', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const { tipoOperacao, timestamp } = req.body;

    if (!tipoOperacao) {
      return res.status(400).json({
        ok: false,
        message: 'Tipo de operação é obrigatório'
      });
    }

    const resultado = await tursoService.validarTempoOperacao(
      repId,
      tipoOperacao,
      timestamp || new Date().toISOString()
    );

    return res.json({
      ok: resultado.valido,
      ...resultado
    });

  } catch (error) {
    console.error('[Sync] Erro ao validar tempo:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao validar tempo'
    });
  }
});

// ==================== FORÇAR SINCRONIZAÇÃO ====================

/**
 * GET /api/sync/verificar-forca - Verificar se precisa forçar sync
 */
router.get('/verificar-forca', async (req, res) => {
  try {
    const repId = req.user.rep_id;

    if (!repId) {
      return res.json({
        ok: true,
        forcarDownload: false,
        forcarUpload: false
      });
    }

    const resultado = await tursoService.verificarForcaSync(repId);

    return res.json({
      ok: true,
      ...resultado
    });

  } catch (error) {
    console.error('[Sync] Erro ao verificar força sync:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao verificar'
    });
  }
});

/**
 * POST /api/sync/forcar - Forçar sync de repositor(es) (admin)
 */
router.post('/forcar', async (req, res) => {
  try {
    if (req.user.perfil !== 'admin') {
      return res.status(403).json({
        ok: false,
        message: 'Apenas administradores podem forçar sincronização'
      });
    }

    const { repId, tipo, mensagem, todos } = req.body;

    if (!tipo || !['download', 'upload', 'ambos'].includes(tipo)) {
      return res.status(400).json({
        ok: false,
        message: 'Tipo deve ser: download, upload ou ambos'
      });
    }

    let resultado;

    if (todos) {
      // Forçar para todos os repositores
      resultado = await tursoService.forcarSyncTodos(tipo, mensagem, req.user.usuario_id);
      console.log(`[Sync] Admin ${req.user.username} forçou sync ${tipo} para TODOS (${resultado.total})`);
    } else if (repId) {
      // Forçar para repositor específico
      resultado = await tursoService.forcarSyncRepositor(repId, tipo, mensagem, req.user.usuario_id);
      console.log(`[Sync] Admin ${req.user.username} forçou sync ${tipo} para rep_id ${repId}`);
    } else {
      return res.status(400).json({
        ok: false,
        message: 'Informe repId ou todos=true'
      });
    }

    return res.json({
      ok: true,
      message: todos ? `Sincronização forçada para ${resultado.total} repositores` : 'Sincronização forçada com sucesso'
    });

  } catch (error) {
    console.error('[Sync] Erro ao forçar sync:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro ao forçar sincronização'
    });
  }
});

/**
 * POST /api/sync/limpar-forca - Limpar flag de força sync após sync
 */
router.post('/limpar-forca', async (req, res) => {
  try {
    const repId = req.user.rep_id;
    const { tipo } = req.body;

    if (repId && tipo) {
      await tursoService.limparForcaSync(repId, tipo);
    }

    return res.json({ ok: true });

  } catch (error) {
    console.error('[Sync] Erro ao limpar força sync:', error);
    return res.status(500).json({ ok: false });
  }
});

export default router;
