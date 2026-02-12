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
        'cc_repositor_drive',
        'cc_repositor_drive_pastas',
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
      'cc_repositor_drive_pastas',
      'cc_repositor_drive',
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

// ==================== STATUS DE DADOS ====================

/**
 * GET /api/admin/status-dados
 * Retorna contagem de registros em todas as tabelas do sistema.
 */
router.get('/status-dados', requireAuth, requireAdmin, async (req, res) => {
  try {
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

export default router;
