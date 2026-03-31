import express from 'express';
import multer from 'multer';
import { tursoService } from '../services/turso.js';
import { googleDriveService } from '../services/googleDrive.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

/**
 * Sanitiza BigInt para JSON
 */
function sanitizeForJson(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sanitizeForJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeForJson(v)])
    );
  }
  return value;
}

/**
 * POST /api/pesquisa/upload-foto
 * Upload de foto de pesquisa para o Google Drive
 *
 * Estrutura de pasta: REP_X_NOME/pesquisa/[id_pesquisa]/
 * Nome do arquivo: CODREP_CLICOD_PESQUISA_DATA_HORA_SEQ.jpg
 */
router.post('/upload-foto', upload.single('arquivo'), async (req, res) => {
  try {
    console.log('📤 Iniciando upload de foto de pesquisa...');

    const { repositor_id, pesquisa_id, cliente_codigo } = req.body;
    const arquivo = req.file;

    if (!repositor_id || !pesquisa_id) {
      return res.status(400).json({
        success: false,
        message: 'repositor_id e pesquisa_id são obrigatórios'
      });
    }

    if (!arquivo) {
      return res.status(400).json({
        success: false,
        message: 'Arquivo é obrigatório'
      });
    }

    console.log(`📁 Upload: rep=${repositor_id}, pesquisa=${pesquisa_id}, cliente=${cliente_codigo}`);
    console.log(`📁 Arquivo: ${arquivo.originalname}, ${arquivo.size} bytes, ${arquivo.mimetype}`);

    // Buscar repositor
    const repoResult = await tursoService.execute(
      'SELECT repo_cod, repo_nome FROM cad_repositor WHERE repo_cod = ?',
      [parseInt(repositor_id)]
    );

    if (repoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Repositor não encontrado'
      });
    }

    const repositor = repoResult.rows[0];

    // Criar estrutura de pastas: REP_X_NOME/pesquisa/[id_pesquisa]
    const repFolderId = await googleDriveService.criarPastaRepositor(
      repositor.repo_cod,
      repositor.repo_nome
    );

    const pesquisaRootId = await googleDriveService.createFolderIfNotExists(
      repFolderId,
      'pesquisa'
    );

    const pesquisaFolderId = await googleDriveService.createFolderIfNotExists(
      pesquisaRootId,
      `PES_${pesquisa_id}`
    );

    // Fazer upload do arquivo
    const uploadResult = await googleDriveService.uploadArquivo({
      buffer: arquivo.buffer,
      mimeType: arquivo.mimetype || 'image/jpeg',
      filename: arquivo.originalname,
      parentFolderId: pesquisaFolderId
    });

    console.log(`✅ Foto de pesquisa enviada: ${uploadResult.fileId}`);

    res.json(sanitizeForJson({
      success: true,
      url: uploadResult.webViewLink,
      fileId: uploadResult.fileId,
      filename: arquivo.originalname
    }));

  } catch (error) {
    console.error('❌ Erro ao fazer upload de foto de pesquisa:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao fazer upload da foto',
      error: error.message
    });
  }
});

/**
 * POST /salvar-resposta
 * Salvar resposta de pesquisa via API (alternativa ao Turso direto do browser)
 */
router.post('/salvar-resposta', async (req, res) => {
  try {
    const { pesId, repId, clienteCodigo, visitaId, respostas, fotoUrl } = req.body;

    if (!pesId || !repId || !clienteCodigo) {
      return res.status(400).json({
        success: false,
        message: 'pesId, repId e clienteCodigo são obrigatórios'
      });
    }

    const clienteCodigoNorm = String(clienteCodigo).trim().replace(/\.0$/, '');
    const agora = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dataHoje = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
    const timestampLocal = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())} ${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}`;

    // Verificar se já existe
    const existente = await tursoService.execute(
      `SELECT res_id FROM cc_pesquisa_respostas WHERE res_pes_id = ? AND res_rep_id = ? AND res_cliente_codigo = ? AND res_data = ?`,
      [pesId, repId, clienteCodigoNorm, dataHoje]
    );

    let result;
    if (existente.rows.length > 0) {
      const resId = existente.rows[0].res_id;
      await tursoService.execute(
        `UPDATE cc_pesquisa_respostas SET res_respostas = ?, res_foto_url = ?, res_visita_id = ? WHERE res_id = ?`,
        [JSON.stringify(respostas), fotoUrl || null, visitaId || null, resId]
      );
      result = { id: resId, updated: true };
    } else {
      const insertResult = await tursoService.execute(
        `INSERT INTO cc_pesquisa_respostas (res_pes_id, res_rep_id, res_cliente_codigo, res_visita_id, res_data, res_respostas, res_foto_url, res_criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [pesId, repId, clienteCodigoNorm, visitaId || null, dataHoje, JSON.stringify(respostas), fotoUrl || null, timestampLocal]
      );
      result = { id: sanitizeForJson(insertResult.lastInsertRowid), inserted: true };
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('❌ Erro ao salvar resposta de pesquisa:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao salvar resposta',
      error: error.message
    });
  }
});

export default router;
