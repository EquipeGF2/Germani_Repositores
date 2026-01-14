import express from 'express';
import { tursoService } from '../services/turso.js';

const router = express.Router();

// GET /api/pwa/telas - Listar todas as telas com status de liberação
router.get('/telas', async (req, res) => {
  try {
    const telas = await tursoService.listarTelasPwa();
    return res.json({
      ok: true,
      telas
    });
  } catch (error) {
    console.error('Erro ao listar telas PWA:', error);
    return res.status(500).json({
      ok: false,
      code: 'LIST_PWA_SCREENS_ERROR',
      message: 'Erro ao listar telas do PWA'
    });
  }
});

// GET /api/pwa/telas/liberadas - Listar apenas telas liberadas para o PWA
router.get('/telas/liberadas', async (req, res) => {
  try {
    const telas = await tursoService.listarTelasLiberadasPwa();
    return res.json({
      ok: true,
      telas
    });
  } catch (error) {
    console.error('Erro ao listar telas liberadas PWA:', error);
    return res.status(500).json({
      ok: false,
      code: 'LIST_PWA_ALLOWED_SCREENS_ERROR',
      message: 'Erro ao listar telas liberadas do PWA'
    });
  }
});

// PUT /api/pwa/telas/:telaId - Atualizar status de liberação de uma tela
router.put('/telas/:telaId', async (req, res) => {
  try {
    const { telaId } = req.params;
    const { liberado } = req.body;

    if (typeof liberado !== 'boolean') {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_DATA',
        message: 'O campo "liberado" deve ser true ou false'
      });
    }

    await tursoService.atualizarLiberacaoTelaPwa(telaId, liberado);

    return res.json({
      ok: true,
      message: `Tela ${liberado ? 'liberada' : 'bloqueada'} com sucesso`
    });
  } catch (error) {
    console.error('Erro ao atualizar liberação de tela PWA:', error);
    return res.status(500).json({
      ok: false,
      code: 'UPDATE_PWA_SCREEN_ERROR',
      message: 'Erro ao atualizar liberação da tela'
    });
  }
});

// PUT /api/pwa/telas - Atualizar múltiplas telas de uma vez
router.put('/telas', async (req, res) => {
  try {
    const { telas } = req.body;

    if (!Array.isArray(telas)) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_DATA',
        message: 'O campo "telas" deve ser um array'
      });
    }

    // Validar estrutura de cada tela
    for (const tela of telas) {
      if (!tela.telaId || typeof tela.liberado !== 'boolean') {
        return res.status(400).json({
          ok: false,
          code: 'INVALID_DATA',
          message: 'Cada tela deve ter telaId (string) e liberado (boolean)'
        });
      }
    }

    await tursoService.atualizarLiberacoesTelasPwa(telas);

    return res.json({
      ok: true,
      message: 'Telas atualizadas com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar telas PWA:', error);
    return res.status(500).json({
      ok: false,
      code: 'UPDATE_PWA_SCREENS_ERROR',
      message: 'Erro ao atualizar telas do PWA'
    });
  }
});

export default router;
