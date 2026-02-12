import { Router } from 'express';
import { tursoService } from '../services/turso.js';
import { googleDriveService } from '../services/googleDrive.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ==================== LIMPEZA DE DADOS ====================

/**
 * POST /api/admin/limpar-dados
 * Limpa registros operacionais mantendo cadastros e configurações.
 * Requer: { confirmar: true }
 */
router.post('/limpar-dados', requireAuth, requireAdmin, async (req, res) => {
  const { confirmar } = req.body;

  if (!confirmar) {
    // Modo preview: retorna contagem de registros que serão removidos
    try {
      const tabelasLimpar = [
        'cc_registro_visita',
        'cc_visita_sessao',
        'cc_documentos',
        'cc_despesa_valores',
        'cc_drive_pendencia',
        'cc_registro_espacos',
        'cc_clientes_coordenadas',
        'cc_pesquisa_respostas',
        'cc_nao_atendimento',
        'cc_sync_log',
        'cc_forca_sync',
        'cc_performance_historico',
        'cc_custos_repositor_mensal',
      ];

      const preview = [];
      for (const tabela of tabelasLimpar) {
        try {
          const result = await tursoService.execute(`SELECT COUNT(*) as total FROM ${tabela}`);
          preview.push({ tabela, registros: result.rows[0]?.total || 0 });
        } catch {
          preview.push({ tabela, registros: 0, nota: 'tabela não existe' });
        }
      }

      const totalRegistros = preview.reduce((sum, p) => sum + (p.registros || 0), 0);

      return res.json({
        ok: true,
        modo: 'preview',
        message: `${totalRegistros} registros serão removidos. Envie { "confirmar": true } para executar.`,
        tabelas: preview
      });
    } catch (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }
  }

  // Modo execução: deletar dados
  try {
    console.log(`[ADMIN] Limpeza de dados iniciada por ${req.user.username || req.user.nome_completo}`);

    const tabelasLimpar = [
      // Ordem importa: deletar dependentes primeiro
      'cc_despesa_valores',
      'cc_drive_pendencia',
      'cc_registro_visita',
      'cc_visita_sessao',
      'cc_documentos',
      'cc_registro_espacos',
      'cc_clientes_coordenadas',
      'cc_pesquisa_respostas',
      'cc_nao_atendimento',
      'cc_sync_log',
      'cc_forca_sync',
      'cc_performance_historico',
      'cc_custos_repositor_mensal',
    ];

    const resultados = [];

    for (const tabela of tabelasLimpar) {
      try {
        const countResult = await tursoService.execute(`SELECT COUNT(*) as total FROM ${tabela}`);
        const total = countResult.rows[0]?.total || 0;

        if (total > 0) {
          await tursoService.execute(`DELETE FROM ${tabela}`);
          console.log(`[ADMIN] ${tabela}: ${total} registros removidos`);
        }

        resultados.push({ tabela, registros_removidos: total, status: 'ok' });
      } catch (error) {
        console.warn(`[ADMIN] Erro ao limpar ${tabela}: ${error.message}`);
        resultados.push({ tabela, status: 'erro', mensagem: error.message });
      }
    }

    const totalRemovido = resultados.reduce((sum, r) => sum + (r.registros_removidos || 0), 0);

    console.log(`[ADMIN] Limpeza concluída: ${totalRemovido} registros removidos de ${resultados.filter(r => r.status === 'ok').length} tabelas`);

    res.json({
      ok: true,
      message: `Limpeza concluída: ${totalRemovido} registros removidos`,
      resultados
    });
  } catch (error) {
    console.error('[ADMIN] Erro na limpeza:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

// ==================== ESTRUTURA DE PASTAS DRIVE ====================

/**
 * POST /api/admin/criar-pastas-drive
 * Cria estrutura de pastas no Google Drive para todos os repositores ativos.
 * Estrutura: REP_{ID}_{NOME}/ -> checkin/, checkout/, CAMPANHA/, despesas/, espaco/, documentos/
 */
router.post('/criar-pastas-drive', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Buscar todos os repositores ativos
    const result = await tursoService.execute(
      'SELECT repo_cod, repo_nome FROM cad_repositor WHERE repo_data_fim IS NULL ORDER BY repo_nome'
    );

    const repositores = result.rows;

    if (!repositores || repositores.length === 0) {
      return res.json({
        ok: true,
        message: 'Nenhum repositor ativo encontrado',
        resultados: []
      });
    }

    console.log(`[ADMIN] Criando pastas Drive para ${repositores.length} repositores`);

    const subpastas = ['checkin', 'checkout', 'CAMPANHA', 'despesas', 'espaco', 'documentos'];
    const resultados = [];

    for (const repo of repositores) {
      const repId = repo.repo_cod;
      const repoNome = repo.repo_nome;

      try {
        // Criar pasta raiz do repositor
        const rootFolderId = await googleDriveService.criarPastaRepositor(repId, repoNome);

        // Criar subpastas padrão
        const pastasCreated = {};
        for (const sub of subpastas) {
          const subFolderId = await googleDriveService.createFolderIfNotExists(rootFolderId, sub);
          pastasCreated[sub] = subFolderId;
        }

        // Buscar tipos de documento para criar subpastas dentro de "documentos"
        try {
          const tiposDoc = await tursoService.execute(
            "SELECT dct_id, dct_nome FROM cc_documento_tipos WHERE dct_ativo = 1 ORDER BY dct_ordem"
          );

          if (tiposDoc.rows?.length > 0) {
            const docsFolderId = pastasCreated['documentos'];
            for (const tipo of tiposDoc.rows) {
              const tipoSlug = googleDriveService.slugify(tipo.dct_nome);
              const tipoFolderId = await googleDriveService.createFolderIfNotExists(docsFolderId, tipoSlug);

              // Salvar mapeamento no banco
              await tursoService.execute(
                `INSERT OR REPLACE INTO cc_repositor_drive_pastas (rpf_repositor_id, rpf_dct_id, rpf_drive_folder_id)
                 VALUES (?, ?, ?)`,
                [repId, tipo.dct_id, tipoFolderId]
              );
            }
          }
        } catch (docError) {
          console.warn(`[ADMIN] Erro ao criar subpastas de documentos para REP ${repId}: ${docError.message}`);
        }

        // Salvar mapeamento raiz no banco
        await tursoService.execute(
          `INSERT OR REPLACE INTO cc_repositor_drive (rpd_repositor_id, rpd_drive_root_folder_id, rpd_drive_documentos_folder_id)
           VALUES (?, ?, ?)`,
          [repId, rootFolderId, pastasCreated['documentos']]
        );

        // Buscar tipos de gasto para criar subpastas dentro de "despesas"
        try {
          const tiposGasto = await tursoService.execute(
            "SELECT gst_id, gst_nome FROM cc_gasto_tipos WHERE gst_ativo = 1 ORDER BY gst_ordem"
          );

          if (tiposGasto.rows?.length > 0) {
            const despesasFolderId = pastasCreated['despesas'];
            for (const gasto of tiposGasto.rows) {
              const gastoSlug = googleDriveService.slugify(gasto.gst_nome);
              await googleDriveService.createFolderIfNotExists(despesasFolderId, gastoSlug);
            }
          }
        } catch (gastoError) {
          console.warn(`[ADMIN] Erro ao criar subpastas de despesas para REP ${repId}: ${gastoError.message}`);
        }

        const driveLink = `https://drive.google.com/drive/folders/${rootFolderId}`;

        resultados.push({
          repo_cod: repId,
          repo_nome: repoNome,
          root_folder_id: rootFolderId,
          drive_link: driveLink,
          subpastas: Object.keys(pastasCreated),
          status: 'ok'
        });

        console.log(`[ADMIN] REP ${repId} (${repoNome}): pastas criadas - ${driveLink}`);
      } catch (error) {
        console.error(`[ADMIN] Erro ao criar pastas para REP ${repId}: ${error.message}`);
        resultados.push({
          repo_cod: repId,
          repo_nome: repoNome,
          status: 'erro',
          mensagem: error.message
        });
      }
    }

    const sucesso = resultados.filter(r => r.status === 'ok').length;
    const erros = resultados.filter(r => r.status === 'erro').length;

    res.json({
      ok: true,
      message: `Pastas criadas para ${sucesso} repositores${erros > 0 ? `, ${erros} com erro` : ''}`,
      resultados
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao criar pastas Drive:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * POST /api/admin/recriar-pasta-drive
 * Recria pastas Drive para um repositor específico (retry individual).
 * Requer: { repo_cod: number }
 */
router.post('/recriar-pasta-drive', requireAuth, requireAdmin, async (req, res) => {
  const { repo_cod } = req.body;

  if (!repo_cod) {
    return res.status(400).json({ ok: false, message: 'repo_cod é obrigatório' });
  }

  try {
    const result = await tursoService.execute(
      'SELECT repo_cod, repo_nome FROM cad_repositor WHERE repo_cod = ?',
      [repo_cod]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: `Repositor ${repo_cod} não encontrado` });
    }

    const repo = result.rows[0];
    const repId = repo.repo_cod;
    const repoNome = repo.repo_nome;

    const subpastas = ['checkin', 'checkout', 'CAMPANHA', 'despesas', 'espaco', 'documentos'];

    // Criar pasta raiz do repositor
    const rootFolderId = await googleDriveService.criarPastaRepositor(repId, repoNome);

    // Criar subpastas padrão
    const pastasCreated = {};
    for (const sub of subpastas) {
      const subFolderId = await googleDriveService.createFolderIfNotExists(rootFolderId, sub);
      pastasCreated[sub] = subFolderId;
    }

    // Criar subpastas de documentos
    try {
      const tiposDoc = await tursoService.execute(
        "SELECT dct_id, dct_nome FROM cc_documento_tipos WHERE dct_ativo = 1 ORDER BY dct_ordem"
      );

      if (tiposDoc.rows?.length > 0) {
        const docsFolderId = pastasCreated['documentos'];
        for (const tipo of tiposDoc.rows) {
          const tipoSlug = googleDriveService.slugify(tipo.dct_nome);
          const tipoFolderId = await googleDriveService.createFolderIfNotExists(docsFolderId, tipoSlug);

          await tursoService.execute(
            `INSERT OR REPLACE INTO cc_repositor_drive_pastas (rpf_repositor_id, rpf_dct_id, rpf_drive_folder_id)
             VALUES (?, ?, ?)`,
            [repId, tipo.dct_id, tipoFolderId]
          );
        }
      }
    } catch (docError) {
      console.warn(`[ADMIN] Erro ao criar subpastas de documentos para REP ${repId}: ${docError.message}`);
    }

    // Salvar mapeamento raiz no banco
    await tursoService.execute(
      `INSERT OR REPLACE INTO cc_repositor_drive (rpd_repositor_id, rpd_drive_root_folder_id, rpd_drive_documentos_folder_id)
       VALUES (?, ?, ?)`,
      [repId, rootFolderId, pastasCreated['documentos']]
    );

    // Criar subpastas de despesas
    try {
      const tiposGasto = await tursoService.execute(
        "SELECT gst_id, gst_nome FROM cc_gasto_tipos WHERE gst_ativo = 1 ORDER BY gst_ordem"
      );

      if (tiposGasto.rows?.length > 0) {
        const despesasFolderId = pastasCreated['despesas'];
        for (const gasto of tiposGasto.rows) {
          const gastoSlug = googleDriveService.slugify(gasto.gst_nome);
          await googleDriveService.createFolderIfNotExists(despesasFolderId, gastoSlug);
        }
      }
    } catch (gastoError) {
      console.warn(`[ADMIN] Erro ao criar subpastas de despesas para REP ${repId}: ${gastoError.message}`);
    }

    const driveLink = `https://drive.google.com/drive/folders/${rootFolderId}`;

    console.log(`[ADMIN] REP ${repId} (${repoNome}): pastas recriadas - ${driveLink}`);

    res.json({
      ok: true,
      message: `Pastas recriadas para ${repoNome}`,
      resultado: {
        repo_cod: repId,
        repo_nome: repoNome,
        root_folder_id: rootFolderId,
        drive_link: driveLink,
        subpastas: Object.keys(pastasCreated),
        status: 'ok'
      }
    });
  } catch (error) {
    console.error(`[ADMIN] Erro ao recriar pastas para REP ${repo_cod}: ${error.message}`);
    res.status(500).json({
      ok: false,
      message: `Erro ao recriar pastas: ${error.message}`,
      erro_detalhes: {
        code: error.code || 'UNKNOWN',
        stage: error.stage || 'DRIVE_FOLDER'
      }
    });
  }
});

// ==================== STATUS DE DADOS ====================

/**
 * GET /api/admin/status-dados
 * Retorna contagem de registros em todas as tabelas do sistema.
 */
router.get('/status-dados', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Pré-criar tabelas que são criadas dinamicamente (evita "tabela não existe")
    await tursoService.execute(`
      CREATE TABLE IF NOT EXISTS cc_nao_atendimento (
        na_id INTEGER PRIMARY KEY AUTOINCREMENT,
        na_repositor_id INTEGER NOT NULL,
        na_cliente_id TEXT NOT NULL,
        na_cliente_nome TEXT,
        na_data_visita TEXT NOT NULL,
        na_motivo TEXT NOT NULL,
        na_criado_em TEXT NOT NULL
      )
    `);
    await tursoService.execute(`
      CREATE TABLE IF NOT EXISTS cc_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rep_id INTEGER,
        usuario_id INTEGER,
        tipo TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        dispositivo TEXT,
        ip TEXT,
        criado_em TEXT DEFAULT (datetime('now'))
      )
    `);
    await tursoService.execute(`
      CREATE TABLE IF NOT EXISTS cc_forca_sync (
        rep_id INTEGER PRIMARY KEY,
        forcar_download INTEGER DEFAULT 0,
        forcar_upload INTEGER DEFAULT 0,
        mensagem TEXT,
        criado_em TEXT DEFAULT (datetime('now')),
        criado_por INTEGER
      )
    `);

    const tabelas = {
      cadastros: [
        'cad_repositor',
        'cc_usuarios',
        'users_web',
      ],
      roteiros: [
        'rot_roteiro_cidade',
        'rot_roteiro_cliente',
        'rot_roteiro_auditoria',
      ],
      configuracoes: [
        'cc_documento_tipos',
        'cc_tipos_espaco',
        'cc_clientes_espacos',
        'cc_gasto_tipos',
        'cc_atividades',
        'cc_config_sync',
        'cc_pwa_telas',
        'cc_web_telas',
        'cc_usuario_telas_web',
        'acl_usuario_tela',
        'cc_pesquisas',
        'cc_pesquisa_campos',
        'rat_cliente_repositor',
        'venda_centralizada',
      ],
      registros_operacionais: [
        'cc_registro_visita',
        'cc_visita_sessao',
        'cc_documentos',
        'cc_despesa_valores',
        'cc_registro_espacos',
        'cc_pesquisa_respostas',
        'cc_nao_atendimento',
        'cc_performance_historico',
        'cc_custos_repositor_mensal',
      ],
      drive: [
        'cc_repositor_drive',
        'cc_repositor_drive_pastas',
        'cc_drive_pendencia',
      ],
      outros: [
        'cc_clientes_coordenadas',
        'cc_sync_log',
        'cc_forca_sync',
      ],
    };

    const resultado = {};

    for (const [categoria, listaTabelas] of Object.entries(tabelas)) {
      resultado[categoria] = [];
      for (const tabela of listaTabelas) {
        try {
          const r = await tursoService.execute(`SELECT COUNT(*) as total FROM ${tabela}`);
          resultado[categoria].push({ tabela, registros: r.rows[0]?.total || 0 });
        } catch {
          resultado[categoria].push({ tabela, registros: 0, nota: 'tabela não existe' });
        }
      }
    }

    res.json({ ok: true, dados: resultado });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

// ==================== ESTRUTURA DRIVE ====================

/**
 * GET /api/admin/drive/estrutura
 * Retorna a estrutura de pastas do Drive para todos os repositores ativos.
 * Inclui pastas raiz e subpastas de primeiro nível.
 */
router.get('/drive/estrutura', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Buscar mapeamento de pastas do banco
    const mappings = await tursoService.execute(
      `SELECT rd.rpd_repositor_id, rd.rpd_drive_root_folder_id, r.repo_nome
       FROM cc_repositor_drive rd
       JOIN cad_repositor r ON r.repo_cod = rd.rpd_repositor_id
       WHERE r.repo_data_fim IS NULL
       ORDER BY r.repo_nome`
    );

    if (!mappings.rows?.length) {
      return res.json({ ok: true, repositores: [], message: 'Nenhuma pasta encontrada. Crie as pastas primeiro.' });
    }

    const repositores = [];

    for (const m of mappings.rows) {
      try {
        const subpastas = await googleDriveService.listarSubpastas(m.rpd_drive_root_folder_id);
        repositores.push({
          repo_cod: m.rpd_repositor_id,
          repo_nome: m.repo_nome,
          root_folder_id: m.rpd_drive_root_folder_id,
          drive_link: `https://drive.google.com/drive/folders/${m.rpd_drive_root_folder_id}`,
          subpastas: subpastas.map(s => ({ id: s.id, name: s.name }))
        });
      } catch (err) {
        repositores.push({
          repo_cod: m.rpd_repositor_id,
          repo_nome: m.repo_nome,
          root_folder_id: m.rpd_drive_root_folder_id,
          subpastas: [],
          erro: err.message
        });
      }
    }

    res.json({ ok: true, repositores });
  } catch (error) {
    console.error('[ADMIN] Erro ao carregar estrutura Drive:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * GET /api/admin/drive/pasta/:folderId/conteudo
 * Lista conteúdo de uma pasta (subpastas + arquivos).
 */
router.get('/drive/pasta/:folderId/conteudo', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { folderId } = req.params;

    const [subpastas, arquivos] = await Promise.all([
      googleDriveService.listarSubpastas(folderId),
      googleDriveService.listarArquivosComData(folderId)
    ]);

    res.json({
      ok: true,
      subpastas: subpastas.map(s => ({ id: s.id, name: s.name })),
      arquivos: arquivos.map(a => ({
        id: a.id,
        name: a.name,
        size: a.size,
        createdTime: a.createdTime,
        webViewLink: a.webViewLink
      }))
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao listar conteúdo de pasta:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * POST /api/admin/drive/download-backup
 * Gera ZIP com todos os arquivos até a data limite.
 * Body: { data_limite: 'YYYY-MM-DD' }
 */
router.post('/drive/download-backup', requireAuth, requireAdmin, async (req, res) => {
  const { data_limite } = req.body;

  if (!data_limite) {
    return res.status(400).json({ ok: false, message: 'data_limite é obrigatório (YYYY-MM-DD)' });
  }

  try {
    const { default: archiver } = await import('archiver');

    // Buscar todas as pastas raiz
    const mappings = await tursoService.execute(
      `SELECT rd.rpd_repositor_id, rd.rpd_drive_root_folder_id, r.repo_nome
       FROM cc_repositor_drive rd
       JOIN cad_repositor r ON r.repo_cod = rd.rpd_repositor_id
       WHERE r.repo_data_fim IS NULL
       ORDER BY r.repo_nome`
    );

    if (!mappings.rows?.length) {
      return res.status(404).json({ ok: false, message: 'Nenhuma pasta de repositor encontrada' });
    }

    // Configurar resposta como ZIP
    const nomeArquivo = `backup_drive_ate_${data_limite}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    archive.on('error', (err) => {
      console.error('[ADMIN] Erro no archiver:', err);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: err.message });
      }
    });

    let totalArquivos = 0;

    for (const m of mappings.rows) {
      const pastaBase = `REP_${m.rpd_repositor_id}_${googleDriveService.slugify(m.repo_nome)}`;

      try {
        const arquivos = await googleDriveService.listarArquivosRecursivo(
          m.rpd_drive_root_folder_id,
          data_limite
        );

        for (const arq of arquivos) {
          try {
            const stream = await googleDriveService.downloadArquivo(arq.id);
            archive.append(stream, { name: `${pastaBase}/${arq.path}` });
            totalArquivos++;
          } catch (dlErr) {
            console.warn(`[ADMIN] Não foi possível baixar ${arq.name}: ${dlErr.message}`);
          }
        }
      } catch (listErr) {
        console.warn(`[ADMIN] Erro ao listar arquivos REP ${m.rpd_repositor_id}: ${listErr.message}`);
      }
    }

    console.log(`[ADMIN] Backup ZIP gerado: ${totalArquivos} arquivos até ${data_limite}`);
    await archive.finalize();
  } catch (error) {
    console.error('[ADMIN] Erro ao gerar backup:', error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: error.message });
    }
  }
});

/**
 * POST /api/admin/drive/limpar-arquivos
 * Exclui arquivos criados até a data limite em todas as pastas.
 * Body: { data_limite: 'YYYY-MM-DD', confirmar: boolean }
 */
router.post('/drive/limpar-arquivos', requireAuth, requireAdmin, async (req, res) => {
  const { data_limite, confirmar } = req.body;

  if (!data_limite) {
    return res.status(400).json({ ok: false, message: 'data_limite é obrigatório (YYYY-MM-DD)' });
  }

  try {
    // Buscar todas as pastas raiz
    const mappings = await tursoService.execute(
      `SELECT rd.rpd_repositor_id, rd.rpd_drive_root_folder_id, r.repo_nome
       FROM cc_repositor_drive rd
       JOIN cad_repositor r ON r.repo_cod = rd.rpd_repositor_id
       WHERE r.repo_data_fim IS NULL
       ORDER BY r.repo_nome`
    );

    if (!mappings.rows?.length) {
      return res.status(404).json({ ok: false, message: 'Nenhuma pasta de repositor encontrada' });
    }

    // Coletar todos os arquivos
    const todosArquivos = [];

    for (const m of mappings.rows) {
      try {
        const arquivos = await googleDriveService.listarArquivosRecursivo(
          m.rpd_drive_root_folder_id,
          data_limite
        );
        for (const arq of arquivos) {
          todosArquivos.push({
            ...arq,
            repo_cod: m.rpd_repositor_id,
            repo_nome: m.repo_nome
          });
        }
      } catch (listErr) {
        console.warn(`[ADMIN] Erro ao listar REP ${m.rpd_repositor_id}: ${listErr.message}`);
      }
    }

    // Modo preview: só retorna contagem
    if (!confirmar) {
      const porRepositor = {};
      for (const arq of todosArquivos) {
        if (!porRepositor[arq.repo_cod]) {
          porRepositor[arq.repo_cod] = { repo_nome: arq.repo_nome, quantidade: 0 };
        }
        porRepositor[arq.repo_cod].quantidade++;
      }

      return res.json({
        ok: true,
        preview: true,
        total_arquivos: todosArquivos.length,
        data_limite,
        por_repositor: Object.entries(porRepositor).map(([cod, info]) => ({
          repo_cod: parseInt(cod),
          repo_nome: info.repo_nome,
          quantidade: info.quantidade
        }))
      });
    }

    // Modo execução: deletar arquivos
    let deletados = 0;
    let erros = 0;

    for (const arq of todosArquivos) {
      try {
        await googleDriveService.deletarArquivo(arq.id);
        deletados++;
      } catch (delErr) {
        console.warn(`[ADMIN] Erro ao deletar ${arq.name}: ${delErr.message}`);
        erros++;
      }
    }

    console.log(`[ADMIN] Limpeza Drive: ${deletados} deletados, ${erros} erros (até ${data_limite})`);

    res.json({
      ok: true,
      message: `${deletados} arquivo(s) excluído(s)${erros > 0 ? `, ${erros} com erro` : ''}`,
      deletados,
      erros,
      data_limite
    });
  } catch (error) {
    console.error('[ADMIN] Erro ao limpar arquivos:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

export default router;
