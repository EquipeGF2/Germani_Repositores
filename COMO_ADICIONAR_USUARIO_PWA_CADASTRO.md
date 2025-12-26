# Como Adicionar "Criar Usuário PWA" no Cadastro de Repositor

## Objetivo

Adicionar um checkbox "Criar acesso PWA" no formulário de cadastro de repositor que, quando marcado, cria automaticamente um usuário na tabela `cc_usuarios` vinculado ao repositor.

---

## Passo 1: Modificar o Frontend (Página de Cadastro)

### Localização
`public/js/pages.js` - Procure pela seção de cadastro de repositor

### Adicionar Checkbox no Formulário

Encontre o formulário de cadastro de repositor e adicione antes do botão salvar:

```html
<!-- Adicionar antes dos botões de ação -->
<div class="form-row">
    <label>
        <input type="checkbox" id="criarUsuarioPWA" name="criarUsuarioPWA">
        <span>Criar usuário para acesso PWA</span>
    </label>
    <small>Se marcado, será criado um usuário automaticamente para este repositor acessar o PWA</small>
</div>

<div id="dadosUsuarioPWA" style="display: none; margin-top: 1rem; padding: 1rem; background: #f3f4f6; border-radius: 6px;">
    <h4>Credenciais PWA</h4>

    <div class="form-group">
        <label for="usuarioPWA">Usuário (login)</label>
        <input type="text" id="usuarioPWA" readonly>
        <small>Gerado automaticamente a partir do nome</small>
    </div>

    <div class="form-group">
        <label for="senhaPWA">Senha</label>
        <input type="text" id="senhaPWA" value="">
        <small>Deixe em branco para gerar automaticamente: [nome]123</small>
    </div>
</div>
```

### Adicionar JavaScript para mostrar/ocultar campos

```javascript
// No event handler do checkbox
document.getElementById('criarUsuarioPWA')?.addEventListener('change', (e) => {
    const dadosDiv = document.getElementById('dadosUsuarioPWA');
    const nomeInput = document.getElementById('repo_nome');
    const usuarioInput = document.getElementById('usuarioPWA');

    if (e.target.checked) {
        dadosDiv.style.display = 'block';

        // Gerar username automaticamente quando nome mudar
        if (nomeInput) {
            const gerarUsername = () => {
                const nome = nomeInput.value;
                const username = nome
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_]/g, '')
                    .substring(0, 30);

                usuarioInput.value = username;
            };

            gerarUsername();
            nomeInput.addEventListener('input', gerarUsername);
        }
    } else {
        dadosDiv.style.display = 'none';
    }
});
```

---

## Passo 2: Modificar o Backend (API de Cadastro)

### Localização
Procure o endpoint que cria repositores (provavelmente em `backend/src/routes/repositores.js` ou similar)

### Adicionar Lógica de Criação de Usuário

```javascript
import { authService } from '../services/auth.js';

// No endpoint POST /api/repositores
router.post('/', async (req, res) => {
    try {
        const { repo_nome, criarUsuarioPWA, usuarioPWA, senhaPWA, ...outrosDados } = req.body;

        // 1. Criar repositor normalmente
        const novoRepositor = await tursoService.criarRepositor({
            repo_nome,
            ...outrosDados
        });

        const rep_id = novoRepositor.rep_id;

        // 2. Se checkbox marcado, criar usuário PWA
        if (criarUsuarioPWA) {
            try {
                // Username: usar o fornecido ou gerar automaticamente
                const username = usuarioPWA || repo_nome
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_]/g, '')
                    .substring(0, 30);

                // Senha: usar a fornecida ou gerar automaticamente
                const primeiraPalavra = repo_nome.split(' ')[0].toLowerCase();
                const senha = senhaPWA || `${primeiraPalavra}123`;

                // Hash da senha
                const passwordHash = await authService.hashPassword(senha);

                // Criar usuário
                await tursoService.criarUsuario({
                    username,
                    passwordHash,
                    nomeCompleto: repo_nome,
                    email: null,
                    repId: rep_id,
                    perfil: 'repositor'
                });

                console.log(`✅ Usuário PWA criado para ${repo_nome}: ${username}`);

                return res.status(201).json({
                    ok: true,
                    repositor: novoRepositor,
                    usuarioPWA: {
                        username,
                        senha // Retornar senha para mostrar ao admin
                    },
                    message: 'Repositor e usuário PWA criados com sucesso'
                });

            } catch (userError) {
                // Se falhar ao criar usuário, avisar mas não falhar a criação do repositor
                console.error('Erro ao criar usuário PWA:', userError);

                return res.status(201).json({
                    ok: true,
                    repositor: novoRepositor,
                    warning: 'Repositor criado, mas falhou ao criar usuário PWA',
                    error: userError.message
                });
            }
        }

        // 3. Se não criar usuário, retornar sucesso simples
        return res.status(201).json({
            ok: true,
            repositor: novoRepositor,
            message: 'Repositor criado com sucesso'
        });

    } catch (error) {
        console.error('Erro ao criar repositor:', error);
        return res.status(500).json({
            ok: false,
            message: 'Erro ao criar repositor',
            error: error.message
        });
    }
});
```

