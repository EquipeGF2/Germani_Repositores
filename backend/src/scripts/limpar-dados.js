/**
 * Script de limpeza de dados operacionais
 * Executa DELETE diretamente no Turso, mantendo cadastros e configuracoes
 *
 * Uso: node backend/src/scripts/limpar-dados.js [--executar]
 *   Sem flag: modo preview (apenas mostra contagens)
 *   --executar: executa a limpeza
 */

import { createClient } from '@libsql/client';

const TURSO_URL = 'libsql://germanirepositor-genaroforratig365-pixel.aws-us-east-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjU5OTg1NTcsImlkIjoiZDZkYTE2ZWItMWM1NS00MjJiLWJmOGItYzdhODY5ZTI0M2M2IiwicmlkIjoiMGNiMzI5MjItNTU5Mi00NGRjLTljN2ItYWZjOGIwMGU0ZjI0In0.xbAqf93M25sX4CG5Ha6tJHB2zOoDL8Xpe-M2j00Fhl3wtmm9pA3HPM973bRNLpFmAp5Gmz4gCH8e2_bWE5XrDA';

const TABELAS_LIMPAR = [
  // Dependentes primeiro
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

const TABELAS_MANTER = [
  'cad_repositor',
  'rot_roteiro_cidade',
  'rot_roteiro_cliente',
  'rot_roteiro_auditoria',
  'cc_usuarios',
  'users_web',
  'cc_pwa_telas',
  'cc_web_telas',
  'cc_usuario_telas_web',
  'acl_usuario_tela',
  'cc_documento_tipos',
  'cc_tipos_espaco',
  'cc_clientes_espacos',
  'cc_gasto_tipos',
  'cc_atividades',
  'cc_config_sync',
  'cc_pesquisas',
  'cc_pesquisa_campos',
  'cc_pesquisa_repositores',
  'cc_pesquisa_clientes',
  'cc_pesquisa_grupos',
  'cc_pesquisa_cidades',
  'rat_cliente_repositor',
  'venda_centralizada',
];

async function main() {
  const executar = process.argv.includes('--executar');

  console.log('========================================');
  console.log(executar ? '  MODO EXECUCAO - LIMPEZA DE DADOS' : '  MODO PREVIEW - LIMPEZA DE DADOS');
  console.log('========================================\n');

  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN,
  });

  // Testar conexao
  try {
    await client.execute('SELECT 1');
    console.log('Conectado ao Turso com sucesso.\n');
  } catch (error) {
    console.error('ERRO ao conectar ao Turso:', error.message);
    process.exit(1);
  }

  // Mostrar tabelas que serao MANTIDAS
  console.log('--- TABELAS MANTIDAS (cadastros/configuracoes) ---');
  for (const tabela of TABELAS_MANTER) {
    try {
      const result = await client.execute(`SELECT COUNT(*) as total FROM ${tabela}`);
      const total = result.rows[0]?.total ?? 0;
      console.log(`  ${tabela}: ${total} registros`);
    } catch {
      console.log(`  ${tabela}: (tabela nao existe)`);
    }
  }

  console.log('\n--- TABELAS A LIMPAR (registros operacionais) ---');
  let totalGeral = 0;
  const contagens = [];

  for (const tabela of TABELAS_LIMPAR) {
    try {
      const result = await client.execute(`SELECT COUNT(*) as total FROM ${tabela}`);
      const total = Number(result.rows[0]?.total ?? 0);
      contagens.push({ tabela, total });
      totalGeral += total;
      console.log(`  ${tabela}: ${total} registros ${total > 0 ? '<-- SERA LIMPO' : ''}`);
    } catch {
      contagens.push({ tabela, total: 0, erro: true });
      console.log(`  ${tabela}: (tabela nao existe)`);
    }
  }

  console.log(`\n  TOTAL DE REGISTROS A REMOVER: ${totalGeral}\n`);

  if (!executar) {
    console.log('Para executar a limpeza, rode:');
    console.log('  node backend/src/scripts/limpar-dados.js --executar\n');
    client.close();
    return;
  }

  // EXECUTAR LIMPEZA
  console.log('========================================');
  console.log('  EXECUTANDO LIMPEZA...');
  console.log('========================================\n');

  let removidos = 0;
  for (const { tabela, total, erro } of contagens) {
    if (erro) {
      console.log(`  [SKIP] ${tabela} - tabela nao existe`);
      continue;
    }
    if (total === 0) {
      console.log(`  [SKIP] ${tabela} - vazio`);
      continue;
    }

    try {
      await client.execute(`DELETE FROM ${tabela}`);
      removidos += total;
      console.log(`  [OK]   ${tabela} - ${total} registros removidos`);
    } catch (error) {
      console.log(`  [ERRO] ${tabela} - ${error.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`  LIMPEZA CONCLUIDA: ${removidos} registros removidos`);
  console.log(`========================================\n`);

  // Verificar resultado
  console.log('--- VERIFICACAO POS-LIMPEZA ---');
  for (const tabela of TABELAS_LIMPAR) {
    try {
      const result = await client.execute(`SELECT COUNT(*) as total FROM ${tabela}`);
      const total = Number(result.rows[0]?.total ?? 0);
      console.log(`  ${tabela}: ${total} registros ${total === 0 ? '(limpo)' : '(!!! AINDA TEM DADOS !!!)'}`);
    } catch {
      console.log(`  ${tabela}: (tabela nao existe)`);
    }
  }

  client.close();
}

main().catch(error => {
  console.error('Erro fatal:', error);
  process.exit(1);
});
