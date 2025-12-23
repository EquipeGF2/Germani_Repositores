import { EventEmitter } from 'node:events';
import { createWriteStream, createReadStream, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

class LocalZipArchiver extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.tempDir = join(tmpdir(), `archiver-${randomUUID()}`);
    mkdirSync(this.tempDir, { recursive: true });
    this.entries = [];
    this.pending = [];
    this.output = null;
    this.finalized = false;
  }

  pipe(destino) {
    this.output = destino;
    return destino;
  }

  append(stream, options = {}) {
    if (this.finalized) {
      this.emit('error', new Error('Não é possível adicionar arquivos após finalizar.'));
      return;
    }

    if (!stream || typeof stream.pipe !== 'function') {
      this.emit('error', new Error('Stream inválido para append.'));
      return;
    }

    const baseNome = typeof options.name === 'string' && options.name.trim()
      ? options.name.trim()
      : `arquivo-${this.entries.length + 1}`;
    const nomeSeguro = basename(baseNome).replace(/\s+/g, '_');
    const caminhoTemp = join(this.tempDir, `${this.entries.length}-${nomeSeguro}`);

    const escrita = pipeline(stream, createWriteStream(caminhoTemp)).catch((err) => {
      this.emit('error', err);
    });

    this.pending.push(escrita);
    this.entries.push({ caminho: caminhoTemp });
  }

  async finalize() {
    if (this.finalized) return;
    this.finalized = true;

    try {
      await Promise.all(this.pending);

      if (!this.output) {
        throw new Error('Defina o destino com pipe() antes de finalizar.');
      }

      if (this.entries.length === 0) {
        this.output.end();
        this.cleanup();
        return;
      }

      const zipPath = join(this.tempDir, 'bundle.zip');
      await this.compactarArquivos(zipPath);
      await this.streamZip(zipPath);
    } catch (error) {
      this.emit('error', error);
      this.cleanup();
    }
  }

  compactarArquivos(zipPath) {
    return new Promise((resolve, reject) => {
      const args = ['-j', '-q', zipPath, ...this.entries.map((entry) => entry.caminho)];
      const proc = spawn('zip', args);

      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) return resolve();
        return reject(new Error(`Falha ao gerar ZIP (código ${code})`));
      });
    });
  }

  async streamZip(zipPath) {
    return new Promise((resolve, reject) => {
      const zipStream = createReadStream(zipPath);
      zipStream.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.output.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      zipStream.on('close', () => {
        this.cleanup();
        resolve();
      });

      zipStream.pipe(this.output);
    });
  }

  cleanup() {
    rmSync(this.tempDir, { recursive: true, force: true });
  }
}

export default function archiver(formato = 'zip', options = {}) {
  if (formato !== 'zip') {
    throw new Error('Somente formato ZIP é suportado na versão local.');
  }
  return new LocalZipArchiver(options);
}