---

## Passo 3: Mostrar Credenciais Criadas

### No Frontend - Após Salvar com Sucesso

```javascript
// Após receber resposta do servidor
if (data.usuarioPWA) {
    alert(`
        Repositor criado com sucesso!

        Credenciais PWA criadas:
        Usuário: ${data.usuarioPWA.username}
        Senha: ${data.usuarioPWA.senha}

        ⚠️ IMPORTANTE: Anote essas credenciais!
        O repositor usará essas credenciais para acessar o PWA no celular.
    `);
}
```

Ou melhor, criar um modal bonito:

```javascript
function mostrarCredenciaisPWA(username, senha) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>✅ Usuário PWA Criado!</h3>

            <div style="background: #f0fdf4; padding: 1rem; border-radius: 6px; margin: 1rem 0;">
                <p><strong>Usuário:</strong> <code>${username}</code></p>
                <p><strong>Senha:</strong> <code>${senha}</code></p>
            </div>

            <p style="color: #dc2626;">
                ⚠️ IMPORTANTE: Anote essas credenciais!
                <br>
                O repositor usará esses dados para acessar o PWA no celular.
            </p>

            <button onclick="this.closest('.modal').remove()" class="btn-primary">
                Entendi
            </button>
        </div>
    `;

    document.body.appendChild(modal);
}
```

---

## Passo 4: Adicionar Indicador Visual

### Na Lista de Repositores

Adicione um ícone/badge para mostrar quais repositores têm usuário PWA:

```javascript
// Na renderização da lista
const temUsuarioPWA = await verificarSeTemUsuarioPWA(rep_id);

if (temUsuarioPWA) {
    return `
        <tr>
            <td>${rep_id}</td>
            <td>
                ${repo_nome}
                <span class="badge badge-success" title="Tem acesso PWA">📱 PWA</span>
            </td>
            ...
        </tr>
    `;
}
```

### Criar Endpoint para Verificar

```javascript
// Backend - GET /api/repositores/:id/tem-usuario-pwa
router.get('/:id/tem-usuario-pwa', async (req, res) => {
    try {
        const { id } = req.params;

        const usuario = await tursoService.execute(
            'SELECT usuario_id FROM cc_usuarios WHERE rep_id = ? AND ativo = 1',
            [id]
        );

        return res.json({
            ok: true,
            temUsuario: usuario.rows.length > 0,
            usuarioId: usuario.rows[0]?.usuario_id
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});
```

---

## Passo 5: Edição de Repositor

### Permitir Criar Usuário Posteriormente

Se o repositor já existe mas não tem usuário PWA, permitir criar:

```javascript
// No formulário de edição, verificar se já tem usuário
const response = await fetch(`/api/repositores/${rep_id}/tem-usuario-pwa`);
const { temUsuario } = await response.json();

if (!temUsuario) {
    // Mostrar checkbox "Criar usuário PWA"
    document.getElementById('criarUsuarioPWA').disabled = false;
} else {
    // Já tem usuário, mostrar informação
    document.getElementById('infoPWA').innerHTML = `
        <div class="alert alert-info">
            ✅ Este repositor já possui acesso PWA configurado
        </div>
    `;
}
```

---

## Resumo do Fluxo

1. Admin acessa "Cadastro de Repositor"
2. Preenche dados do repositor normalmente
3. Marca checkbox "Criar acesso PWA"
4. Sistema gera automaticamente:
   - Username: baseado no nome (ex: `joao_silva`)
   - Senha: primeira palavra + 123 (ex: `joao123`)
5. Admin pode editar username/senha antes de salvar
6. Ao salvar:
   - Repositor é criado na tabela `cc_repositor`
   - Usuário é criado na tabela `cc_usuarios`
   - Credenciais são exibidas em modal
7. Admin anota e passa credenciais para o repositor
8. Repositor acessa PWA no celular com essas credenciais

---

## Segurança

1. **Senhas padrão fracas**: Oriente a trocar no primeiro login
2. **Armazenar credenciais**: Não guardar senhas em texto puro
3. **Validação**: Verificar se username já existe antes de criar
4. **Permissões**: Apenas admin pode criar usuários

---

## Testes

1. Criar novo repositor COM checkbox marcado
2. Verificar se usuário foi criado em `cc_usuarios`
3. Testar login no PWA com as credenciais
4. Criar repositor SEM checkbox marcado
5. Verificar que não criou usuário
6. Editar repositor e criar usuário posteriormente
