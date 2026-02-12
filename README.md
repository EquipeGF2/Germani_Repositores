# 🚀 Sistema de Repositores - GitHub Pages + Turso

Sistema web completo para gerenciar repositores e supervisores, hospedado no **GitHub Pages** e conectado diretamente ao **Turso Database**.

## 📋 Características

- ✅ **100% Estático**: Roda completamente no GitHub Pages (sem necessidade de servidor Node.js)
- ✅ **Conexão Direta**: Frontend conecta diretamente ao Turso Database via browser
- ✅ **Deploy Automático**: GitHub Actions cuida de tudo automaticamente
- ✅ **Seguro**: Credenciais injetadas durante o build (nunca expostas no código)
- ✅ **Moderno**: Interface responsiva e intuitiva

## 🏗️ Estrutura

```
Repositores/
├── .github/workflows/
│   └── deploy.yml           # GitHub Actions para deploy automático
├── public/
│   ├── index.html           # Interface principal
│   ├── css/style.css        # Estilos
│   └── js/
│       ├── db.js            # Cliente Turso para browser
│       ├── app.js           # Lógica da aplicação
│       └── turso-config.js  # Config (substituído no build)
├── scripts/
│   └── build-static.js      # Script de build que injeta secrets
└── package.json
```

## ⚙️ Configuração Inicial

### 1. Secrets do GitHub (✅ Já configurado!)

Você já configurou os seguintes secrets em **Settings > Secrets and variables > Actions**:

- `TURSO_MAIN_URL` - URL do banco principal
- `TURSO_MAIN_TOKEN` - Token do banco principal
- `TURSO_COMERCIAL_URL` - URL do banco comercial (opcional)
- `TURSO_COMERCIAL_TOKEN` - Token do banco comercial (opcional)

### 2. Habilitar GitHub Pages

Agora você precisa habilitar o GitHub Pages:

1. Vá em **Settings** do repositório
2. No menu lateral, clique em **Pages**
3. Em **Source**, selecione: **GitHub Actions**
4. Clique em **Save**

### 3. Deploy Automático

Assim que você fizer push para a branch, o GitHub Actions irá:

1. ✅ Instalar dependências
2. ✅ Injetar os secrets do GitHub no código
3. ✅ Gerar os arquivos estáticos
4. ✅ Fazer deploy no GitHub Pages

**URL do seu site**: `https://equipegf2.github.io/Repositores/`

## 🔄 Como Funciona

### Fluxo de Deploy

```
Push para GitHub
    ↓
GitHub Actions detecta push
    ↓
Executa build (npm run build:static)
    ↓
Injeta TURSO_* secrets no código
    ↓
Gera pasta /out com arquivos estáticos
    ↓
Deploy no GitHub Pages
    ↓
✅ Site no ar!
```

### Conexão com Turso

O frontend usa `@libsql/client/web` para conectar diretamente ao Turso:

```javascript
import { createClient } from 'https://esm.sh/@libsql/client@0.6.0/web';

const client = createClient({
  url: 'libsql://seu-banco.turso.io',
  authToken: 'seu-token'
});
```

As credenciais são injetadas automaticamente durante o build pelo GitHub Actions.

## 📊 Funcionalidades

### Cadastros
- ✅ Cadastro de Repositores
- ✅ Edição e exclusão de registros

### Banco de Dados
- ✅ Tabela `cad_repositor`
- ✅ Schema criado automaticamente na primeira conexão
- 🧹 Limpeza automática da tabela `cad_supervisor` e da coluna obsoleta `repo_supervisor` via migração

### Reposição (Em desenvolvimento)
- Resumo do Período
- Resumo Mensal
- Relatório Detalhado
- Análise Gráfica
- Alterações de Rota

### Autenticação
- Login único no Dashboard Germani Alimentos, com compartilhamento automático para o módulo Repositores via `localStorage` (`GERMANI_AUTH_USER`).
- Consulte `docs/AUTENTICACAO.md` para detalhes de integração.

## 🛡️ Segurança

### ✅ O que está protegido:
- Credenciais NUNCA aparecem no código fonte
- Secrets injetados apenas durante o build
- Tokens não são commitados no repositório

### ⚠️ Importante entender:
- Os tokens Turso ficam embutidos nos arquivos JavaScript após o build
- Qualquer pessoa pode ver os tokens inspecionando o código da página
- **Recomendação**: Use tokens Turso com permissões limitadas

