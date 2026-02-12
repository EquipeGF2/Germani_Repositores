-- ============================================================
-- LIMPEZA DE DADOS - GERMANI REPOSITORES
-- Executar direto no Turso (dashboard ou CLI)
-- ============================================================
-- MANTÉM: cad_repositor, roteiros, usuarios, telas, permissoes,
--         tipos documento/espaco/gasto, atividades, config sync,
--         definicoes pesquisa, rateio, venda centralizada
-- ============================================================

-- 1. Despesas de viagem
DELETE FROM cc_despesa_valores;

-- 2. Fila de uploads pendentes
DELETE FROM cc_drive_pendencia;

-- 3. Registros de visita (fotos checkin/checkout/campanha)
DELETE FROM cc_registro_visita;

-- 4. Sessoes de visita
DELETE FROM cc_visita_sessao;

-- 5. Documentos enviados
DELETE FROM cc_documentos;

-- 6. Mapeamento de subpastas Drive por tipo
DELETE FROM cc_repositor_drive_pastas;

-- 7. Mapeamento de pasta raiz Drive por repositor
DELETE FROM cc_repositor_drive;

-- 8. Registros de espaco (visitas)
DELETE FROM cc_registro_espacos;

-- 9. Coordenadas de clientes
DELETE FROM cc_clientes_coordenadas;

-- 10. Respostas de pesquisas
DELETE FROM cc_pesquisa_respostas;

-- 11. Registros de nao-atendimento
DELETE FROM cc_nao_atendimento;

-- 12. Logs de sincronizacao
DELETE FROM cc_sync_log;

-- 13. Flags de forcar sync
DELETE FROM cc_forca_sync;

-- 14. Historico de performance
DELETE FROM cc_performance_historico;

-- 15. Custos mensais por repositor
DELETE FROM cc_custos_repositor_mensal;
