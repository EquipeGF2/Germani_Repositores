import express from 'express';
import { googleDriveService, OAuthNotConfiguredError } from '../services/googleDrive.js';

const router = express.Router();

const CONTENT_TYPE_PADRAO = 'image/jpeg';
const CACHE_CONTROL = 'public, max-age=3600';

function resolverContentType(mimeType) {
  if (!mimeType) return CONTENT_TYPE_PADRAO;
  if (mimeType.startsWith('image/')) return mimeType;
  if (mimeType === 'application/octet-stream') return CONTENT_TYPE_PADRAO;
  return CONTENT_TYPE_PADRAO;
}

router.get('/preview/:fileId', async (req, res) => {
  const { fileId } = req.params;

  if (!fileId) {
    return res.status(400).json({ ok: false, code: 'FILE_ID_REQUIRED', message: 'fileId é obrigatório' });
  }

  try {
    const { stream, mimeType, filename } = await googleDriveService.downloadArquivoComInfo(fileId);

    res.setHeader('Content-Type', resolverContentType(mimeType));
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.setHeader('Content-Disposition', `inline; filename="${filename || fileId}"`);

    stream.on('error', (error) => {
      console.error('Erro ao transmitir arquivo do Drive:', error?.message || error);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    stream.pipe(res);
  } catch (error) {
    if (error instanceof OAuthNotConfiguredError) {
      return res.status(503).json({ ok: false, code: error.code, message: error.message });
    }

    const statusCode = error?.code || error?.response?.status;
    if (statusCode === 404) {
      return res.status(404).json({ ok: false, code: 'FILE_NOT_FOUND', message: 'Arquivo não encontrado ou sem permissão' });
    }
    if (statusCode === 403) {
      return res.status(403).json({ ok: false, code: 'FILE_FORBIDDEN', message: 'Acesso negado ao arquivo solicitado' });
    }

    console.error('Erro ao carregar preview do arquivo:', error?.message || error);
    res.status(500).json({ ok: false, code: 'FILE_PREVIEW_ERROR', message: 'Erro ao carregar preview do arquivo' });
  }
});

export default router;
