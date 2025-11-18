const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

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

// ✨ NUOVE STRUTTURE
let remoteTrades = [];              // Array di trade da aprire (auto-expire 5sec)
let breakEvenCommand = {            // Comando BE attivo
  active: false,
  timestamp: null
};

let connectedBots = new Map();
let recentCommands = [];
let controllerAccountInfo = {};

// Chiavi di sicurezza
const CONTROLLER_KEY = "controller_flagship_key_2025";
const BOT_KEY = "bot_flagship_access_2026_secure_alpha92";

// Middleware per autenticazione Bot
function authenticateBot(req, res, next) {
  const { botkey } = req.query;
  
  if (!botkey || botkey !== BOT_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Valid bot key required' 
    });
  }
  
  const botId = req.ip + '_' + (req.headers['user-agent'] || 'unknown');
  connectedBots.set(botId, {
    lastAccess: new Date(),
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
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
//| ENDPOINT 1: Health Check                                        |
//+------------------------------------------------------------------+
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    time: new Date(),
    currentTrend: currentTrend.direction,
    isActive: currentTrend.isActive,
    forceClose: currentTrend.forceClose,
    connectedBots: connectedBots.size,
    recentCommands: recentCommands.length,
    remoteTrades: remoteTrades.length,
    breakEvenActive: breakEvenCommand.active,
    controllerAccount: controllerAccountInfo.number || 'N/A'
  });
});

