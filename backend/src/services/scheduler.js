import cron from 'node-cron';
import { tursoService } from './turso.js';

/**
 * Serviço de Agendamento Automático
 *
 * Executa tarefas programadas como o fechamento mensal de performance
 */

class SchedulerService {
  constructor() {
    this.jobs = [];
  }

  /**
   * Inicializa todos os agendamentos
   */
  init() {
    console.log('📅 Inicializando serviço de agendamento...');

    // Fechamento mensal: executa às 23:55 do último dia de cada mês
    // Cron: minuto hora dia mês dia-da-semana
    // Para último dia do mês, usamos dia 28-31 e verificamos no código
    this.agendarFechamentoMensal();

    console.log('✅ Serviço de agendamento inicializado');
  }

  /**
   * Agenda o fechamento mensal de performance
   * Executa às 23:55 dos dias 28, 29, 30 e 31, mas só processa no último dia real do mês
   */
  agendarFechamentoMensal() {
    // Executa às 23:55 nos dias 28-31 de cada mês
    const job = cron.schedule('55 23 28-31 * *', async () => {
      const hoje = new Date();
      const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();

      // Só executa se for realmente o último dia do mês
      if (hoje.getDate() !== ultimoDiaMes) {
        console.log(`📅 [Scheduler] Dia ${hoje.getDate()} não é o último dia do mês (${ultimoDiaMes}). Ignorando.`);
        return;
      }

      console.log(`📅 [Scheduler] Executando fechamento mensal automático...`);
      await this.executarFechamentoMensal();
    }, {
      timezone: 'America/Sao_Paulo'
    });

    this.jobs.push(job);
    console.log('📅 Fechamento mensal agendado para às 23:55 do último dia de cada mês');
  }

  /**
   * Executa o fechamento mensal para todos os repositores
   */
  async executarFechamentoMensal(competenciaOverride = null) {
    const inicio = Date.now();

    try {
      // Calcular competência (mês atual, pois estamos no último dia)
      const hoje = new Date();
      const competencia = competenciaOverride ||
        `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

      console.log(`📊 [Fechamento] Iniciando fechamento para competência ${competencia}`);

      // Buscar todos os repositores ativos
      const repositores = await tursoService.listarRepositoresAtivos();
      console.log(`📊 [Fechamento] ${repositores.length} repositores encontrados`);

      let processados = 0;
      let erros = 0;

      for (const repo of repositores) {
        try {
          // Buscar clientes do roteiro
          const clientesRoteiro = await tursoService.buscarClientesDoRepositor(repo.rep_id);

          if (!clientesRoteiro || clientesRoteiro.length === 0) {
            // Repositor sem clientes, salvar com zeros
            await tursoService.salvarHistoricoPerformance(repo.rep_id, competencia, 0, 0, 0);
            processados++;
            continue;
          }

          // Calcular período do mês
          const [ano, mes] = competencia.split('-').map(Number);
          const primeiroDia = `${competencia}-01`;
          const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0];

          // Buscar vendas do banco comercial
          const clienteIds = clientesRoteiro.map(c => c.cliente_id);
          const vendas = await tursoService.buscarVendasPorClientes(clienteIds, primeiroDia, ultimoDia);

          // Calcular totais
          let totalFaturamento = 0;
          let totalPeso = 0;
          (vendas || []).forEach(v => {
            totalFaturamento += parseFloat(v.valor_financeiro) || 0;
            totalPeso += parseFloat(v.peso_liq) || 0;
          });

          // Buscar custos
          let totalCusto = 0;
          try {
            const custosMap = await tursoService.buscarCustosRepositorMensal(repo.rep_id, competencia, competencia);
            totalCusto = Object.values(custosMap).reduce((a, b) => a + b, 0);
          } catch (e) {
            // Custos podem não existir
          }

          // Salvar snapshot
          await tursoService.salvarHistoricoPerformance(
            repo.rep_id,
            competencia,
            totalFaturamento,
            totalPeso,
            totalCusto
          );

          processados++;

        } catch (error) {
          console.error(`❌ [Fechamento] Erro no repositor ${repo.rep_id}:`, error.message);
          erros++;
        }
      }

      const duracao = ((Date.now() - inicio) / 1000).toFixed(2);
      console.log(`✅ [Fechamento] Concluído em ${duracao}s - ${processados} processados, ${erros} erros`);

      return { competencia, processados, erros, duracao };

    } catch (error) {
      console.error('❌ [Fechamento] Erro fatal:', error);
      throw error;
    }
  }

  /**
   * Para todos os agendamentos (usado em testes)
   */
  stop() {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.log('📅 Serviço de agendamento parado');
  }
}

export const schedulerService = new SchedulerService();
