// =======================================================
// SERWER RENDER.COM DLA TIKFINITY → ROBLOX
// Autor: OskarKoxpp
// =======================================================

const express = require('express');
const cors = require('cors');
const app = express();

// =======================================================
// KONFIGURACJA CORS DLA ROBLOX
// =======================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =======================================================
// BAZA DANYCH W PAMIĘCI
// =======================================================
let actionQueue = [];
let serverStats = {
  startTime: new Date().toISOString(),
  totalEventsReceived: 0,
  totalActionsSent: 0,
  lastTikTokEvent: null,
  lastRobloxRequest: null
};

// Zmienne do kontroli logowania
let lastEmptyQueueLog = 0;
const EMPTY_QUEUE_LOG_INTERVAL = 5 * 60 * 1000; // 5 minut w milisekundach

// Middleware logowania z ograniczeniem dla pustych kolejek
app.use((req, res, next) => {
  // Dla endpointu /get-roblox-action z pustą kolejką loguj tylko co 5 minut
  if (req.url === '/get-roblox-action' && actionQueue.length === 0) {
    const now = Date.now();
    if (now - lastEmptyQueueLog > EMPTY_QUEUE_LOG_INTERVAL) {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - IP: ${req.ip || 'unknown'}`);
      lastEmptyQueueLog = now;
    }
  } else {
    // Dla wszystkich innych requestów loguj normalnie
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - IP: ${req.ip || 'unknown'}`);
  }
  next();
});

// =======================================================
// GŁÓWNY ENDPOINT - STATUS SERWERA
// =======================================================
app.get('/', (req, res) => {
  const uptime = Math.floor((Date.now() - new Date(serverStats.startTime).getTime()) / 1000);
  
  res.json({
    status: '🚀 Serwer TikFinity-Roblox działa na Render!',
    service: 'TikFinity → Render.com → Roblox',
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
    queue: {
      current: actionQueue.length,
      status: actionQueue.length > 0 ? '✅ Są akcje do pobrania!' : '📭 Brak akcji w kolejce'
    },
    stats: {
      totalEventsReceived: serverStats.totalEventsReceived,
      totalActionsSent: serverStats.totalActionsSent,
      lastTikTokEvent: serverStats.lastTikTokEvent || 'Brak',
      lastRobloxRequest: serverStats.lastRobloxRequest || 'Brak'
    },
    timestamp: new Date().toISOString(),
    endpoints: {
      'POST /tiktok-event': '📱 Odbiera wydarzenia z TikFinity',
      'GET /get-roblox-action': '🎮 Pobiera akcje dla Roblox',
      'GET /test-action': '🧪 Test dowolnej akcji',
      'GET /status': '📊 Szczegółowy status',
      'GET /clear': '🗑️ Czyści kolejkę akcji'
    },
    author: 'OskarKoxpp',
    version: '1.1.0'
  });
});

