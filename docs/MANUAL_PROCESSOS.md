# Manual de Processos - Sistema de Repositores

Este manual descreve os processos principais do sistema para fins de treinamento.

---

## 1. Registro de Documentos

### Objetivo
Enviar anexos (PDF, Excel, Word, fotos) vinculados a um repositor e tipo de documento.

### Passo a passo
1. Acesse o menu **Documentos > Registro de Documentos**
2. Selecione o **Repositor** (obrigatorio)
3. Selecione o **Tipo de Documento** (obrigatorio)
4. Anexe os arquivos:
   - Clique em **Escolher arquivos** para selecionar do computador
   - Ou clique em **Anexar por foto** para usar a camera do dispositivo
5. (Opcional) Adicione uma **Observacao**
6. Clique em **Enviar Documento**
7. Acompanhe o progresso na fila de uploads

### Formatos aceitos
- PDF, Word (.doc, .docx), Excel (.xls, .xlsx)
- Imagens (JPEG, PNG, WebP, HEIC)
- Tamanho maximo por arquivo: configurado no sistema

### Tipo especial: Despesa de Viagem
Quando o tipo de documento for "Despesa de Viagem", campos adicionais aparecem para informar rubricas de gasto e seus respectivos comprovantes.

---

## 2. Consulta de Documentos

### Objetivo
Pesquisar, visualizar e baixar documentos enviados.

### Passo a passo
1. Acesse o menu **Documentos > Consulta de Documentos**
2. **A tela nao carrega dados automaticamente** - voce deve usar os filtros
3. Preencha os filtros desejados:
   - **Tipo de Documento**: selecione um tipo especifico ou "Todos os tipos"
   - **Repositor**: selecione um repositor especifico ou "Todos"
   - **Data Inicial / Data Final**: defina o periodo de busca
4. Clique em **Buscar Documentos**
5. Os resultados serao exibidos com agrupamento automatico:
   - Se "Todos" os repositores: resultados agrupados por repositor
   - Se "Todos" os repositores e "Todos os tipos": agrupados por repositor e por tipo
   - Se repositor especifico: lista plana

### Acoes disponiveis
- **Selecionar documentos**: marque os checkboxes individuais ou "Selecionar Todos"
- **Download individual**: clique no botao "Download" de cada documento
- **Download em lote**: selecione multiplos documentos e clique em "Download ZIP"
- **Mostrar Todos**: carrega todos os documentos sem filtro (usar com cautela)

---

## 3. Compra de Espaco

### Objetivo
Cadastrar e gerenciar clientes que possuem espacos contratados.

### Passo a passo
1. Acesse o menu **Espacos > Compra de Espaco**
2. **A tela nao carrega dados automaticamente** - voce deve usar os filtros
3. Preencha os filtros:
   - **Cidade**: digite o nome da cidade para filtrar
   - **Tipo de Espaco**: selecione o tipo desejado ou "Todos"
4. Clique em **Buscar** para visualizar os clientes
5. Para adicionar um novo cliente com espaco:
   - Clique em **+ Adicionar Cliente**
   - Preencha cidade, cliente, tipo de espaco, quantidade e vigencia
   - Clique em **Salvar**

### Acoes disponiveis
- **Editar quantidade**: altere a quantidade de espacos de um cliente
- **Inativar/Remover**: desative ou remova o espaco de um cliente

---

## 4. Consulta de Espacos

### Objetivo
Consultar registros de visitacao e fotos relacionados aos espacos contratados.

### Passo a passo
1. Acesse o menu **Espacos > Consulta de Espacos**
2. Preencha os filtros (repositor, tipo, cliente, periodo)
3. Clique em **Buscar Registros**
4. Visualize os resultados com fotos e status das visitas

---

## 5. Consulta de Visitas

### Objetivo
Consultar visitas realizadas pelos repositores, com detalhes de status e fotos.

### Passo a passo
1. Acesse o menu **Reposicao > Consulta de Visitas**
2. Selecione o **Repositor** e o **Periodo**
3. Clique em **Consultar**
4. Visualize as visitas com status (realizada, nao realizada, justificada)

---

## Regras Gerais

### Filtros obrigatorios
- Nas telas de consulta, pelo menos um filtro deve ser preenchido antes de buscar
- Os filtros de data sempre respeitam o periodo informado (data inicial e final)

### Performance
- As telas de consulta **nao carregam dados automaticamente** ao abrir
- Isso reduz o consumo de requisicoes ao banco de dados
- Sempre preencha os filtros antes de buscar para obter resultados mais rapidos e relevantes

### Agrupamento
- Na Consulta de Documentos, ao selecionar "Todos" os repositores, os documentos sao organizados automaticamente por repositor
- Se tambem "Todos os tipos" estiver selecionado, ha um segundo nivel de agrupamento por tipo de documento