### 🔒 Para máxima segurança:

Se você precisar de segurança adicional, considere:
1. Criar uma API intermediária (Next.js/Vercel)
2. Usar tokens Turso com permissões somente leitura
3. Implementar autenticação de usuários

## 🚀 Desenvolvimento Local

Para testar localmente:

1. Crie `public/js/turso-config.local.js`:
```javascript
export const TURSO_CONFIG = {
  main: {
    url: 'libsql://seu-banco-principal.turso.io',
    authToken: 'seu-token-principal'
  },
  comercial: {
    url: '',
    authToken: ''
  }
};
```

2. Atualize `public/js/db.js` para importar do arquivo local:
```javascript
import { TURSO_CONFIG } from './turso-config.local.js';
```

3. Abra `public/index.html` diretamente no navegador

## 📝 Comandos

```bash
# Instalar dependências
npm install

# Build estático (com secrets do ambiente)
npm run build:static

# Desenvolvimento com Next.js (legado)
npm run dev
```

## 🔧 Troubleshooting

### GitHub Actions falha no build
- Verifique se os secrets estão configurados corretamente
- Certifique-se que `TURSO_MAIN_URL` e `TURSO_MAIN_TOKEN` existem

### Página não carrega no GitHub Pages
- Vá em **Settings > Pages** e verifique se está configurado para **GitHub Actions**
- Aguarde alguns minutos após o deploy
- Verifique o log do GitHub Actions para erros

### Erro de conexão com Turso
- Verifique se os tokens Turso são válidos
- Confirme que a URL está no formato correto: `libsql://nome.turso.io`
- Teste a conexão localmente primeiro

## 📚 Próximos Passos

Agora que o banco está integrado, você pode:

1. ✅ Desenvolver as telas de cadastro
2. ✅ Implementar as funcionalidades de reposição
3. ✅ Adicionar validações nos formulários
4. ✅ Criar relatórios e gráficos
5. ✅ Melhorar a UX/UI

## Padroes de Desenvolvimento

### Telas de Consulta - Carregamento sob Demanda

Todas as telas de consulta seguem o padrao de **nao carregar dados automaticamente** ao abrir a pagina. Isso evita consumo desnecessario de requisicoes ao banco de dados.

**Regras:**

1. Ao abrir a tela, apenas os filtros (dropdowns, selects) sao carregados
2. Um estado vazio instrui o usuario a preencher os filtros e clicar em "Buscar"
3. Os dados sao buscados **somente** apos o usuario clicar no botao de busca
4. Filtros obrigatorios devem ser validados antes da busca

**Telas que seguem este padrao:**

| Tela | Filtros | Botao |
|------|---------|-------|
| Consulta de Documentos | Tipo, Repositor, Data Inicial, Data Final | "Buscar Documentos" |
| Compra de Espaco | Cidade, Tipo de Espaco | "Buscar" |
| Consulta de Espacos | Repositor, Tipo, Cliente, Data | "Buscar Registros" |
| Consulta de Visitas | Repositor, Cliente, Status, Data | "Consultar" |

### Agrupamento de Documentos

Na Consulta de Documentos, os resultados sao agrupados automaticamente:

- **Todos os repositores + Todos os tipos**: Agrupamento duplo (repositor > tipo de documento)
- **Todos os repositores + Tipo especifico**: Agrupamento por repositor
- **Repositor especifico**: Lista plana (sem agrupamento)

### Documentacao Complementar

- `docs/MANUAL_MOBILE.md` - **Manual do Aplicativo Mobile** - Passo a passo completo para repositores (operadores de campo)
- `docs/MANUAL_WEB.md` - **Documentacao Completa do Sistema Web** - Todos os modulos, processos, cadastros, consultas, performance e configuracoes
- `docs/MANUAL_PROCESSOS.md` - Manual de processos para treinamento
- `docs/AUTENTICACAO.md` - Detalhes de autenticacao
- `docs/CONFIGURACAO_API.md` - Configuracao da API backend
- `docs/GESTAO_USUARIOS.md` - Gestao de usuarios

## 🤝 Contribuindo

1. Faca suas alteracoes
2. Commit e push para a branch
3. GitHub Actions fara o deploy automaticamente
4. Acesse sua URL do GitHub Pages para ver as mudancas

## 📄 Licença

Projeto privado - EquipeGF2