//+------------------------------------------------------------------+
//| ENDPOINT 2: Controller invia comandi (ESTESO)                   |
//+------------------------------------------------------------------+
app.post('/api/commands', (req, res) => {
  const {
    controllerkey, action, trend, active, forceclose, account,
    tradeType, profitTarget  // ✨ Nuovi parametri
  } = req.body;

  if (controllerkey !== CONTROLLER_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const timestamp = new Date();

  if (action === 'trend_change') {
    const validTrends = ['BUY', 'SELL', 'ENTRAMBI', 'NONE'];
    if (!validTrends.includes(trend)) {
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

  } 
  // ✨ NUOVO: Remote Trade Signal
  else if (action === 'remote_trade') {
    if (!tradeType || !['BUY', 'SELL'].includes(tradeType)) {
      return res.status(400).json({ error: 'Invalid trade type (BUY/SELL required)' });
    }

    const tradeSignal = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      type: tradeType,
      timestamp: timestamp,
      expires: new Date(Date.now() + 5000), // Auto-expire in 5 secondi
      executed: false
    };

    remoteTrades.push(tradeSignal);

    recentCommands.push({
      commandType: 'remote_trade',
      action: 'remote_trade',
      tradeId: tradeSignal.id,
      tradeType: tradeType,
      timestamp
    });

    console.log(`🚀 REMOTE TRADE: ${tradeType} - ID: ${tradeSignal.id} (expires in 5s)`);

    // Auto-rimozione dopo 5 secondi
    setTimeout(() => {
      const index = remoteTrades.findIndex(t => t.id === tradeSignal.id);
      if (index >= 0 && !remoteTrades[index].executed) {
        remoteTrades.splice(index, 1);
        console.log(`⏰ REMOTE TRADE EXPIRED: ${tradeSignal.id}`);
      }
    }, 5000);

  }
  // ✨ NUOVO: Break Even Command
  else if (action === 'breakeven_close') {
    breakEvenCommand.active = true;
    breakEvenCommand.timestamp = timestamp;

    recentCommands.push({
      commandType: 'breakeven_close',
      action: 'breakeven_close',
      timestamp
    });

    console.log(`⚖️ BREAKEVEN CLOSE: Attivato`);

    // Reset automatico dopo 10 secondi (il bot deve confermare prima)
    setTimeout(() => {
      if (breakEvenCommand.active) {
        breakEvenCommand.active = false;
        console.log(`🔄 BREAKEVEN CLOSE: Reset automatico`);
      }
    }, 10000);

  }
  else if (action === 'status_update') {
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

  // Mantieni ultimi 50 comandi
  if (recentCommands.length > 50) {
    recentCommands = recentCommands.slice(-50);
  }

  res.json({ 
    status: 'success',
    currentState: {
      trend: currentTrend.direction,
      active: currentTrend.isActive,
      forceClose: currentTrend.forceClose,
      breakEvenActive: breakEvenCommand.active,
      pendingTrades: remoteTrades.length,
      lastUpdate: currentTrend.lastUpdate
    }
  });
});

//+------------------------------------------------------------------+
//| ENDPOINT 3: Bot riceve comandi (ESTESO)                         |
//+------------------------------------------------------------------+
app.get('/api/getcommands', authenticateBot, (req, res) => {
  const { lastsync } = req.query;
  
  // Pulizia trade scaduti
  /*const now = new Date();
  remoteTrades = remoteTrades.filter(t => t.expires > now);*/
  
  const response = {
    currentTrend: currentTrend,
    recentCommands: [],
    remoteTrades: remoteTrades, // Solo non eseguiti
    breakEvenCommand: breakEvenCommand,
    controllerAccount: controllerAccountInfo,
    serverTime: Date.now()
  };

  if (lastsync) {
    const syncTime = new Date(parseInt(lastsync));
    response.recentCommands = recentCommands.filter(cmd => cmd.timestamp > syncTime);
  } else {
    response.recentCommands = recentCommands;
  }

  console.log(`📤 Comandi inviati: trend=${currentTrend.direction}, remoteTrades=${response.remoteTrades.length}, BE=${breakEvenCommand.active}`);

  res.json(response);
});

//+------------------------------------------------------------------+
//| ENDPOINT 4: Bot notifica esecuzione comando (ESTESO)            |
//+------------------------------------------------------------------+
app.post('/api/bot-confirm', authenticateBot, (req, res) => {
  const { commandType, status, message, tradeId } = req.body;
  
  const confirmation = {
    commandType,
    status,
    message,
    tradeId,
    timestamp: new Date()
  };

  // ✨ Se è conferma remote trade, marca come eseguito
  if (commandType === 'remote_trade' && tradeId) {
    const trade = remoteTrades.find(t => t.id === tradeId);
    if (trade) {
      trade.executed = true;
      console.log(`✅ REMOTE TRADE EXECUTED: ${tradeId}`);
    }
  }

  // ✨ Se è conferma BE close, disattiva comando
  if (commandType === 'breakeven_close') {
    breakEvenCommand.active = false;
    console.log(`✅ BREAKEVEN CLOSE EXECUTED`);
  }

  recentCommands.push({
    commandType: 'bot_confirmation',
    action: 'bot_confirm',
    originalCommand: commandType,
    confirmationStatus: status,
    message,
    timestamp: new Date()
  });

  console.log(`✅ BOT CONFERMA: ${commandType} -> ${status} (${message || 'no message'})`);
  
  res.json({ status: 'confirmed' });
});

//+------------------------------------------------------------------+
//| ENDPOINT 5: Statistiche dettagliate                             |
//+------------------------------------------------------------------+
app.get('/api/stats', (req, res) => {
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
      breakEvenActive: breakEvenCommand.active,
      pendingRemoteTrades: remoteTrades.filter(t => !t.executed).length,
      lastUpdate: currentTrend.lastUpdate,
      connectedBots: connectedBots.size,
      recentCommands: recentCommands.length
    },
    commandStats,
    recentCommands: recentCommands.slice(-10),
    remoteTrades: remoteTrades,
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
//| ENDPOINT 6: Reset completo                                      |
//+------------------------------------------------------------------+
app.post('/api/reset', (req, res) => {
  if (req.body.controllerkey !== CONTROLLER_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  currentTrend = {
    direction: 'NONE',
    isActive: false,
    forceClose: false,
    lastUpdate: null,
    controllerInfo: {}
  };
  
  remoteTrades = [];
  breakEvenCommand = { active: false, timestamp: null };
  connectedBots.clear();
  recentCommands = [];
  controllerAccountInfo = {};

  console.log('🧹 RESET COMPLETO - Tutti i dati cancellati');
  res.json({ status: 'success', message: 'Complete reset performed' });
});

//+------------------------------------------------------------------+
//| ENDPOINT 7: Debug - Stato interno                               |
//+------------------------------------------------------------------+
app.get('/api/debug', (req, res) => {
  res.json({
    currentTrend,
    remoteTrades,
    breakEvenCommand,
    recentCommands,
    controllerAccount: controllerAccountInfo,
    connectedBots: Object.fromEntries(connectedBots)
  });
});

//+------------------------------------------------------------------+
//| ENDPOINT 8: Verifica chiave bot                                 |
//+------------------------------------------------------------------+
app.post('/api/verify-bot', (req, res) => {
  const { botkey } = req.body;
  
  if (botkey === BOT_KEY) {
    res.json({ 
      status: 'authorized',
      message: 'Bot key valid',
      serverTime: Date.now(),
      currentTrend: currentTrend
    });
  } else {
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
  res.json({
    trend: currentTrend.direction,
    active: currentTrend.isActive,
    forceClose: currentTrend.forceClose,
    breakEvenActive: breakEvenCommand.active,
    pendingTrades: remoteTrades.filter(t => !t.executed).length,
    lastUpdate: currentTrend.lastUpdate,
    serverTime: Date.now()
  });
});

// Avvia server
app.listen(PORT, () => {
  console.log(`🚀 Prop Leader - Flagship Trend Server v2.0 avviato su port ${PORT}`);
  console.log(`📋 Endpoints disponibili:`);
  console.log(`   GET  /api/health           - Health check`);
  console.log(`   POST /api/commands         - Ricevi comandi dal Controller`);
  console.log(`   GET  /api/getcommands      - Ottieni comandi per Bot (AUTH)`);
  console.log(`   POST /api/bot-confirm      - Bot conferma esecuzione (AUTH)`);
  console.log(`   GET  /api/stats            - Statistiche dettagliate`);
  console.log(`   GET  /api/trend-status     - Stato rapido trend (AUTH)`);
  console.log(`   POST /api/reset            - Reset completo`);
  console.log(`   GET  /api/debug            - Debug stato interno`);
  console.log(`   POST /api/verify-bot       - Verifica chiave bot`);
  console.log(`🔐 SICUREZZA ATTIVA:`);
  console.log(`   Controller Key: ${CONTROLLER_KEY}`);
  console.log(`   Bot Key:       ${BOT_KEY}`);
  console.log(`💡 FUNZIONALITÀ:`);
  console.log(`   ✅ Trend Control (BUY/SELL/ENTRAMBI/NONE)`);
  console.log(`   ✅ Start/Stop Trading`);
  console.log(`   ✅ Force Close`);
  console.log(`   ✨ Remote Trade Signals (auto-expire 5s)`);
  console.log(`   ✨ Break Even Close Command`);
  console.log(`🤖 Target Bot: Prop Leader - Flagship`);
});

//+------------------------------------------------------------------+
//| Pulizia automatica periodica                                     |
//+------------------------------------------------------------------+
setInterval(() => {
  // 1. Pulizia remoteTrades (ogni 10 secondi)
  const now = new Date();
  const beforeTrades = remoteTrades.length;
  remoteTrades = remoteTrades.filter(t => !t.executed && t.expires > now);
  
  if (remoteTrades.length !== beforeTrades) {
    console.log(`🧹 Cleanup remoteTrades: ${beforeTrades} -> ${remoteTrades.length}`);
  }
}, 10000);

setInterval(() => {
  // 2. Pulizia recentCommands (ogni 6 ore)
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const before = recentCommands.length;
  recentCommands = recentCommands.filter(cmd => cmd.timestamp > cutoff);
  
  if (recentCommands.length !== before) {
    console.log(`🧹 Pulizia comandi vecchi: rimossi ${before - recentCommands.length}`);
  }
  
  // 3. Pulizia bot inattivi
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const botsBefore = connectedBots.size;
  connectedBots.forEach((data, botId) => {
    if (data.lastAccess < fiveMinutesAgo) {
      connectedBots.delete(botId);
    }
  });
  
  if (connectedBots.size !== botsBefore) {
    console.log(`🧹 Pulizia bot disconnessi: rimossi ${botsBefore - connectedBots.size}`);
  }
}, 6 * 60 * 60 * 1000);
