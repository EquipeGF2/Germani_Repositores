# Manual do Aplicativo Mobile - Sistema de Repositores Germani

**Versao:** 1.0
**Publico-alvo:** Repositores (operadores de campo)
**Plataforma:** Celular Android/iOS (aplicativo PWA)

---

## Sumario

1. [Instalacao do Aplicativo](#1-instalacao-do-aplicativo)
2. [Login e Acesso](#2-login-e-acesso)
3. [Tela Inicial e Navegacao](#3-tela-inicial-e-navegacao)
4. [Registro de Rota (Visitas)](#4-registro-de-rota-visitas)
   - 4.1 [Carregar Roteiro do Dia](#41-carregar-roteiro-do-dia)
   - 4.2 [Iniciar Visita (Check-in)](#42-iniciar-visita-check-in)
   - 4.3 [Capturar Foto e GPS](#43-capturar-foto-e-gps)
   - 4.4 [Registrar Atividades na Visita](#44-registrar-atividades-na-visita)
   - 4.5 [Finalizar Visita (Checkout)](#45-finalizar-visita-checkout)
   - 4.6 [Visita Nao Realizada (Justificativa)](#46-visita-nao-realizada-justificativa)
   - 4.7 [Campanha com Multiplas Fotos](#47-campanha-com-multiplas-fotos)
5. [Registro de Documentos](#5-registro-de-documentos)
   - 5.1 [Enviar Documento pelo Celular](#51-enviar-documento-pelo-celular)
   - 5.2 [Anexar Foto como Documento](#52-anexar-foto-como-documento)
   - 5.3 [Despesa de Viagem](#53-despesa-de-viagem)
6. [Consulta de Visitas](#6-consulta-de-visitas)
7. [Consulta de Documentos](#7-consulta-de-documentos)
8. [Pesquisas](#8-pesquisas)
9. [Sincronizacao e Modo Offline](#9-sincronizacao-e-modo-offline)
10. [Solucao de Problemas](#10-solucao-de-problemas)

---

## 1. Instalacao do Aplicativo

O sistema funciona como um aplicativo web progressivo (PWA). Ele pode ser instalado diretamente no celular sem precisar da loja de aplicativos.

### No Android (Chrome)

1. Abra o **Google Chrome** no celular
2. Acesse o endereco do sistema fornecido pela empresa
3. Aguarde a pagina carregar completamente
4. Toque nos **tres pontos** (menu) no canto superior direito
5. Selecione **"Instalar aplicativo"** ou **"Adicionar a tela inicial"**
6. Confirme tocando em **"Instalar"**
7. O icone do aplicativo aparecera na tela inicial do celular

### No iPhone (Safari)

1. Abra o **Safari** no iPhone
2. Acesse o endereco do sistema fornecido pela empresa
3. Toque no **icone de compartilhamento** (quadrado com seta para cima)
4. Role para baixo e toque em **"Adicionar a Tela de Inicio"**
5. Confirme tocando em **"Adicionar"**
6. O icone aparecera na tela inicial como um aplicativo

### Importante

- O aplicativo precisa de internet para funcionar
- Apos instalado, abra sempre pelo icone na tela inicial
- Nao e necessario atualizar manualmente - o app atualiza sozinho

---

## 2. Login e Acesso

### Primeiro acesso

1. Abra o aplicativo tocando no icone na tela inicial
2. A tela de login sera exibida com o logo da Germani Alimentos
3. Preencha:
   - **Usuario**: seu codigo de repositor (fornecido pelo supervisor)
   - **Senha**: senha fornecida pelo supervisor
4. Toque em **"Entrar"**
5. Se os dados estiverem corretos, voce sera direcionado para a tela inicial

### Em caso de erro no login

- Verifique se o usuario e a senha estao corretos (letras maiusculas/minusculas importam)
- Verifique se o celular esta conectado a internet
- Caso esqueca a senha, entre em contato com o supervisor

### Logout (Sair)

- Para sair do aplicativo, procure a opcao de logout no canto superior direito da tela

---

## 3. Tela Inicial e Navegacao

### Menu lateral

- No canto superior esquerdo, toque no icone de **menu** (tres linhas horizontais) para abrir o menu lateral
- O menu mostra todas as opcoes disponiveis para voce
- Toque em qualquer item para navegar ate a tela desejada
- Toque fora do menu ou no **X** para fechar

### Opcoes principais para o repositor

| Menu | Item | Para que serve |
|------|------|---------------|
| Controles | **Registro de Rota** | Registrar visitas aos clientes (check-in/checkout com foto e GPS) |
| Controles | **Registro de Documentos** | Enviar documentos e comprovantes |
| Consultas | **Consulta de Visitas** | Ver historico das suas visitas |
| Consultas | **Consulta de Documentos** | Ver documentos enviados |

### Indicadores na tela

- **"Sistema Online"**: o sistema esta conectado e funcionando
- **Icone de sincronizacao**: mostra se ha dados pendentes para enviar

---

## 4. Registro de Rota (Visitas)

Esta e a funcionalidade principal do aplicativo. Use-a todos os dias para registrar suas visitas aos clientes.

### 4.1 Carregar Roteiro do Dia

1. No menu lateral, toque em **Controles > Registro de Rota**
2. Na tela que abrir:
   - **Repositor**: selecione seu nome na lista (se nao estiver pre-selecionado)
   - **Data**: a data de hoje ja vem preenchida automaticamente. Altere apenas se necessario
3. Toque no botao **"Carregar Roteiro"**
4. O sistema carregara a lista de clientes que voce deve visitar no dia
5. Os clientes serao exibidos organizados por **cidade**

### Entendendo a lista de clientes

Cada cliente exibe:
- **Nome/codigo** do cliente
- **Status**: indica se a visita ja foi iniciada, finalizada ou esta pendente
- **Botoes de acao**: para iniciar check-in, registrar atividades ou justificar

### Status possiveis

| Status | Significado |
|--------|------------|
| Pendente | Visita ainda nao iniciada |
| Em atendimento | Check-in realizado, checkout pendente |
| Finalizado | Visita completa (check-in + checkout realizados) |
| Nao realizado | Visita justificada como nao realizada |

---

### 4.2 Iniciar Visita (Check-in)

1. Na lista de clientes do roteiro, localize o cliente que voce vai visitar
2. Toque no botao **"Check-in"** do cliente
3. O modal de captura sera aberto mostrando:
   - **Badge "CHECKIN"** no topo
   - **Nome do cliente** abaixo
   - **Status do GPS** (chip verde/amarelo/vermelho)
   - **Area da camera** para capturar a foto

### Permissoes necessarias

- Na primeira vez, o celular pedira permissao para:
  - **Camera**: toque em **"Permitir"** (obrigatorio para fotos)
  - **Localizacao/GPS**: toque em **"Permitir"** (obrigatorio para validar a posicao)
- Se voce negar essas permissoes, nao sera possivel fazer o check-in

---

### 4.3 Capturar Foto e GPS

1. Apos abrir o modal de captura, aguarde:
   - A **camera** ligar (preview aparece na tela)
   - O **GPS** obter sua localizacao (chip muda para verde com "GPS OK")

2. **Capturar foto**:
   - Posicione o celular apontando para a fachada da loja ou gondola
   - Toque no botao **"Capturar Foto"**
   - A imagem capturada aparecera na tela

3. **Refazer foto** (se necessario):
   - Se a foto ficou ruim, toque em **"Nova Foto"**
   - Capture novamente

4. **Salvar visita**:
   - Apos capturar a foto, o botao **"Salvar Visita"** ficara habilitado (deixa de ficar cinza)
   - Toque em **"Salvar Visita"**
   - Aguarde a mensagem de confirmacao

### Indicador de GPS

| Cor do chip | Significado |
|-------------|------------|
| Verde - "GPS OK" | Localizacao obtida com precisao |
| Amarelo - "GPS aguardando" | Obtendo localizacao, aguarde |
| Vermelho - "GPS indisponivel" | Nao foi possivel obter GPS |

### Dicas para o GPS

- Esteja em local aberto para melhor sinal GPS
- Aguarde o chip ficar verde antes de capturar a foto
- Se o GPS nao funcionar, verifique se a localizacao esta ativada nas configuracoes do celular

---

### 4.4 Registrar Atividades na Visita

Apos fazer o check-in, voce pode registrar as atividades realizadas no cliente.

1. Na lista de clientes, localize o cliente com status **"Em atendimento"**
2. Toque no botao **"Atividades"** (azul)
3. O modal de atividades sera aberto mostrando:
   - Lista de atividades possiveis (checkboxes)
   - Campos de observacao
4. Marque as atividades que voce realizou:
   - Reposicao de produtos
   - Verificacao de validade
   - Limpeza de gondola
   - Outras atividades conforme configuracao
5. Toque em **"Salvar"** para registrar as atividades

### Importante

- As atividades sao opcionais, mas recomendadas
- Voce pode salvar atividades multiplas vezes durante a visita
- As atividades ficam vinculadas a sessao do check-in

---

### 4.5 Finalizar Visita (Checkout)

1. Na lista de clientes, localize o cliente com status **"Em atendimento"**
2. Toque no botao **"Checkout"**
3. O modal de captura sera aberto novamente, agora com:
   - **Badge "CHECKOUT"** no topo
   - **Resumo das atividades** realizadas (se houver)
   - **Area da camera** para foto de saida
4. Capture a foto de checkout
5. Toque em **"Salvar Visita"**
6. O status do cliente mudara para **"Finalizado"**

### Resumo de atividades no checkout

- No checkout, um resumo das atividades registradas e exibido
- Toque em **"Mostrar"** para expandir o resumo
- Isso ajuda a conferir se tudo foi registrado antes de finalizar

---

### 4.6 Visita Nao Realizada (Justificativa)

Se voce nao conseguir visitar um cliente do roteiro:

1. Na lista de clientes, localize o cliente pendente
2. Toque no botao de **justificativa** (ou "Nao visitado")
3. Selecione o motivo da nao visita:
   - Loja fechada
   - Cliente sem estoque
   - Problema de acesso
   - Outro motivo
4. (Opcional) Adicione uma observacao explicando
5. Toque em **"Salvar"**
6. O status do cliente mudara para **"Nao realizado"**

### Importante

- Justifique sempre que nao realizar uma visita prevista
- O supervisor pode ver as justificativas na consulta de visitas

---

### 4.7 Campanha com Multiplas Fotos

Em periodos de campanha, pode ser necessario enviar multiplas fotos de um mesmo cliente.

1. Ao fazer check-in em um cliente com campanha ativa:
   - O aviso **"Max 10 fotos"** aparece no topo
   - A galeria de fotos fica visivel abaixo da camera
2. Capture a primeira foto normalmente
3. Toque em **"Capturar Foto"** novamente para adicionar mais fotos
4. O contador de fotos mostra quantas foram capturadas: **"Fotos: 3"**
5. Visualize as miniaturas na galeria abaixo
6. Quando terminar, toque em **"Salvar Visita"**

### Limite de fotos

- Maximo de **10 fotos** por registro de campanha
- Cada foto e enviada automaticamente para o servidor

---

## 5. Registro de Documentos

Use esta funcionalidade para enviar comprovantes, notas fiscais e outros documentos.

### 5.1 Enviar Documento pelo Celular

1. No menu lateral, toque em **Controles > Registro de Documentos**
2. Preencha os campos:
   - **Repositor**: selecione seu nome
   - **Tipo de Documento**: selecione o tipo (Nota Fiscal, Comprovante, etc.)
3. Toque em **"Escolher arquivos"** para selecionar um arquivo do celular
   - O celular abrira o gerenciador de arquivos
   - Selecione o documento desejado (PDF, Word, Excel ou Imagem)
4. (Opcional) Adicione uma **Observacao**
5. Toque em **"Enviar Documento"**
6. Acompanhe o envio na **fila de uploads** abaixo do formulario

### Formatos aceitos

| Tipo | Extensoes |
|------|-----------|
| PDF | .pdf |
| Word | .doc, .docx |
| Excel | .xls, .xlsx |
| Imagens | .jpg, .jpeg, .png, .webp, .heic |

### Tamanho maximo

- Cada arquivo pode ter no maximo **10 MB**
- Arquivos maiores serao rejeitados com uma mensagem de erro

---

### 5.2 Anexar Foto como Documento

1. Na tela de Registro de Documentos, toque no botao **"Anexar por foto"**
2. A camera do celular sera aberta
3. Fotografe o documento (nota fiscal, recibo, etc.)
4. A foto sera adicionada automaticamente ao formulario
5. Preencha o tipo de documento e clique em **"Enviar Documento"**

### Dicas para fotos de documentos

- Posicione o documento em superficie plana e bem iluminada
- Enquadre todo o documento na foto
- Evite sombras e reflexos
- Verifique se o texto esta legivel antes de enviar

---

### 5.3 Despesa de Viagem

Quando o tipo de documento for **"Despesa de Viagem"**, campos adicionais aparecem:

1. Selecione **"Despesa de Viagem"** no tipo de documento
2. A area de **rubricas de gasto** aparecera
3. Para cada gasto:
   - Selecione a **rubrica** (Alimentacao, Combustivel, Hospedagem, etc.)
   - Informe o **valor** em reais
   - Anexe o **comprovante** (foto ou arquivo)
4. O **total** das despesas e calculado automaticamente
5. Toque em **"Enviar Documento"**

---

## 6. Consulta de Visitas

Para ver o historico das suas visitas:

1. No menu lateral, toque em **Consultas > Consulta de Visitas**
2. Preencha os filtros:
   - **Repositor**: selecione seu nome
   - **Cliente**: (opcional) selecione um cliente especifico
   - **Status**: filtre por "Todos", "Em atendimento" ou "Finalizado"
   - **Data Inicio / Data Fim**: defina o periodo
3. Toque em **"Consultar"**
4. Os resultados exibem:
   - Nome do cliente
   - Data e hora do check-in/checkout
   - Status da visita
   - Tempo de permanencia na loja
   - Fotos capturadas

### Limpar filtros

- Toque em **"Limpar"** para resetar todos os filtros e fazer nova consulta

---

## 7. Consulta de Documentos

Para ver documentos enviados:

1. No menu lateral, toque em **Consultas > Consulta de Documentos**
2. **A tela nao carrega dados automaticamente** - use os filtros
3. Preencha os filtros:
   - **Tipo de Documento**: selecione um tipo ou "Todos os tipos"
   - **Repositor**: selecione seu nome ou "Todos"
   - **Data Inicial / Data Final**: defina o periodo
4. Toque em **"Buscar Documentos"**
5. Os resultados mostram:
   - Nome do arquivo
   - Tipo de documento
   - Data de referencia
   - Botao de download

### Download de documentos

- Toque em **"Download"** ao lado de cada documento para baixar
- Para baixar varios documentos de uma vez:
  1. Marque os checkboxes dos documentos desejados
  2. Ou marque **"Selecionar Todos"**
  3. Toque em **"Download ZIP"**

---

## 8. Pesquisas

Durante as visitas, pesquisas podem aparecer para voce responder.

### Responder pesquisa durante a visita

1. Ao fazer check-in em um cliente com pesquisa ativa:
   - Um aviso de pesquisa pendente aparecera
2. Toque para abrir a pesquisa
3. Responda as perguntas:
   - **Texto**: digite a resposta
   - **Selecao**: escolha uma opcao da lista
   - **Numero**: digite um valor numerico
   - **Sim/Nao**: toque na opcao correspondente
   - **Foto**: capture uma foto se solicitado
4. Toque em **"Enviar Respostas"**

### Pesquisas obrigatorias

- Pesquisas marcadas como **obrigatorias** devem ser respondidas para concluir a visita
- Se a pesquisa exigir foto, voce devera capturar a foto antes de enviar

---

## 9. Sincronizacao e Modo Offline

### Indicador de sincronizacao

- No canto superior da tela, o indicador mostra o status:
  - **"Sincronizado"**: todos os dados foram enviados
  - **"Pendente"**: ha dados aguardando envio
  - **"Offline"**: sem conexao com internet

### Sincronizar manualmente

- Toque no botao de **sincronizacao** (icone de setas circulares) para forcar o envio dos dados pendentes
- O sistema tenta sincronizar automaticamente quando a internet retornar

### Dicas de conectividade

- Sempre que possivel, mantenha o WiFi ou dados moveis ativados
- Se estiver em area sem sinal, as visitas registradas serao salvas localmente
- Quando a internet retornar, os dados serao enviados automaticamente

---

## 10. Solucao de Problemas

### A camera nao abre

1. Verifique se voce deu permissao de camera ao aplicativo
2. No celular, va em **Configuracoes > Apps > Chrome > Permissoes > Camera > Permitir**
3. Feche e reabra o aplicativo

### O GPS nao funciona

1. Verifique se a localizacao esta ativada no celular
2. No celular, va em **Configuracoes > Localizacao > Ativar**
3. Certifique-se de estar em local aberto (GPS funciona melhor ao ar livre)
4. Aguarde ate 30 segundos para o GPS obter precisao
5. Se continuar com problemas, reinicie o celular

### Erro ao salvar visita

1. Verifique se capturou a foto (botao "Salvar Visita" deve estar habilitado)
2. Verifique a conexao com internet
3. Se o erro persistir, feche o modal e tente novamente
4. Em ultimo caso, reinicie o aplicativo

### Tela travada ou lenta

1. Feche o aplicativo completamente
2. Reabra pelo icone na tela inicial
3. Se persistir, limpe o cache do navegador:
   - **Android**: Configuracoes > Apps > Chrome > Armazenamento > Limpar cache
   - **iPhone**: Configuracoes > Safari > Limpar Dados de Sites

### Documento nao envia

1. Verifique se o arquivo tem menos de **10 MB**
2. Verifique se o formato e aceito (PDF, Word, Excel, Imagens)
3. Verifique a conexao com internet
4. Tente novamente apos alguns minutos

### Esqueci minha senha

- Entre em contato com seu supervisor
- O supervisor pode redefinir sua senha nas configuracoes do sistema

### O aplicativo nao aparece como instalavel

1. Certifique-se de estar usando o **Google Chrome** (Android) ou **Safari** (iPhone)
2. Acesse o endereco completo do sistema
3. Aguarde a pagina carregar completamente
4. Tente novamente a opcao de instalar/adicionar a tela inicial

---

## Resumo Rapido - Dia a Dia do Repositor

### Rotina diaria recomendada

1. **Inicio do dia**:
   - Abra o aplicativo
   - Toque em **Registro de Rota**
   - Carregue o roteiro do dia
   - Confirme os clientes a visitar

2. **Em cada cliente**:
   - Toque em **Check-in** ao chegar
   - Capture a foto da loja/gondola
   - Salve o check-in
   - Realize as atividades de reposicao
   - Registre as atividades no app (botao "Atividades")
   - Ao terminar, toque em **Checkout**
   - Capture a foto de saida e salve

3. **Durante o dia**:
   - Se nao visitar um cliente, registre a justificativa
   - Se precisar enviar um documento, use **Registro de Documentos**
   - Responda pesquisas que aparecerem durante as visitas

4. **Final do dia**:
   - Verifique se todos os clientes do roteiro foram atendidos ou justificados
   - Verifique se o indicador mostra **"Sincronizado"**
   - Se houver pendencias, toque no botao de sincronizacao

---

**Duvidas?** Entre em contato com seu supervisor ou com a equipe de suporte.
