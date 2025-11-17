const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware per logging di TUTTE le richieste
app.use((req, res, next) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log(`🌐 IP: ${req.ip}`);
  console.log(`📋 Query:`, JSON.stringify(req.query, null, 2));
  if(req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 Body:`, JSON.stringify(req.body, null, 2));
  }
  console.log(`${'='.repeat(60)}`);
  next();
});

// Configurazione
app.use(cors());
app.use(bodyParser.json());

// Database in memoria
let currentTrend = {
  direction: 'NONE',
  isActive: false,
  forceClose: false,
  lastUpdate: null,
  controllerInfo: {}
};

let connectedBots = new Map();
let recentCommands = [];
let controllerAccountInfo = {};

// Chiavi di sicurezza
const CONTROLLER_KEY = "controller_flagship_key_2025";
const BOT_KEY = "bot_flagship_access_2026_secure_alpha92";

// Middleware per autenticazione Bot
function authenticateBot(req, res, next) {
  console.log(`🔐 Autenticazione Bot...`);
  const { botkey } = req.query;
  
  console.log(`🔑 Bot Key ricevuta: ${botkey ? botkey : 'NESSUNA'}`);
  console.log(`🔑 Bot Key attesa: ${BOT_KEY);
  
  if (!botkey || botkey !== BOT_KEY) {
    console.log(`❌ Autenticazione FALLITA - Key non valida`);
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Valid bot key required' 
    });
  }
  
  console.log(`✅ Autenticazione RIUSCITA`);
  
  const botId = req.ip + '_' + (req.headers['user-agent'] || 'unknown');
  connectedBots.set(botId, {
    lastAccess: new Date(),
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  console.log(`🤖 Bot registrato: ${botId.substring(0, 30)}...`);
  
  next();
}

function updateControllerAccountInfo(accountData) {
  if (accountData && typeof accountData === 'object') {
    controllerAccountInfo = {
      ...accountData,
      lastUpdated: new Date()
    };
    console.log(`💰 Account Controller aggiornato: Balance: ${accountData.balance}, Equity: ${accountData.equity}`);
  }
}

//+------------------------------------------------------------------+
//| ENDPOINT 0: Root - Test Base                                    |
//+------------------------------------------------------------------+
app.get('/', (req, res) => {
  console.log(`🏠 Root endpoint chiamato`);
  res.json({
    message: 'Flagship Trend Server v1.0',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

//+------------------------------------------------------------------+
//| ENDPOINT 1: Health Check SEMPLICE                               |
//+------------------------------------------------------------------+
app.get('/health', (req, res) => {
  console.log(`💚 Health check SEMPLICE chiamato`);
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

//+------------------------------------------------------------------+
//| ENDPOINT 1b: Health Check COMPLETO                              |
//+------------------------------------------------------------------+
app.get('/api/health', (req, res) => {
  console.log(`💚 Health check COMPLETO chiamato`);
  const response = {
    status: 'online',
    time: new Date(),
    currentTrend: currentTrend.direction,
    isActive: currentTrend.isActive,
    forceClose: currentTrend.forceClose,
    connectedBots: connectedBots.size,
    recentCommands: recentCommands.length,
    controllerAccount: controllerAccountInfo.number || 'N/A'
  };
  console.log(`📤 Health response:`, JSON.stringify(response, null, 2));
  res.json(response);
});

//+------------------------------------------------------------------+
//| ENDPOINT 2: Controller invia comandi                            |
//+------------------------------------------------------------------+
app.post('/api/commands', (req, res) => {
  console.log(`🎮 Controller commands ricevuto`);
  
  const {
    controllerkey, action, trend, active, forceclose, account
  } = req.body;

  console.log(`🔑 Controller key check: ${controllerkey === CONTROLLER_KEY ? 'OK' : 'FAIL'}`);

  if (controllerkey !== CONTROLLER_KEY) {
    console.log(`❌ Controller key non valida`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const timestamp = new Date();
  console.log(`📝 Action: ${action}`);

  if (action === 'trend_change') {
    const validTrends = ['BUY', 'SELL', 'ENTRAMBI', 'NONE'];
    if (!validTrends.includes(trend)) {
      console.log(`❌ Trend non valido: ${trend}`);
      return res.status(400).json({ error: 'Invalid trend direction' });
    }

    const oldTrend = currentTrend.direction;
    currentTrend.direction = trend;
    currentTrend.lastUpdate = timestamp;

    recentCommands.push({
      commandType: 'trend_change',
      action: 'trend_change',
      oldTrend,
      newTrend: trend,
      timestamp
    });

    if (account) updateControllerAccountInfo(account);
    console.log(`📈 TREND CAMBIATO: ${oldTrend} -> ${trend}`);

  } else if (action === 'start_stop') {
    const isStart = active === true || active === 'true';
    const oldStatus = currentTrend.isActive;
    currentTrend.isActive = isStart;
    currentTrend.lastUpdate = timestamp;

    recentCommands.push({
      commandType: 'start_stop',
      action: 'start_stop',
      oldStatus,
      newStatus: isStart,
      command: isStart ? 'START' : 'STOP',
      timestamp
    });

    if (account) updateControllerAccountInfo(account);
    console.log(`🎮 EA ${isStart ? 'AVVIATO' : 'FERMATO'}`);

  } else if (action === 'force_close') {
    const shouldClose = forceclose === true || forceclose === 'true';
    currentTrend.forceClose = shouldClose;
    currentTrend.lastUpdate = timestamp;

    recentCommands.push({
      commandType: 'force_close',
      action: 'force_close',
      forceClose: shouldClose,
      timestamp
    });

    if (account) updateControllerAccountInfo(account);
    console.log(`🔴 FORZA CHIUSURA: ${shouldClose ? 'ATTIVATO' : 'DISATTIVATO'}`);

    if (shouldClose) {
      setTimeout(() => {
        currentTrend.forceClose = false;
        console.log(`🔄 FORZA CHIUSURA: Reset automatico`);
      }, 5000);
    }

  } else if (action === 'status_update') {
    const validTrends = ['BUY', 'SELL', 'ENTRAMBI', 'NONE'];
    
    if (trend && validTrends.includes(trend)) {
      currentTrend.direction = trend;
    }
    
    if (active !== undefined) {
      currentTrend.isActive = active === true || active === 'true';
    }
    
    if (forceclose !== undefined) {
      currentTrend.forceClose = forceclose === true || forceclose === 'true';
    }
    
    currentTrend.lastUpdate = timestamp;

    recentCommands.push({
      commandType: 'status_update',
      action: 'status_update',
      trend: currentTrend.direction,
      active: currentTrend.isActive,
      forceClose: currentTrend.forceClose,
      timestamp
    });

    if (account) updateControllerAccountInfo(account);
    console.log(`🔄 STATO AGGIORNATO: Trend=${currentTrend.direction}, Active=${currentTrend.isActive}, ForceClose=${currentTrend.forceClose}`);
  }

  if (recentCommands.length > 50) {
    recentCommands = recentCommands.slice(-50);
  }

  const responseData = { 
    status: 'success',
    currentState: {
      trend: currentTrend.direction,
      active: currentTrend.isActive,
      forceClose: currentTrend.forceClose,
      lastUpdate: currentTrend.lastUpdate
    }
  };
  
  console.log(`📤 Response:`, JSON.stringify(responseData, null, 2));
  res.json(responseData);
});

//+------------------------------------------------------------------+
//| ENDPOINT 3: Bot riceve comandi                                  |
//+------------------------------------------------------------------+
app.get('/api/getcommands', authenticateBot, (req, res) => {
  console.log(`🤖 Bot richiede comandi`);
  
  const { lastsync } = req.query;
  console.log(`🕐 Last sync: ${lastsync || 'NONE'}`);
  
  const response = {
    currentTrend: currentTrend,
    recentCommands: [],
    controllerAccount: controllerAccountInfo,
    serverTime: Date.now()
  };

  if (lastsync) {
    const syncTime = new Date(parseInt(lastsync));
    response.recentCommands = recentCommands.filter(cmd => cmd.timestamp > syncTime);
    console.log(`📋 Comandi filtrati dopo ${syncTime}: ${response.recentCommands.length}`);
  } else {
    response.recentCommands = recentCommands;
    console.log(`📋 Tutti i comandi recenti: ${response.recentCommands.length}`);
  }

  console.log(`📤 Comandi inviati a BOT:`);
  console.log(`   - Trend: ${currentTrend.direction}`);
  console.log(`   - Active: ${currentTrend.isActive}`);
  console.log(`   - ForceClose: ${currentTrend.forceClose}`);
  console.log(`   - Recent Commands: ${response.recentCommands.length}`);

  res.json(response);
});

//+------------------------------------------------------------------+
//| ENDPOINT 4: Bot conferma                                        |
//+------------------------------------------------------------------+
app.post('/api/bot-confirm', authenticateBot, (req, res) => {
  console.log(`✅ Bot conferma esecuzione`);
  
  const { commandType, status, message } = req.body;
  
  console.log(`   - Command Type: ${commandType}`);
  console.log(`   - Status: ${status}`);
  console.log(`   - Message: ${message}`);
  
  recentCommands.push({
    commandType: 'bot_confirmation',
    action: 'bot_confirm',
    originalCommand: commandType,
    confirmationStatus: status,
    message,
    timestamp: new Date()
  });

  console.log(`✅ BOT CONFERMA REGISTRATA`);
  
  res.json({ status: 'confirmed' });
});

//+------------------------------------------------------------------+
//| ENDPOINT 5: Statistiche                                         |
//+------------------------------------------------------------------+
app.get('/api/stats', (req, res) => {
  console.log(`📊 Stats richieste`);
  
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  connectedBots.forEach((data, botId) => {
    if (data.lastAccess < fiveMinutesAgo) {
      connectedBots.delete(botId);
    }
  });

  const commandStats = {};
  recentCommands.forEach(cmd => {
    const type = cmd.commandType || 'unknown';
    commandStats[type] = (commandStats[type] || 0) + 1;
  });

  res.json({
    summary: {
      currentTrend: currentTrend.direction,
      isActive: currentTrend.isActive,
      forceClose: currentTrend.forceClose,
      lastUpdate: currentTrend.lastUpdate,
      connectedBots: connectedBots.size,
      recentCommands: recentCommands.length
    },
    commandStats,
    recentCommands: recentCommands.slice(-10),
    controllerAccount: controllerAccountInfo,
    connectedBots: Array.from(connectedBots.entries()).map(([id, data]) => ({
      id: id.substr(0, 20) + '...',
      lastAccess: data.lastAccess,
      ip: data.ip
    })),
    serverUptime: process.uptime()
  });
});

//+------------------------------------------------------------------+
//| ENDPOINT 6: Reset                                               |
//+------------------------------------------------------------------+
app.post('/api/reset', (req, res) => {
  console.log(`🧹 Reset richiesto`);
  
  if (req.body.controllerkey !== CONTROLLER_KEY) {
    console.log(`❌ Reset fallito: controller key non valida`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  currentTrend = {
    direction: 'NONE',
    isActive: false,
    forceClose: false,
    lastUpdate: null,
    controllerInfo: {}
  };
  
  connectedBots.clear();
  recentCommands = [];
  controllerAccountInfo = {};

  console.log('🧹 RESET COMPLETO - Tutti i dati cancellati');
  res.json({ status: 'success', message: 'Complete reset performed' });
});

//+------------------------------------------------------------------+
//| ENDPOINT 7: Debug                                               |
//+------------------------------------------------------------------+
app.get('/api/debug', (req, res) => {
  console.log(`🐛 Debug info richieste`);
  
  res.json({
    currentTrend,
    recentCommands,
    controllerAccount: controllerAccountInfo,
    connectedBots: Object.fromEntries(connectedBots)
  });
});

//+------------------------------------------------------------------+
//| ENDPOINT 8: Verifica chiave bot                                 |
//+------------------------------------------------------------------+
app.post('/api/verify-bot', (req, res) => {
  console.log(`🔐 Verifica bot key`);
  
  const { botkey } = req.body;
  
  if (botkey === BOT_KEY) {
    console.log(`✅ Bot key valida`);
    res.json({ 
      status: 'authorized',
      message: 'Bot key valid',
      serverTime: Date.now(),
      currentTrend: currentTrend
    });
  } else {
    console.log(`❌ Bot key non valida`);
    res.status(401).json({ 
      status: 'unauthorized',
      message: 'Invalid bot key'
    });
  }
});

//+------------------------------------------------------------------+
//| ENDPOINT 9: Stato rapido trend                                  |
//+------------------------------------------------------------------+
app.get('/api/trend-status', authenticateBot, (req, res) => {
  console.log(`⚡ Trend status rapido richiesto`);
  
  res.json({
    trend: currentTrend.direction,
    active: currentTrend.isActive,
    forceClose: currentTrend.forceClose,
    lastUpdate: currentTrend.lastUpdate,
    serverTime: Date.now()
  });
});

// Avvia server
app.listen(PORT, () => {
  console.log(`\n${'🚀'.repeat(30)}`);
  console.log(`🚀 Prop Leader - Flagship Trend Server v1.0 AVVIATO`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
  console.log(`${'🚀'.repeat(30)}\n`);
  
  console.log(`📋 Endpoints disponibili:`);
  console.log(`   GET  /                     - Root test`);
  console.log(`   GET  /health               - Health check semplice`);
  console.log(`   GET  /api/health           - Health check completo`);
  console.log(`   POST /api/commands         - Comandi Controller`);
  console.log(`   GET  /api/getcommands      - Comandi Bot (AUTH)`);
  console.log(`   POST /api/bot-confirm      - Conferma Bot (AUTH)`);
  console.log(`   GET  /api/stats            - Statistiche`);
  console.log(`   GET  /api/trend-status     - Status rapido (AUTH)`);
  console.log(`   POST /api/reset            - Reset completo`);
  console.log(`   GET  /api/debug            - Debug info`);
  console.log(`   POST /api/verify-bot       - Verifica chiave bot\n`);
  
  console.log(`🔐 SICUREZZA ATTIVA:`);
  console.log(`   Controller Key: ${CONTROLLER_KEY}`);
  console.log(`   Bot Key:        ${BOT_KEY}\n`);
  
  console.log(`💡 STATO INIZIALE:`);
  console.log(`   Trend: ${currentTrend.direction}`);
  console.log(`   Active: ${currentTrend.isActive}`);
  console.log(`   ForceClose: ${currentTrend.forceClose}\n`);
  
  console.log(`✅ Server pronto per ricevere richieste!\n`);
});

// Pulizia automatica
setInterval(() => {
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const before = recentCommands.length;
  recentCommands = recentCommands.filter(cmd => cmd.timestamp > cutoff);
  
  if (recentCommands.length !== before) {
    console.log(`🧹 Pulizia automatica: rimossi ${before - recentCommands.length} comandi vecchi`);
  }
  
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const botsBefore = connectedBots.size;
  connectedBots.forEach((data, botId) => {
    if (data.lastAccess < fiveMinutesAgo) {
      connectedBots.delete(botId);
    }
  });
  
  if (connectedBots.size !== botsBefore) {
    console.log(`🧹 Pulizia bot disconnessi: rimossi ${botsBefore - connectedBots.size} bot inattivi`);
  }
}, 6 * 60 * 60 * 1000);
