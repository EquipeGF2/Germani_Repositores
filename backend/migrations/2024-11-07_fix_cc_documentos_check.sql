-- Migração para corrigir constraint de data em cc_documentos
-- Objetivo: ajustar CHECK para utilizar padrões compatíveis com GLOB e garantir comprimento

BEGIN TRANSACTION;

-- Renomear tabela antiga
ALTER TABLE cc_documentos RENAME TO cc_documentos_old;

-- Criar nova tabela com CHECK corrigido
CREATE TABLE cc_documentos (
  doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_repositor_id INTEGER NOT NULL,
  doc_dct_id INTEGER NOT NULL,
  doc_nome_original TEXT NOT NULL,
  doc_nome_drive TEXT NOT NULL,
  doc_ext TEXT NOT NULL,
  doc_mime TEXT,
  doc_tamanho INTEGER,
  doc_observacao TEXT,
  doc_data_ref TEXT NOT NULL CHECK (doc_data_ref GLOB '????-??-??' AND length(doc_data_ref) = 10),
  doc_hora_ref TEXT NOT NULL CHECK (doc_hora_ref GLOB '??:??' AND length(doc_hora_ref) = 5),
  doc_drive_file_id TEXT,
  doc_drive_folder_id TEXT,
  doc_status TEXT NOT NULL DEFAULT 'ENVIADO',
  doc_erro_msg TEXT,
  doc_criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  doc_atualizado_em TEXT,
  FOREIGN KEY (doc_dct_id) REFERENCES cc_documento_tipos(dct_id)
);

-- Copiar dados existentes
INSERT INTO cc_documentos (
  doc_id, doc_repositor_id, doc_dct_id, doc_nome_original, doc_nome_drive,
  doc_ext, doc_mime, doc_tamanho, doc_observacao, doc_data_ref, doc_hora_ref,
  doc_drive_file_id, doc_drive_folder_id, doc_status, doc_erro_msg,
  doc_criado_em, doc_atualizado_em
)
SELECT
  doc_id, doc_repositor_id, doc_dct_id, doc_nome_original, doc_nome_drive,
  doc_ext, doc_mime, doc_tamanho, doc_observacao, doc_data_ref, doc_hora_ref,
  doc_drive_file_id, doc_drive_folder_id, doc_status, doc_erro_msg,
  doc_criado_em, doc_atualizado_em
FROM cc_documentos_old;

-- Remover tabela antiga
DROP TABLE cc_documentos_old;

-- Recriar índices
CREATE INDEX IF NOT EXISTS idx_cc_documentos_repositor_data ON cc_documentos (doc_repositor_id, doc_data_ref, doc_dct_id);
CREATE INDEX IF NOT EXISTS idx_cc_documentos_tipo ON cc_documentos (doc_dct_id);
CREATE INDEX IF NOT EXISTS idx_cc_documentos_status ON cc_documentos (doc_status);

COMMIT;
