-- ============================================================
-- INDICES OTIMIZADOS - GERMANI REPOSITORES
-- Executar direto no Turso (dashboard ou CLI)
-- Todos usam IF NOT EXISTS (seguro re-executar)
-- ============================================================


-- =============================================
-- 1. ROTEIRO (SEM NENHUM INDICE HOJE - CRITICO)
-- =============================================

-- rot_roteiro_cidade: filtrado por repositor em todas as consultas
CREATE INDEX IF NOT EXISTS idx_rot_cidade_repositor
  ON rot_roteiro_cidade(rot_repositor_id);

-- rot_roteiro_cidade: filtro composto repositor + dia da semana
CREATE INDEX IF NOT EXISTS idx_rot_cidade_repositor_dia
  ON rot_roteiro_cidade(rot_repositor_id, rot_dia_semana);

-- rot_roteiro_cidade: JOIN com rot_roteiro_cliente via rot_cid_id
CREATE INDEX IF NOT EXISTS idx_rot_cidade_cid
  ON rot_roteiro_cidade(rot_cid_id);

-- rot_roteiro_cidade: busca por nome de cidade
CREATE INDEX IF NOT EXISTS idx_rot_cidade_nome
  ON rot_roteiro_cidade(rot_cidade);

-- rot_roteiro_cliente: JOIN com rot_roteiro_cidade via rot_cid_id (MAIS FREQUENTE)
CREATE INDEX IF NOT EXISTS idx_rot_cliente_cid
  ON rot_roteiro_cliente(rot_cid_id);

-- rot_roteiro_cliente: busca por codigo do cliente
CREATE INDEX IF NOT EXISTS idx_rot_cliente_codigo
  ON rot_roteiro_cliente(rot_cliente_codigo);

-- rot_roteiro_auditoria: filtro por repositor
CREATE INDEX IF NOT EXISTS idx_rot_auditoria_repositor
  ON rot_roteiro_auditoria(rot_repositor_id);


-- =============================================
-- 2. CAD_REPOSITOR (SEM INDICE HOJE)
-- =============================================

-- Filtro mais comum: repositores ativos (data_fim IS NULL)
CREATE INDEX IF NOT EXISTS idx_cad_repositor_data_fim
  ON cad_repositor(repo_data_fim);

-- Filtro por supervisor
CREATE INDEX IF NOT EXISTS idx_cad_repositor_supervisor
  ON cad_repositor(rep_supervisor);

-- Busca/ordenacao por nome
CREATE INDEX IF NOT EXISTS idx_cad_repositor_nome
  ON cad_repositor(repo_nome);


-- =============================================
-- 3. CC_VISITA_SESSAO (complementar existentes)
-- =============================================

-- Lookup por local_id (sync PWA)
CREATE INDEX IF NOT EXISTS idx_sessao_local_id
  ON cc_visita_sessao(local_id);

-- Filtro por status (ABERTA, FECHADA, etc.)
CREATE INDEX IF NOT EXISTS idx_sessao_status
  ON cc_visita_sessao(status);

-- Composto: repositor + status (consultas de sessoes abertas por rep)
CREATE INDEX IF NOT EXISTS idx_sessao_rep_status
  ON cc_visita_sessao(rep_id, status);


-- =============================================
-- 4. CC_REGISTRO_VISITA (complementar existentes)
-- =============================================

-- Filtro por rv_sessao_id + rv_tipo (query mais frequente do sistema)
CREATE INDEX IF NOT EXISTS idx_rv_sessao_tipo
  ON cc_registro_visita(rv_sessao_id, rv_tipo);

-- Filtro por status (CANCELADO, PENDENTE_UPLOAD, etc.)
CREATE INDEX IF NOT EXISTS idx_rv_status
  ON cc_registro_visita(rv_status);


-- =============================================
-- 5. CC_USUARIOS (complementar existentes)
-- =============================================

-- Login: username + ativo (auth query)
CREATE INDEX IF NOT EXISTS idx_usuarios_username_ativo
  ON cc_usuarios(username, ativo);


-- =============================================
-- 6. CC_NAO_ATENDIMENTO (SEM INDICE HOJE)
-- =============================================

-- Lookup unico: repositor + cliente + data
CREATE INDEX IF NOT EXISTS idx_nao_atend_rep_cli_data
  ON cc_nao_atendimento(na_repositor_id, na_cliente_id, na_data_visita);


-- =============================================
-- 7. CC_REGISTRO_ESPACOS (complementar existentes)
-- =============================================

-- Filtro composto mais frequente
CREATE INDEX IF NOT EXISTS idx_reg_esp_repositor_cliente_data
  ON cc_registro_espacos(reg_repositor_id, reg_cliente_id, reg_data_registro);

-- Filtro por repositor (relatorios)
CREATE INDEX IF NOT EXISTS idx_reg_esp_repositor
  ON cc_registro_espacos(reg_repositor_id);


-- =============================================
-- 8. CC_CLIENTES_ESPACOS (complementar existentes)
-- =============================================

-- Filtro por tipo de espaco
CREATE INDEX IF NOT EXISTS idx_ces_tipo_espaco
  ON cc_clientes_espacos(ces_tipo_espaco_id);


-- =============================================
-- 9. CC_DOCUMENTO_TIPOS (SEM INDICE HOJE)
-- =============================================

-- Lookup por codigo
CREATE INDEX IF NOT EXISTS idx_doc_tipos_codigo
  ON cc_documento_tipos(dct_codigo);

-- Filtro ativo + ordenacao
CREATE INDEX IF NOT EXISTS idx_doc_tipos_ativo_ordem
  ON cc_documento_tipos(dct_ativo, dct_ordem);


-- =============================================
-- 10. CC_DESPESA_VALORES (complementar existentes)
-- =============================================

-- Filtro por tipo de gasto
CREATE INDEX IF NOT EXISTS idx_despesa_gst_codigo
  ON cc_despesa_valores(dv_gst_codigo);


-- =============================================
-- 11. CC_PERFORMANCE_HISTORICO (complementar)
-- =============================================

-- Composto: repositor + competencia (query principal)
CREATE INDEX IF NOT EXISTS idx_ph_rep_competencia
  ON cc_performance_historico(ph_rep_id, ph_competencia);
