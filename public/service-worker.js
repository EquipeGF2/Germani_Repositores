// Service Worker para PWA - Sistema de Repositores Germani
// Permite operação offline completa da aplicação

const CACHE_NAME = 'germani-repositores-v52';
const RUNTIME_CACHE = 'germani-runtime-v52';

// Arquivos essenciais para funcionar offline
// Usar caminhos relativos para funcionar com GitHub Pages (subdiretório)
const ESSENTIAL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './css/pwa.css',
  './js/auth.js',
  './js/app.js',
  './js/db.js',
  './js/pages.js',
  './js/utils.js',
  './js/geo.js',
  './js/acl-resources.js',
  './js/turso-config.js',
  './js/offline-db.js',
  './js/sync-service.js',
  './js/pwa-app.js',
  './icon-512.png',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.7.1/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// URLs da API que devem funcionar offline (Network First)
const API_URLS = [
  '/api/registro-rota',
  '/api/health',
  '/api/documentos'
];

// Instalar Service Worker e fazer cache inicial
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Cache aberto, adicionando arquivos essenciais...');

        // Tentar cachear cada arquivo individualmente para evitar falha total
        const cachePromises = ESSENTIAL_FILES.map(async (file) => {
          try {
            await cache.add(file);
            console.log(`[SW] ✅ Cacheado: ${file}`);
          } catch (error) {
            console.warn(`[SW] ⚠️ Não foi possível cachear: ${file}`, error.message);
          }
        });

        await Promise.allSettled(cachePromises);
        console.log('[SW] ✅ Service Worker instalado com sucesso!');
        return self.skipWaiting(); // Ativa imediatamente
      })
      .catch((error) => {
        console.error('[SW] ❌ Erro ao instalar Service Worker:', error);
        // Mesmo com erro, continuar instalação
        return self.skipWaiting();
      })
  );
});

// Ativar Service Worker e limpar caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] Removendo cache antigo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] ✅ Service Worker ativado!');
        return self.clients.claim(); // Assume controle imediatamente
      })
  );
});

// Interceptar requisições e aplicar estratégia de cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições que não são GET
  if (request.method !== 'GET') {
    return;
  }

  // Estratégia para API: Network First, fallback para cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Estratégia para assets estáticos: Cache First, fallback para network
  event.respondWith(cacheFirstStrategy(request));
});

// Estratégia: Cache First (para assets estáticos)
async function cacheFirstStrategy(request) {
  try {
    // Tentar buscar do cache primeiro
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] 📦 Servindo do cache:', request.url);
      return cachedResponse;
    }

    // Se não estiver no cache, buscar da rede
    console.log('[SW] 🌐 Buscando da rede:', request.url);
    const networkResponse = await fetch(request);

    // Cachear a resposta para uso futuro
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] ❌ Erro ao buscar:', request.url, error);

    // Se for navegação (HTML), retornar index.html do cache
    if (request.mode === 'navigate') {
      const cachedIndex = await caches.match('./index.html') || await caches.match('/index.html');
      if (cachedIndex) {
        return cachedIndex;
      }
    }

    // Retornar resposta de erro offline
    return new Response('Você está offline e este recurso não está disponível no cache.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

// Estratégia: Network First (para API)
async function networkFirstStrategy(request) {
  try {
    // Tentar buscar da rede primeiro
    console.log('[SW] 🌐 Tentando API:', request.url);
    const networkResponse = await fetch(request);

    // Cachear resposta de sucesso para uso offline
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] ⚠️ API offline, tentando cache:', request.url);

    // Se falhar, tentar buscar do cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] 📦 Servindo API do cache:', request.url);
      return cachedResponse;
    }

    // Se não houver cache, retornar indicador de offline
    console.log('[SW] ❌ API não disponível offline:', request.url);
    return new Response(JSON.stringify({
      ok: false,
      offline: true,
      message: 'Você está offline. Esta operação será sincronizada quando voltar online.'
    }), {
      status: 503,
      headers: new Headers({
        'Content-Type': 'application/json'
      })
    });
  }
}

// Sincronização em background (quando voltar online)
self.addEventListener('sync', (event) => {
  console.log('[SW] 🔄 Evento de sincronização:', event.tag);

  if (event.tag === 'sync-pendencias') {
    event.waitUntil(syncPendencias());
  }
});

// Função para sincronizar pendências quando voltar online
async function syncPendencias() {
  console.log('[SW] 📤 Sincronizando pendências...');

  try {
    // Notificar todos os clients que estamos sincronizando
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      clients.forEach(client => {
        client.postMessage({
          type: 'SYNC_START',
          message: 'Iniciando sincronização de pendências...'
        });
      });
    } else {
      // Nenhum client ativo (tela bloqueada) - tentar enviar diretamente pelo SW
      console.log('[SW] Nenhum client ativo, tentando sync direto...');
      // O sync será completado quando o app reabrir
    }

    console.log('[SW] ✅ Sincronização iniciada');
  } catch (error) {
    console.error('[SW] ❌ Erro ao sincronizar:', error);
  }
}

// Periodic Background Sync (para navegadores que suportam)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-pendencias-periodico') {
    event.waitUntil(syncPendencias());
  }
});

console.log('[SW] Service Worker carregado');