// =======================================================
// ENDPOINT DLA TIKFINITY - ODBIERA DONACJE TIKTOK
// =======================================================
app.post('/tiktok-event', (req, res) => {
  try {
    console.log('📱 TIKFINITY EVENT RECEIVED:');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const eventData = req.body;
    
    // Sprawdzenie czy są dane
    if (!eventData || Object.keys(eventData).length === 0) {
      console.log('❌ Brak danych w request');
      return res.status(400).json({ 
        error: 'Brak danych w request',
        received: req.body 
      });
    }
    
    // Ekstrakcja nazwy prezentu z różnych możliwych pól
    const giftName = eventData.gift_name || eventData.giftName || eventData.gift || 
                    eventData.type || eventData.action || eventData.event || 'unknown';
    
    // Ekstrakcja nazwy użytkownika z różnych możliwych pól
    const userName = eventData.user_name || eventData.userName || eventData.username || 
                    eventData.user || eventData.nickname || eventData.sender || 'Anonymous';
    
    // Ekstrakcja komentarza z różnych możliwych pól
    const comment = eventData.comment || eventData.message || eventData.text || 
                   eventData.description || eventData.content || '';
    
    // Ekstrakcja ilości
    const amount = eventData.amount || eventData.count || eventData.quantity || 1;
    
    // Przygotuj akcję dla Roblox
    const robloxAction = {
      // Standardowe pola z TikFinity
      gift_name: giftName,
      user_name: userName,
      comment: comment,
      amount: amount,
      
      // Dodatkowe meta dane
      timestamp: new Date().toISOString(),
      source: 'tikfinity',
      processed_at: new Date().toISOString(),
      raw_data: eventData // Zachowaj oryginalne dane
    };
    
    // Dodaj do kolejki
    actionQueue.push(robloxAction);
    
    // Ogranicz rozmiar kolejki (max 100 akcji)
    if (actionQueue.length > 100) {
      console.log('⚠️ Kolejka przekroczyła 100 elementów, usuwam stare akcje');
      actionQueue = actionQueue.slice(-50); // Zostaw 50 najnowszych
    }
    
    // Aktualizuj statystyki
    serverStats.totalEventsReceived++;
    serverStats.lastTikTokEvent = new Date().toISOString();
    
    console.log('✅ AKCJA DODANA DO KOLEJKI:', {
      gift: robloxAction.gift_name,
      user: robloxAction.user_name,
      comment: robloxAction.comment.substring(0, 30) + '...',
      amount: robloxAction.amount,
      queue_length: actionQueue.length,
      total_received: serverStats.totalEventsReceived
    });
    
    res.status(200).json({
      success: true,
      message: 'Event otrzymany i przetworzony pomyślnie',
      action: {
        gift_name: robloxAction.gift_name,
        user_name: robloxAction.user_name,
        comment: robloxAction.comment,
        amount: robloxAction.amount
      },
      queueLength: actionQueue.length,
      totalReceived: serverStats.totalEventsReceived,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ BŁĄD przy przetwarzaniu TikFinity event:', error);
    res.status(500).json({
      error: 'Błąd serwera przy przetwarzaniu wydarzenia',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// =======================================================
// ENDPOINT DLA ROBLOX - POBIERA AKCJE
// =======================================================
app.get('/get-roblox-action', (req, res) => {
  try {
    const now = Date.now();
    let shouldLog = true;
    
    // Ogranicz logowanie dla pustych kolejek
    if (actionQueue.length === 0) {
      if (now - lastEmptyQueueLog > EMPTY_QUEUE_LOG_INTERVAL) {
        lastEmptyQueueLog = now;
      } else {
        shouldLog = false;
      }
    }
    
    if (shouldLog) {
      console.log(`🎮 ROBLOX REQUEST - Queue length: ${actionQueue.length}`);
    }
    
    // Aktualizuj statystyki
    serverStats.lastRobloxRequest = new Date().toISOString();
    
    if (actionQueue.length > 0) {
      // Pobierz pierwszą akcję z kolejki (FIFO)
      const action = actionQueue.shift();
      serverStats.totalActionsSent++;
      
      console.log('📤 WYSYŁAM AKCJĘ DO ROBLOX:', {
        gift: action.gift_name,
        user: action.user_name,
        amount: action.amount,
        remaining_in_queue: actionQueue.length,
        total_sent: serverStats.totalActionsSent
      });
      
      // Wyślij akcję do Roblox
      res.json({
        // Główne dane dla Roblox
        gift_name: action.gift_name,
        user_name: action.user_name,
        comment: action.comment,
        amount: action.amount,
        
        // Meta dane
        timestamp: action.timestamp,
        sentAt: new Date().toISOString(),
        remainingInQueue: actionQueue.length,
        source: action.source,
        
        // Zachowaj raw data na wszelki wypadek
        raw_data: action.raw_data
      });
      
    } else {
      // Brak akcji w kolejce
      if (shouldLog) {
        console.log('📭 Brak akcji dla Roblox');
      }
      
      res.json({
        message: 'No new actions',
        timestamp: new Date().toISOString(),
        queueLength: 0,
        lastEventReceived: serverStats.lastTikTokEvent,
        totalSent: serverStats.totalActionsSent
      });
    }
    
  } catch (error) {
    console.error('❌ BŁĄD przy pobieraniu akcji dla Roblox:', error);
    res.status(500).json({
      error: 'Błąd serwera przy pobieraniu akcji',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// =======================================================
// UNIWERSALNY ENDPOINT TESTOWY - DLA DOWOLNEJ AKCJI
// =======================================================
app.get('/test-action', (req, res) => {
  const giftName = req.query.gift || req.query.action || req.query.type || 'test_gift';
  const userName = req.query.user || req.query.username || 'TestUser';
  const comment = req.query.comment || req.query.message || `Test akcji ${giftName} z serwera Render`;
  const amount = parseInt(req.query.amount) || parseInt(req.query.count) || 1;
  
  const testAction = {
    gift_name: giftName,
    user_name: userName,
    comment: comment,
    amount: amount,
    timestamp: new Date().toISOString(),
    source: 'test',
    processed_at: new Date().toISOString(),
    raw_data: {
      gift: giftName,
      user: userName,
      comment: comment,
      amount: amount,
      test: true
    }
  };
  
  actionQueue.push(testAction);
  console.log(`🧪 DODANO TESTOWĄ AKCJĘ: ${giftName} (${amount}x) od ${userName}`);
  
  res.json({
    message: `🧪 Testowa akcja "${giftName}" dodana do kolejki`,
    action: testAction,
    queueLength: actionQueue.length,
    info: `W Roblox będzie obsługiwana jako: ${giftName} (${amount}x)`
  });
});

// =======================================================
// ENDPOINTY ZARZĄDZANIA
// =======================================================

// Szczegółowy status
app.get('/status', (req, res) => {
  const uptime = Date.now() - new Date(serverStats.startTime).getTime();
  
  res.json({
    server: {
      status: 'running',
      platform: 'Render.com',
      startTime: serverStats.startTime,
      uptime: {
        milliseconds: uptime,
        seconds: Math.floor(uptime / 1000),
        minutes: Math.floor(uptime / (1000 * 60)),
        hours: Math.floor(uptime / (1000 * 60 * 60))
      },
      memory: process.memoryUsage(),
      nodeVersion: process.version
    },
    queue: {
      length: actionQueue.length,
      actions: actionQueue.slice(0, 10).map(action => ({
        gift: action.gift_name,
        user: action.user_name,
        amount: action.amount,
        timestamp: action.timestamp
      }))
    },
    stats: serverStats,
    timestamp: new Date().toISOString()
  });
});

// Wyczyść kolejkę
app.get('/clear', (req, res) => {
  const clearedCount = actionQueue.length;
  actionQueue = [];
  
  console.log(`🗑️ WYCZYSZCZONO KOLEJKĘ: ${clearedCount} akcji`);
  
  res.json({
    message: `🗑️ Wyczyszczono ${clearedCount} akcji z kolejki`,
    queueLength: actionQueue.length,
    timestamp: new Date().toISOString(),
    clearedCount: clearedCount
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - new Date(serverStats.startTime).getTime()
  });
});

// =======================================================
// ERROR HANDLING
// =======================================================

// 404 Handler
app.use((req, res) => {
  console.log('❌ 404 - Nie znaleziono endpoint:', req.method, req.url);
  res.status(404).json({
    error: 'Endpoint nie znaleziony',
    method: req.method,
    url: req.url,
    availableEndpoints: {
      'GET /': 'Status serwera',
      'POST /tiktok-event': 'Odbiera z TikFinity',
      'GET /get-roblox-action': 'Dla Roblox',
      'GET /test-action': 'Test dowolnej akcji',
      'GET /status': 'Szczegółowy status',
      'GET /clear': 'Wyczyść kolejkę',
      'GET /health': 'Health check'
    },
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler
app.use((error, req, res, next) => {
  console.error('💥 NIEOBSŁUŻONY BŁĄD:', error);
  res.status(500).json({
    error: 'Wystąpił nieoczekiwany błąd serwera',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Skontaktuj się z administratorem',
    timestamp: new Date().toISOString()
  });
});

// =======================================================
// URUCHOMIENIE SERWERA
// =======================================================

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('===============================================');
  console.log('🚀 SERWER TIKFINITY-ROBLOX URUCHOMIONY!');
  console.log('===============================================');
  console.log('🌐 Platform: Render.com');
  console.log('📡 Port:', PORT);
  console.log('⏰ Start time:', new Date().toISOString());
  console.log('👤 Author: OskarKoxpp');
  console.log('🔢 Version: 1.1.0');
  console.log('===============================================');
  console.log('📋 DOSTĘPNE ENDPOINTY:');
  console.log('  GET  / - Status serwera');
  console.log('  POST /tiktok-event - Odbiera z TikFinity');
  console.log('  GET  /get-roblox-action - Dla Roblox');
  console.log('  GET  /test-action - Test dowolnej akcji');
  console.log('  GET  /status - Szczegółowy status');
  console.log('  GET  /clear - Wyczyść kolejkę');
  console.log('  GET  /health - Health check');
  console.log('===============================================');
  console.log('🔗 Webhook URL dla TikFinity:');
  console.log('   https://TWOJA-DOMENA.onrender.com/tiktok-event');
  console.log('🧪 Test dowolnej akcji:');
  console.log('   /test-action?gift=NAZWA&user=USER&comment=TEKST&amount=1');
  console.log('===============================================');
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`🛑 Otrzymano sygnał ${signal}...`);
  console.log('📊 Finalne statystyki:');
  console.log('   - Eventi otrzymane:', serverStats.totalEventsReceived);
  console.log('   - Akcje wysłane:', serverStats.totalActionsSent);
  console.log('   - Akcje w kolejce:', actionQueue.length);
  
  server.close(() => {
    console.log('✅ Serwer zamknięty gracefully');
    process.exit(0);
  });
  
  // Force close po 10 sekundach
  setTimeout(() => {
    console.log('⚠️ Force shutdown po timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
