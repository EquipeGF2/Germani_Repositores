const fs = require('fs');
const path = require('path');

// Validar variáveis de ambiente
const TURSO_MAIN_URL = process.env.TURSO_MAIN_URL;
const TURSO_MAIN_TOKEN = process.env.TURSO_MAIN_TOKEN;
const TURSO_COMERCIAL_URL = process.env.TURSO_COMERCIAL_URL || '';
const TURSO_COMERCIAL_TOKEN = process.env.TURSO_COMERCIAL_TOKEN || '';

if (!TURSO_MAIN_URL || !TURSO_MAIN_TOKEN) {
  console.error('❌ Erro: TURSO_MAIN_URL e TURSO_MAIN_TOKEN são obrigatórios!');
  process.exit(1);
}

console.log('✅ Variáveis de ambiente encontradas');
console.log('📦 Iniciando build estático...');

// Criar diretório out
const outDir = path.join(__dirname, '..', 'out');
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Função para copiar recursivamente
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const files = fs.readdirSync(src);
    files.forEach(file => {
      copyRecursive(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copiar pasta public para out
const publicDir = path.join(__dirname, '..', 'public');
console.log('📁 Copiando arquivos públicos...');
copyRecursive(publicDir, outDir);

// Criar arquivo .nojekyll para desabilitar Jekyll no GitHub Pages
const nojekyllPath = path.join(outDir, '.nojekyll');
fs.writeFileSync(nojekyllPath, '');
console.log('✅ Arquivo .nojekyll criado');

// Remover README.md se existir (para não sobrepor o index.html)
const readmePath = path.join(outDir, 'README.md');
if (fs.existsSync(readmePath)) {
  fs.unlinkSync(readmePath);
  console.log('✅ README.md removido do build');
}

// Criar arquivo de configuração com as credenciais
const configContent = `// Configuração gerada automaticamente durante o build
export const TURSO_CONFIG = {
  main: {
    url: '${TURSO_MAIN_URL}',
    authToken: '${TURSO_MAIN_TOKEN}'
  },
  comercial: {
    url: '${TURSO_COMERCIAL_URL}',
    authToken: '${TURSO_COMERCIAL_TOKEN}'
  }
};

// Expor no window para scripts não-module (ex: auth.js usa para login direto no Turso)
if (typeof window !== 'undefined') {
  window.TURSO_CONFIG = TURSO_CONFIG;
}
`;

const configPath = path.join(outDir, 'js', 'turso-config.js');
fs.writeFileSync(configPath, configContent);

console.log('✅ Arquivo de configuração criado');
console.log('✅ Build concluído com sucesso!');
console.log(`📂 Arquivos gerados em: ${outDir}`);
