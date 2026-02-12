# Documentacao Completa do Sistema Web - Germani Repositores

**Versao:** 1.0
**Publico-alvo:** Supervisores, Gestores, Administradores
**Plataforma:** Navegador web (desktop e mobile)

---

## Sumario

1. [Visao Geral do Sistema](#1-visao-geral-do-sistema)
2. [Login e Autenticacao](#2-login-e-autenticacao)
3. [Navegacao e Interface](#3-navegacao-e-interface)
4. [Cadastros](#4-cadastros)
   - 4.1 [Cadastro de Repositor](#41-cadastro-de-repositor)
   - 4.2 [Roteiro do Repositor](#42-roteiro-do-repositor)
   - 4.3 [Manutencao de Rateio](#43-manutencao-de-rateio)
   - 4.4 [Centralizacao](#44-centralizacao)
   - 4.5 [Pesquisas](#45-pesquisas)
   - 4.6 [Compra de Espaco](#46-compra-de-espaco)
   - 4.7 [Validacao de Dados](#47-validacao-de-dados)
5. [Consultas](#5-consultas)
   - 5.1 [Consulta de Visitas](#51-consulta-de-visitas)
   - 5.2 [Consulta Campanha](#52-consulta-campanha)
   - 5.3 [Consulta Alteracoes](#53-consulta-alteracoes)
   - 5.4 [Consulta Roteiro](#54-consulta-roteiro)
   - 5.5 [Consulta de Documentos](#55-consulta-de-documentos)
   - 5.6 [Consulta de Pesquisas](#56-consulta-de-pesquisas)
   - 5.7 [Consulta de Espacos](#57-consulta-de-espacos)
   - 5.8 [Consulta de Despesas](#58-consulta-de-despesas)
6. [Controles](#6-controles)
   - 6.1 [Registro de Rota](#61-registro-de-rota)
   - 6.2 [Registro de Documentos](#62-registro-de-documentos)
7. [Performance](#7-performance)
   - 7.1 [Performance de Visitas](#71-performance-de-visitas)
   - 7.2 [Performance de Faturamento](#72-performance-de-faturamento)
   - 7.3 [Historico de Performance](#73-historico-de-performance)
8. [Custos](#8-custos)
   - 8.1 [Grid de Custos](#81-grid-de-custos)
9. [Configuracoes do Sistema](#9-configuracoes-do-sistema)
   - 9.1 [Geral](#91-geral)
   - 9.2 [Sessoes](#92-sessoes)
   - 9.3 [Tipos de Documentos](#93-tipos-de-documentos)
   - 9.4 [Rubricas de Gasto](#94-rubricas-de-gasto)
   - 9.5 [Coordenadas](#95-coordenadas)
   - 9.6 [Usuarios](#96-usuarios)
   - 9.7 [Controle de Acessos](#97-controle-de-acessos)
   - 9.8 [Tipos de Espaco](#98-tipos-de-espaco)
   - 9.9 [Sincronizacao](#99-sincronizacao)
   - 9.10 [Atividades](#910-atividades)
10. [Permissoes PWA](#10-permissoes-pwa)
11. [Estrutura do Banco Comercial](#11-estrutura-do-banco-comercial)
12. [Padroes de Desenvolvimento](#12-padroes-de-desenvolvimento)
13. [Arquitetura Tecnica](#13-arquitetura-tecnica)

---

## 1. Visao Geral do Sistema

O Sistema de Repositores Germani e uma aplicacao web progressiva (PWA) para gestao completa das operacoes de reposicao em campo.

### Funcionalidades principais

| Modulo | Funcao |
|--------|--------|
| **Cadastros** | Gerenciar repositores, roteiros, rateios, centralizacoes, pesquisas e espacos |
| **Consultas** | Visualizar visitas, campanhas, alteracoes, roteiros, documentos, pesquisas, espacos e despesas |
| **Controles** | Registrar rotas/visitas com foto e GPS, enviar documentos |
| **Performance** | Analisar tempo de atendimento, servicos realizados, faturamento e historico |
| **Custos** | Gerenciar grid de custos por repositor |
| **Configuracoes** | Parametrizar validacoes, tipos, usuarios, permissoes e sincronizacao |

### Tecnologias

- **Frontend**: JavaScript puro (SPA), HTML5, CSS3
- **Backend**: Node.js/Express hospedado no Render
- **Banco de dados**: Turso (SQLite serverless) - banco principal
- **Banco comercial**: Turso (somente leitura) - dados de clientes/representantes
- **Armazenamento**: Google Drive / OneDrive para documentos e fotos
- **Deploy**: GitHub Pages (frontend) + Render (backend)

---

## 2. Login e Autenticacao

### Tela de login

- Campos: **Usuario** e **Senha**
- Botao: **"Entrar"**
- Autenticacao via API backend com JWT token
- Sessao mantida no navegador (localStorage)

### Perfis de acesso

| Perfil | Acesso |
|--------|--------|
| **Administrador** | Acesso total a todas as funcionalidades e configuracoes |
| **Supervisor** | Acesso a consultas, performance e gestao de repositores |
| **Repositor** | Acesso limitado a registro de rota, documentos e consultas proprias |

### Controle de acesso

- Cada pagina/tela possui configuracao de liberacao por perfil
- Itens do menu sao exibidos conforme as permissoes do usuario logado
- Configuravel em **Configuracoes > Acessos**

---

## 3. Navegacao e Interface

### Estrutura da tela

```
+-------------------------------------------+
| Logo  |  Titulo da Pagina   |  Status     |
+-------+---------------------+             |
| Menu  |                     |  Usuario    |
| Lat.  |    Conteudo         |             |
|       |    Principal        |             |
|       |                     |             |
+-------+---------------------+-------------+
```

### Menu lateral (Sidebar)

O menu e organizado em categorias:

- **Inicio** - Tela inicial com atalhos rapidos
- **Cadastros** - Gerenciamento de dados mestres
- **Consultas** - Visualizacao e analise de dados
- **Controles** - Operacoes de campo (registro de visitas e documentos)
- **Performance** - Indicadores e analises
- **Custos** - Gestao financeira
- **Configuracoes** - Parametrizacao do sistema

### Alerta global de rateio

- Quando existem rateios incompletos (percentuais nao somam 100%), um alerta vermelho aparece no topo da tela
- Texto: **"EXISTEM RATEIOS INCOMPLETOS. VERIFICAR."**
- Botao **"Ver detalhes"** direciona para a Manutencao de Rateio

### Responsividade

- Em telas pequenas (mobile), o menu lateral se transforma em menu deslizante
- Acionado pelo botao de hamburguer (tres linhas) no canto superior esquerdo
- Tabelas e grids se adaptam ao tamanho da tela

---

## 4. Cadastros

### 4.1 Cadastro de Repositor

**Menu:** Cadastros > Repositor
**Objetivo:** Cadastrar, editar e gerenciar repositores

#### Filtros disponveis

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| Supervisor | Dropdown | Filtra por supervisor comercial |
| Representante | Dropdown | Filtra por representante comercial |
| Vinculo | Dropdown | "Repositor" ou "Agencia" |
| Cidade Referencia | Texto com autocomplete | Cidade base do repositor |
| Nome do Repositor | Texto | Busca por nome ou codigo |
| Status | Botoes toggle | "Todos", "Ativos", "Inativos" |

#### Cadastrar novo repositor

1. Clique em **"+ Novo Repositor"**
2. Modal com abas:
   - **Dados principais**: Nome, vinculo (repositor/agencia), cidade referencia, telefone, email, data inicio/fim
   - **Criar usuario PWA**: Opcao para criar login automatico para acesso mobile
   - **Jornada de trabalho**: Dias trabalhados (seg-dom), tipo de jornada (integral/meio turno)
   - **Alinhamento comercial**: Supervisor e representante vinculados
   - **Cidades Atendidas**: Lista de cidades do roteiro com ordem de visita
3. Clique em **"Cadastrar"** para salvar

#### Editar repositor

1. Na lista de resultados, clique no icone de edicao do repositor
2. O modal abre com os dados preenchidos
3. Altere os campos desejados
4. Clique em **"Salvar"**

#### Campos do formulario

| Campo | Obrigatorio | Descricao |
|-------|-------------|-----------|
| Nome | Sim | Nome completo do repositor |
| Vinculo Agencia | Nao | Checkbox - marca se for agencia |
| Cidade Referencia | Sim | Cidade base de operacao |
| Telefone | Nao | Telefone do repositor |
| Email | Nao | Email do repositor |
| Criar usuario PWA | Nao | Cria login automatico (codigo = username) |
| Data Inicio | Sim | Quando comecou a trabalhar |
| Data Fim | Nao | Vazio = ainda ativo |
| Dias trabalhados | Sim | Checkboxes seg a dom (padrao seg-sex) |
| Jornada | Sim | Integral ou Meio turno |
| Supervisor | Nao | Supervisor comercial vinculado |
| Representante | Nao | Representante comercial vinculado |

---

### 4.2 Roteiro do Repositor

**Menu:** Cadastros > Roteiro do Repositor
**Objetivo:** Configurar quais clientes cada repositor visita em cada dia da semana

#### Fase 1: Selecao do repositor

1. Use os filtros (Supervisor, Representante, Nome) para encontrar o repositor
2. Clique em **"Buscar"**
3. Clique no repositor desejado na lista

#### Fase 2: Configuracao do roteiro

Apos selecionar o repositor, a tela mostra:

- **Cabecalho**: Nome, codigo, supervisor, representante, telefone do repositor
- **Botoes**: Detalhes Representante, Manutencao Coordenadas
- **Abas por dia da semana**: Segunda, Terca, Quarta, Quinta, Sexta (e Sabado/Domingo se configurados)

#### Para cada dia da semana

1. Selecione a aba do dia
2. As **cidades** do roteiro aparecem como cards
3. Para cada cidade:
   - Os **clientes** da cidade sao listados
   - Toggle para incluir/excluir cliente do roteiro do dia
   - Campo de **ordem** para definir a sequencia de visitas
   - Indicador de **rateio** quando o cliente e atendido por mais de um repositor

#### Adicionar cidade ao roteiro

1. Use o campo de busca **"Adicionar cidade"**
2. Selecione a cidade da lista
3. A cidade sera adicionada ao dia selecionado
4. Os clientes da cidade aparecem para selecao

#### Salvar roteiro

- Clique em **"Salvar Roteiro"** apos realizar todas as alteracoes
- O botao mostra indicador de pendencias quando ha alteracoes nao salvas

#### Rateio automatico

- Ao incluir um cliente que ja e atendido por outro repositor:
  - O sistema cria automaticamente o rateio com percentual de 0%
  - Um alerta informa que os percentuais precisam ser ajustados na Manutencao de Rateio

---

### 4.3 Manutencao de Rateio

**Menu:** Cadastros > Manutencao de Rateio
**Objetivo:** Gerenciar os percentuais de rateio quando um cliente e atendido por mais de um repositor

#### Como funciona o rateio

- Quando um cliente e atendido por 2 ou mais repositores, o faturamento e rateado entre eles
- A soma dos percentuais de um mesmo cliente deve ser exatamente **100%**
- Clientes com rateio incompleto geram alerta global no sistema

#### Filtros

| Filtro | Descricao |
|--------|-----------|
| Cidade | Filtra por cidade do roteiro |
| Cliente | Filtra por cliente especifico |

1. Selecione os filtros desejados
2. Clique em **"Filtrar"**
3. Os resultados mostram clientes agrupados com seus repositores e percentuais

#### Editar percentual

1. Na lista de resultados, localize o cliente
2. Altere o campo de percentual de cada repositor
3. O sistema valida se a soma e 100%
4. Salve as alteracoes

---

### 4.4 Centralizacao

**Menu:** Cadastros > Centralizacao
**Objetivo:** Vincular clientes com venda centralizada ao cliente que efetivamente realiza a compra

#### Conceito

- Venda centralizada ocorre quando um cliente (origem) tem suas compras registradas em outro cliente (comprador)
- Exemplo: filial X tem faturamento centralizado na matriz Y

#### Filtros

| Filtro | Descricao |
|--------|-----------|
| Cidade | Filtra por cidade |
| Cliente | Busca por codigo ou nome |

#### Operacoes

1. **Adicionar vinculo**: Clique em **"+ Adicionar Cliente"**, selecione o cliente origem e o comprador
2. **Filtrar**: Use os filtros e clique em **"Filtrar"** para visualizar vinculos existentes
3. **Remover**: Exclua vinculos que nao se aplicam mais
4. **Recarregar**: Botao para atualizar a lista

---

### 4.5 Pesquisas

**Menu:** Cadastros > Pesquisas
**Objetivo:** Criar e gerenciar pesquisas que os repositores respondem durante as visitas

#### Filtros

| Filtro | Descricao |
|--------|-----------|
| Buscar | Texto livre (titulo ou descricao) |
| Status | Ativas, Inativas ou Todas |

#### Criar pesquisa

1. Clique em **"+ Nova Pesquisa"**
2. Modal com secoes:

**Dados da Pesquisa:**

| Campo | Obrigatorio | Descricao |
|-------|-------------|-----------|
| Titulo | Sim | Nome da pesquisa |
| Descricao | Nao | Objetivo da pesquisa |
| Data Inicio | Nao | Quando a pesquisa comeca |
| Data Fim | Nao | Quando a pesquisa encerra |
| Obrigatoria | Nao | Se deve ser respondida obrigatoriamente |
| Foto obrigatoria | Nao | Se exige foto junto com as respostas |

**Campos da Pesquisa (Questionario):**

- Clique em **"+ Adicionar Campo"** para cada pergunta
- Tipos de campo disponiveis:
  - **Texto**: resposta aberta
  - **Selecao**: escolha entre opcoes pre-definidas
  - **Numero**: valor numerico
  - **Sim/Nao**: resposta booleana
  - **Foto**: captura de imagem

**Vincular (opcional):**

- **Cidade**: selecione cidades especificas (a pesquisa aparece apenas para clientes dessas cidades)
- **Cliente**: selecione clientes especificos
- **Repositores**: selecione repositores especificos (vazio = todos)

3. Clique em **"Salvar"**

#### Editar/Desativar pesquisa

- Na lista, clique no botao de edicao para abrir o modal
- Para desativar, altere o status da pesquisa

---

### 4.6 Compra de Espaco

**Menu:** Cadastros > Compra de Espaco
**Objetivo:** Cadastrar e gerenciar clientes com espacos contratados (gondola, ponta de gondola, etc.)

#### Filtros

| Filtro | Descricao |
|--------|-----------|
| Cidade | Texto livre para buscar por cidade |
| Tipo de Espaco | Dropdown com tipos cadastrados |

#### Procedimento

1. Preencha os filtros
2. Clique em **"Buscar"** (a tela NAO carrega dados automaticamente)
3. Para adicionar:
   - Clique em **"+ Adicionar Cliente"**
   - Preencha: cidade, cliente, tipo de espaco, quantidade e vigencia
   - Clique em **"Salvar"**

#### Acoes disponiveis

| Acao | Descricao |
|------|-----------|
| Editar | Alterar quantidade ou vigencia |
| Inativar | Desativar o espaco sem remover |
| Remover | Excluir o registro permanentemente |

---

### 4.7 Validacao de Dados

**Menu:** Cadastros > Validacao de Dados
**Objetivo:** Verificar e corrigir inconsistencias nos dados cadastrais (clientes, repositores, roteiros)

- Exibe alertas de dados inconsistentes
- Permite correcao em lote
- Validacoes incluem: clientes sem cidade, roteiros sem clientes, rateios incompletos

---

## 5. Consultas

**Regra geral:** As telas de consulta **NAO carregam dados automaticamente**. Voce deve preencher os filtros e clicar no botao de busca.

### 5.1 Consulta de Visitas

**Menu:** Consultas > Consulta de Visitas
**Objetivo:** Visualizar o historico de visitas realizadas pelos repositores

#### Filtros

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| Repositor | Dropdown | Selecione um repositor ou "Todos" |
| Cliente | Dropdown | Habilitado apos selecionar repositor |
| Status | Dropdown | "Todos", "Em atendimento", "Finalizado" |
| Data Inicio | Date | Data inicial do periodo |
| Data Fim | Date | Data final do periodo |

#### Procedimento

1. Preencha os filtros
2. Clique em **"Consultar"**
3. Os resultados mostram:
   - Nome do cliente e codigo
   - Data e hora do check-in/checkout
   - Status da visita (badge colorido)
   - Tempo de permanencia
   - Fotos (se disponivel)
   - Distancia GPS (se disponivel)

#### Acoes

- **Limpar**: reseta todos os filtros
- **Ver detalhes**: expande informacoes da visita (fotos, atividades, GPS)

---

### 5.2 Consulta Campanha

**Menu:** Consultas > Consulta Campanha
**Objetivo:** Visualizar registros de campanhas com fotos dos repositores

#### Filtros

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| Repositor | Dropdown | Filtrar por repositor |
| Data Inicio | Date | Periodo inicial |
| Data Fim | Date | Periodo final |

- Exibe cards com fotos das campanhas realizadas
- Agrupamento por repositor e data

---

### 5.3 Consulta Alteracoes

**Menu:** Consultas > Consulta Alteracoes
**Objetivo:** Rastrear todas as alteracoes feitas nos roteiros (auditoria)

#### Filtros

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| Repositor | Dropdown | Filtrar por repositor |
| Tipo de Alteracao | Dropdown | Inclusao, Exclusao, Modificacao |
| Data Inicio | Date | Periodo |
| Data Fim | Date | Periodo |

- Exibe log de todas as acoes realizadas nos roteiros
- Inclui: usuario, data/hora, acao, cliente afetado, detalhes

---

### 5.4 Consulta Roteiro

**Menu:** Consultas > Consulta Roteiro
**Objetivo:** Visualizar a estrutura completa dos roteiros por repositor

#### Filtros

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| Supervisor | Dropdown | Filtrar por supervisor |
| Representante | Dropdown | Filtrar por representante |
| Repositor | Texto | Buscar por nome ou codigo |

- Exibe os roteiros organizados por dia da semana
- Mostra cidades, clientes e ordem de visita
- Permite visualizar a estrutura sem alterar

---

### 5.5 Consulta de Documentos

**Menu:** Consultas > Consulta de Documentos
**Objetivo:** Pesquisar, visualizar e baixar documentos enviados pelos repositores

#### Filtros

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| Tipo de Documento | Dropdown | Tipo especifico ou "Todos os tipos" |
| Repositor | Dropdown | Repositor especifico ou "Todos" |
| Data Inicial | Date | Inicio do periodo |
| Data Final | Date | Fim do periodo |

#### Procedimento

1. Preencha os filtros (a tela NAO carrega automaticamente)
2. Clique em **"Buscar Documentos"**
3. Resultados com **agrupamento automatico**:
   - **Todos repositores + Todos tipos**: agrupado por repositor, depois por tipo
   - **Todos repositores + Tipo especifico**: agrupado por repositor
   - **Repositor especifico**: lista plana

#### Acoes

| Acao | Descricao |
|------|-----------|
| Download individual | Botao "Download" em cada documento |
| Selecionar documentos | Checkboxes individuais ou "Selecionar Todos" |
| Download ZIP | Baixar multiplos documentos selecionados em ZIP |
| Mostrar Todos | Carrega todos sem filtro (usar com cautela) |

---

### 5.6 Consulta de Pesquisas

**Menu:** Consultas > Consulta de Pesquisas
**Objetivo:** Visualizar as respostas das pesquisas realizadas pelos repositores

#### Filtros

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| Pesquisa | Dropdown | Selecione a pesquisa |
| Repositor | Dropdown | Filtrar por repositor |
| Cliente | Texto | Buscar por cliente |
| Data Inicio | Date | Periodo |
| Data Fim | Date | Periodo |

- Exibe respostas agrupadas por pesquisa
- Mostra data, repositor, cliente e todas as respostas
- Fotos vinculadas (quando exigido pela pesquisa)

---

### 5.7 Consulta de Espacos

**Menu:** Consultas > Consulta de Espacos
**Objetivo:** Consultar registros de fotos e visitacao relacionados aos espacos contratados

#### Filtros

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| Repositor | Dropdown | Filtrar por repositor |
| Tipo de Espaco | Dropdown | Filtrar por tipo |
| Cliente | Texto | Buscar por cliente |
| Data Inicio | Date | Periodo |
| Data Fim | Date | Periodo |

- Exibe registros com fotos capturadas durante visitas
- Mostra status de conformidade dos espacos
- Filtros respeitam o periodo de datas informado

---

### 5.8 Consulta de Despesas

**Menu:** Consultas > Consulta de Despesas
**Objetivo:** Visualizar gastos dos repositores agrupados por rubrica

#### Filtros

| Filtro | Tipo | Descricao |
|--------|------|-----------|
| Data Inicial | Date | Inicio do periodo (padrao: 1 mes atras) |
| Data Final | Date | Fim do periodo (padrao: hoje) |

#### Procedimento

1. Defina o periodo
2. Clique em **"Filtrar"**
3. Resultados em tabela com:
   - Repositor
   - Rubricas de gasto com valores
   - Total por repositor
   - Total geral

#### Exportacao

- **Excel**: botao "Excel" para exportar em planilha
- **PDF**: botao "PDF" para exportar em documento
- Botoes aparecem apos carregar os dados

#### Detalhes

- Clique em um repositor para ver o detalhamento:
  - Despesas agrupadas por rubrica
  - Fotos dos comprovantes
  - Valores individuais e totais

---

## 6. Controles

### 6.1 Registro de Rota

**Menu:** Controles > Registro de Rota
**Objetivo:** Registrar visitas com check-in/checkout, foto e GPS

#### Campos obrigatorios

| Campo | Tipo | Descricao |
|-------|------|-----------|
| Repositor | Dropdown | Selecione o repositor |
| Data | Date | Data da visita (padrao: hoje) |

#### Fluxo completo

1. Selecione repositor e data
2. Clique em **"Carregar Roteiro"**
3. Lista de clientes do dia aparece organizada por cidade
4. Para cada cliente:
   - **Check-in**: abre modal com camera + GPS
   - **Atividades**: registra servicos realizados
   - **Checkout**: finaliza a visita com foto de saida
   - **Justificar**: marca visita como nao realizada com motivo

#### Modal de captura (Check-in/Checkout)

- **GPS**: chip indica status (verde=OK, amarelo=aguardando, vermelho=erro)
- **Camera**: preview ao vivo, botao "Capturar Foto"
- **Refazer**: botao "Nova Foto" para recapturar
- **Salvar**: habilitado apos captura + GPS
- **Campanha**: suporte a multiplas fotos (ate 10)

#### Aviso de clientes pendentes

- Se houver clientes de dias anteriores sem checkout, um alerta aparece no topo

---

### 6.2 Registro de Documentos

**Menu:** Controles > Registro de Documentos
**Objetivo:** Enviar documentos (PDF, fotos, planilhas) vinculados a um repositor e tipo

#### Campos

| Campo | Obrigatorio | Descricao |
|-------|-------------|-----------|
| Repositor | Sim | Selecione o repositor |
| Tipo de Documento | Sim | Tipo do documento |
| Arquivo | Sim | Selecione ou fotografe o documento |
| Observacao | Nao | Texto livre |

#### Opcoes de upload

- **Escolher arquivos**: seleciona do computador/celular
- **Anexar por foto**: abre a camera para fotografar

#### Fila de uploads

- Documentos enviados aparecem em uma fila de processamento
- Status: "Enviando...", "Concluido", "Erro"
- Arquivos rejeitados (formato invalido, tamanho excedido) sao listados separadamente

#### Tipo especial: Despesa de Viagem

Quando selecionado:
1. Area de **rubricas de gasto** aparece
2. Selecione a rubrica (Alimentacao, Combustivel, etc.)
3. Informe o valor
4. Anexe comprovante
5. Total calculado automaticamente
6. Envie com **"Enviar Documento"**

#### Limites

- Tamanho maximo por arquivo: **10 MB**
- Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, JPG, JPEG, PNG, WebP, HEIC

---

## 7. Performance

### 7.1 Performance de Visitas

**Menu:** Performance > Visitas
**Objetivo:** Analisar o desempenho dos repositores nas visitas

#### Filtros compartilhados

| Filtro | Descricao |
|--------|-----------|
| Repositor | Filtrar por repositor ou "Todos" |
| Data Inicio | Inicio do periodo |
| Data Fim | Fim do periodo |
| Tempo em Loja | Faixa de tempo (menos de 15min, 15-30min, 30-45min, 45-60min, mais de 1h) |

#### Abas de analise

**Aba 1 - Tempo de Atendimento:**
- Analisa o tempo medio de permanencia dos repositores nos clientes
- Filtro por faixa de tempo
- Cards com metricas por repositor

**Aba 2 - Analise de Servicos:**
- Analisa as atividades/servicos realizados durante as visitas
- Percentual de atividades completadas
- Servicos mais frequentes

**Aba 3 - Roteiro:**
- Identifica clientes visitados **fora do dia previsto** no roteiro
- Compara roteiro planejado x executado
- Ajuda a identificar desvios de rota

#### Procedimento

1. Preencha os filtros
2. Clique em **"Aplicar filtros"**
3. Navegue entre as abas para diferentes analises
4. **"Limpar"** para resetar filtros

---

### 7.2 Performance de Faturamento

**Menu:** Performance > Faturamento
**Objetivo:** Analisar o desempenho de faturamento dos repositores

#### Filtros

| Filtro | Descricao |
|--------|-----------|
| Repositor | Filtrar por repositor |
| Periodo | Data inicio e fim |

- Exibe metricas de faturamento por repositor
- Comparativos de periodos
- Graficos de evolucao

---

### 7.3 Historico de Performance

**Menu:** Performance > Historico
**Objetivo:** Visualizar snapshots mensais de performance dos repositores

- Exibe dados historicos consolidados mensalmente
- Permite comparar performance entre periodos
- Fechamento mensal automatico via sistema (node-cron)

---

## 8. Custos

### 8.1 Grid de Custos

**Menu:** Custos > Grid de Custos
**Objetivo:** Gerenciar e visualizar o grid de custos por repositor

- Tabela com custos operacionais por repositor
- Inclui valores de salario, transporte, alimentacao, etc.
- Totalizacoes por rubrica e por repositor

---

## 9. Configuracoes do Sistema

**Menu:** Configuracoes > Configuracoes do Sistema
**Objetivo:** Parametrizar todas as configuracoes do sistema

A tela de configuracoes e organizada em **abas**:
- No desktop: abas horizontais
- No mobile: dropdown de selecao

### 9.1 Geral

**Aba:** Geral

#### Validacao de Check-in

| Parametro | Descricao | Padrao |
|-----------|-----------|--------|
| Distancia maxima | Distancia maxima (km) permitida entre repositor e cliente para check-in | 30 km |

- Altere o valor e clique em **"Salvar Configuracoes"**
- Se o repositor estiver a mais de X km do cliente, o check-in sera alertado/bloqueado

---

### 9.2 Sessoes

**Aba:** Sessoes

#### Gerenciamento de sessoes abertas

- Visualiza e exclui sessoes de check-in sem checkout
- **Regra**: cada repositor deve ter no maximo 1 check-in aberto

#### Procedimento

1. Selecione o repositor no filtro (ou "Todos")
2. Clique em **"Carregar Sessoes Abertas"**
3. Lista de sessoes abertas com:
   - Repositor
   - Cliente
   - Data/hora do check-in
   - Tempo em aberto
4. Para fechar uma sessao travada, clique em **"Excluir"**

#### Quando usar

- Quando um repositor reclama que nao consegue fazer check-in
- Quando ha sessoes abertas de dias anteriores
- Para limpar sessoes de teste

---

### 9.3 Tipos de Documentos

**Aba:** Documentos

#### Gerenciar tipos

- Tabela com: Ordem, Codigo, Nome, Status, Acoes
- **"+ Novo Tipo"**: adiciona novo tipo de documento
- **Editar**: altera nome, codigo ou ordem
- **Ativar/Desativar**: controla visibilidade nos formularios

#### Campos do tipo de documento

| Campo | Descricao |
|-------|-----------|
| Codigo | Identificador unico (ex: NF, REC) |
| Nome | Nome exibido no dropdown (ex: Nota Fiscal) |
| Ordem | Posicao na lista |
| Status | Ativo ou Inativo |

---

### 9.4 Rubricas de Gasto

**Aba:** Rubricas

#### Gerenciar rubricas

- Tabela com: Ordem, Codigo, Nome, Status, Acoes
- **"+ Nova Rubrica"**: adiciona nova rubrica de gasto
- Usadas nas despesas de viagem dos repositores

#### Exemplos de rubricas

- Alimentacao
- Combustivel
- Hospedagem
- Pedagio
- Estacionamento

---

### 9.5 Coordenadas

**Aba:** Coordenadas (tambem acessivel via Manutencao de Coordenadas)

#### Gerenciar localizacao dos clientes

- Define latitude/longitude de cada cliente
- Usado para validacao de distancia no check-in

#### Filtros

| Filtro | Descricao |
|--------|-----------|
| Buscar Cliente | Codigo ou nome |
| Precisao | Todos, Aproximados, Manuais, Endereco Exato |

#### Procedimento

1. Busque o cliente
2. Clique em **"Editar"** para alterar coordenadas
3. Defina latitude e longitude manualmente
4. Salve as alteracoes

---

### 9.6 Usuarios

**Aba:** Usuarios

#### Gerenciar usuarios do sistema

- Lista de usuarios com: nome, username, perfil, status
- **Criar usuario**: vincula a um repositor ou cria independente
- **Resetar senha**: gera nova senha para o usuario
- **Ativar/Desativar**: controla acesso ao sistema

---

### 9.7 Controle de Acessos

**Aba:** Acessos

#### Configurar permissoes por pagina

- Lista todas as paginas/telas do sistema
- Para cada pagina, define:
  - **Liberado**: se esta acessivel
  - **Perfis permitidos**: quais perfis de usuario podem acessar
- Alteracoes aplicadas imediatamente apos salvar

---

### 9.8 Tipos de Espaco

**Aba:** Espacos

#### Gerenciar tipos de espaco

- Tabela com tipos cadastrados (ex: Gondola, Ponta de Gondola, Checkout)
- **"+ Novo Tipo"**: adiciona novo tipo
- **Editar**: altera nome ou status
- **Ativar/Desativar**: controla visibilidade

---

### 9.9 Sincronizacao

**Aba:** Sincronizacao

#### Configurar sincronizacao de dados

- Parametros de sincronizacao entre PWA e servidor
- Intervalo de verificacao
- Status da ultima sincronizacao
- Forcamento de sincronizacao manual

---

### 9.10 Atividades

**Aba:** Atividades

#### Gerenciar lista de atividades

- Configura as atividades que aparecem para os repositores registrarem durante as visitas
- Exemplos: Reposicao, Limpeza, Verificacao de Validade, Contagem de Estoque
- Ativar/desativar atividades conforme necessidade

---

## 10. Permissoes PWA

**Menu:** Configuracoes > Permissoes PWA
**Objetivo:** Gerenciar quais telas e funcionalidades estao disponiveis no aplicativo mobile (PWA) para cada perfil de usuario

- Lista de todas as paginas do sistema
- Toggle para habilitar/desabilitar no PWA
- Define o que os repositores veem no aplicativo mobile

---

## 11. Estrutura do Banco Comercial

**Menu:** Configuracoes > Estrutura Banco Comercial
**Objetivo:** Visualizar a estrutura do banco comercial (somente leitura)

- Exibe tabelas e campos do banco comercial
- Util para entender a estrutura de dados de clientes e representantes
- **Somente consulta** - nenhuma alteracao e feita neste banco

---

## 12. Padroes de Desenvolvimento

### Regra de carregamento sob demanda

- Telas de consulta **NAO carregam dados automaticamente** ao abrir
- O usuario deve preencher filtros e clicar no botao de busca
- Isso evita consumo desnecessario de requisicoes ao banco de dados
- Excecao: filtros de dropdown (listas de repositores, tipos) sao carregados automaticamente

### Telas que seguem este padrao

| Tela | Botao de busca |
|------|---------------|
| Consulta de Documentos | "Buscar Documentos" |
| Compra de Espaco | "Buscar" |
| Consulta de Visitas | "Consultar" |
| Consulta de Espacos | "Buscar Registros" |
| Manutencao de Rateio | "Filtrar" |
| Centralizacao | "Filtrar" |
| Cadastro de Repositor | Filtros automaticos |
| Performance | "Aplicar filtros" |

### Agrupamento de documentos

Na Consulta de Documentos:
- **Todos repositores + Todos tipos**: agrupamento duplo (repositor > tipo)
- **Todos repositores + Tipo especifico**: agrupamento por repositor
- **Repositor especifico**: lista plana

---

## 13. Arquitetura Tecnica

### Frontend (GitHub Pages)

```
public/
  index.html          - Pagina unica (SPA)
  manifest.json       - Configuracao PWA
  service-worker.js   - Cache e offline
  icon-512.png        - Icone do app
  css/
    style.css         - Estilos principais
    pwa.css           - Estilos mobile/PWA
  js/
    app.js            - Logica principal da aplicacao
    pages.js          - Definicao HTML de todas as paginas
    db.js             - Acesso ao banco de dados (Turso)
    utils.js          - Funcoes utilitarias
```

### Backend (Render)

```
backend/
  src/
    server.js         - Servidor Express
    routes/
      auth.js         - Autenticacao (login, JWT)
      documentos.js   - CRUD de documentos
      rateio.js       - Manutencao de rateio
    services/
      turso.js        - Servico de banco de dados
      auth.js         - Servico de autenticacao
  migrations/         - Scripts de migracao do banco
```

### Bancos de dados

| Banco | Tipo | Acesso | Conteudo |
|-------|------|--------|----------|
| Principal (mainClient) | Turso | Leitura/Escrita | Repositores, roteiros, visitas, documentos, rateios |
| Comercial (comercialClient) | Turso | Somente leitura | Clientes, representantes, supervisores |

### Fluxo de dados

```
Celular/Browser  →  GitHub Pages (frontend)  →  Render API (backend)  →  Turso DB
                                              →  Google Drive (fotos/docs)
```

### Seguranca

- Autenticacao via JWT token
- Tokens armazenados em localStorage
- Banco comercial: somente leitura (protegido por design)
- Controle de acesso por perfil de usuario
- Permissoes configuráveis por tela
