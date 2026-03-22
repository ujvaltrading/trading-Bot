// ============================================================
// BINANCE TRADING BOT - Core Engine
// File: src/bot-engine.js
// ============================================================

const BINANCE_BASE = 'https://api.binance.com';
const BINANCE_TEST = 'https://testnet.binance.vision'; // Use for testing!

// ─── Crypto HMAC Signing (for browser/Supabase Edge Function) ───
async function signQuery(queryString, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(queryString));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Binance API Client ───────────────────────────────────────
class BinanceClient {
  constructor(apiKey, apiSecret, testnet = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.base = testnet ? BINANCE_TEST : BINANCE_BASE;
  }

  async publicGet(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `${this.base}${path}${qs ? '?' + qs : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance API error: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async privateGet(path, params = {}) {
    const timestamp = Date.now();
    const qs = new URLSearchParams({ ...params, timestamp }).toString();
    const sig = await signQuery(qs, this.apiSecret);
    const url = `${this.base}${path}?${qs}&signature=${sig}`;
    const res = await fetch(url, { headers: { 'X-MBX-APIKEY': this.apiKey } });
    if (!res.ok) throw new Error(`Binance Private GET error: ${await res.text()}`);
    return res.json();
  }

  async privatePost(path, params = {}) {
    const timestamp = Date.now();
    const qs = new URLSearchParams({ ...params, timestamp }).toString();
    const sig = await signQuery(qs, this.apiSecret);
    const url = `${this.base}${path}?${qs}&signature=${sig}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.apiKey }
    });
    if (!res.ok) throw new Error(`Binance POST error: ${await res.text()}`);
    return res.json();
  }

  async privateDelete(path, params = {}) {
    const timestamp = Date.now();
    const qs = new URLSearchParams({ ...params, timestamp }).toString();
    const sig = await signQuery(qs, this.apiSecret);
    const url = `${this.base}${path}?${qs}&signature=${sig}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'X-MBX-APIKEY': this.apiKey }
    });
    if (!res.ok) throw new Error(`Binance DELETE error: ${await res.text()}`);
    return res.json();
  }

  // ─── Market Data ──────────────────────────────────────────
  async getPrice(symbol) {
    const data = await this.publicGet('/api/v3/ticker/price', { symbol });
    return parseFloat(data.price);
  }

  async getKlines(symbol, interval = '15m', limit = 50) {
    return this.publicGet('/api/v3/klines', { symbol, interval, limit });
  }

  async get24hrStats(symbol) {
    return this.publicGet('/api/v3/ticker/24hr', { symbol });
  }

  async getOrderBook(symbol, limit = 5) {
    return this.publicGet('/api/v3/depth', { symbol, limit });
  }

  // ─── Account ──────────────────────────────────────────────
  async getBalance() {
    const account = await this.privateGet('/api/v3/account');
    const balances = {};
    for (const b of account.balances) {
      const free = parseFloat(b.free);
      if (free > 0) balances[b.asset] = free;
    }
    return balances;
  }

  async getOpenOrders(symbol) {
    return this.privateGet('/api/v3/openOrders', { symbol });
  }

  async getAllOpenOrders() {
    return this.privateGet('/api/v3/openOrders');
  }

  // ─── Trading ──────────────────────────────────────────────
  async marketBuy(symbol, quoteQty) {
    return this.privatePost('/api/v3/order', {
      symbol, side: 'BUY', type: 'MARKET', quoteOrderQty: quoteQty.toFixed(2)
    });
  }

  async marketSell(symbol, quantity) {
    return this.privatePost('/api/v3/order', {
      symbol, side: 'SELL', type: 'MARKET', quantity: quantity.toFixed(6)
    });
  }

  async cancelOrder(symbol, orderId) {
    return this.privateDelete('/api/v3/order', { symbol, orderId });
  }

  async cancelAllOrders(symbol) {
    return this.privateDelete('/api/v3/openOrders', { symbol });
  }
}

// ─── Technical Indicators ────────────────────────────────────
class Indicators {
  static ema(prices, period) {
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const result = [ema];
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  }

  static rsi(prices, period = 14) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    const rsiValues = [];
    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsiValues.push(100 - 100 / (1 + rs));
    }
    return rsiValues;
  }

  static macd(prices, fast = 12, slow = 26, signal = 9) {
    const emaFast = this.ema(prices, fast);
    const emaSlow = this.ema(prices, slow);
    const offset = slow - fast;
    const macdLine = emaFast.slice(offset).map((v, i) => v - emaSlow[i]);
    const signalLine = this.ema(macdLine, signal);
    const histogram = macdLine.slice(signal - 1).map((v, i) => v - signalLine[i]);
    return { macdLine, signalLine, histogram };
  }

  static bollinger(prices, period = 20, multiplier = 2) {
    const sma = prices.slice(-period).reduce((a, b) => a + b, 0) / period;
    const variance = prices.slice(-period).reduce((a, b) => a + (b - sma) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return { upper: sma + multiplier * std, middle: sma, lower: sma - multiplier * std };
  }

  static parseKlines(klines) {
    return {
      opens: klines.map(k => parseFloat(k[1])),
      highs: klines.map(k => parseFloat(k[2])),
      lows: klines.map(k => parseFloat(k[3])),
      closes: klines.map(k => parseFloat(k[4])),
      volumes: klines.map(k => parseFloat(k[5]))
    };
  }
}

// ─── Strategy Engine ─────────────────────────────────────────
class StrategyEngine {
  // Returns: { signal: 'BUY'|'SELL'|'HOLD', confidence: 0-100, reason: string }
  static async analyze(client, symbol, strategy) {
    const klines = await client.getKlines(symbol, '15m', 60);
    const { closes, volumes } = Indicators.parseKlines(klines);
    const price = closes[closes.length - 1];

    switch (strategy) {
      case 'trend_follow': return this.trendFollow(closes, volumes, price);
      case 'rsi_macd': return this.rsiMacd(closes, price);
      case 'bollinger': return this.bollingerBounce(closes, price);
      default: return this.trendFollow(closes, volumes, price);
    }
  }

  static trendFollow(closes, volumes, price) {
    const ema20 = Indicators.ema(closes, 20);
    const ema50 = Indicators.ema(closes, 50);
    const rsi = Indicators.rsi(closes, 14);
    const currentRsi = rsi[rsi.length - 1];
    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    const e20Prev = ema20[ema20.length - 2];
    const e50Prev = ema50[ema50.length - 2];

    // Golden cross: EMA20 crosses above EMA50
    if (e20 > e50 && e20Prev <= e50Prev && currentRsi > 40 && currentRsi < 65) {
      return { signal: 'BUY', confidence: 75, reason: 'EMA Golden Cross + RSI healthy' };
    }
    // Death cross
    if (e20 < e50 && e20Prev >= e50Prev && currentRsi > 55) {
      return { signal: 'SELL', confidence: 70, reason: 'EMA Death Cross' };
    }
    // Strong uptrend with pullback
    if (e20 > e50 && price > e20 && currentRsi < 45) {
      return { signal: 'BUY', confidence: 65, reason: 'Uptrend pullback buy zone' };
    }
    if (currentRsi > 72) {
      return { signal: 'SELL', confidence: 60, reason: 'RSI overbought' };
    }
    return { signal: 'HOLD', confidence: 50, reason: 'No clear signal' };
  }

  static rsiMacd(closes, price) {
    const rsi = Indicators.rsi(closes, 14);
    const { histogram } = Indicators.macd(closes);
    const currentRsi = rsi[rsi.length - 1];
    const hist = histogram[histogram.length - 1];
    const histPrev = histogram[histogram.length - 2];

    if (currentRsi < 35 && hist > histPrev && hist > 0) {
      return { signal: 'BUY', confidence: 80, reason: 'RSI oversold + MACD bullish' };
    }
    if (currentRsi > 65 && hist < histPrev && hist < 0) {
      return { signal: 'SELL', confidence: 78, reason: 'RSI overbought + MACD bearish' };
    }
    if (currentRsi < 40 && hist > histPrev) {
      return { signal: 'BUY', confidence: 60, reason: 'RSI low + MACD improving' };
    }
    return { signal: 'HOLD', confidence: 50, reason: 'RSI+MACD no signal' };
  }

  static bollingerBounce(closes, price) {
    const bb = Indicators.bollinger(closes, 20, 2);
    const rsi = Indicators.rsi(closes, 14);
    const currentRsi = rsi[rsi.length - 1];

    if (price <= bb.lower && currentRsi < 40) {
      return { signal: 'BUY', confidence: 82, reason: 'Price at lower Bollinger + oversold' };
    }
    if (price >= bb.upper && currentRsi > 60) {
      return { signal: 'SELL', confidence: 80, reason: 'Price at upper Bollinger + overbought' };
    }
    if (price < bb.middle && price > bb.lower) {
      return { signal: 'BUY', confidence: 55, reason: 'Price below BB midline' };
    }
    return { signal: 'HOLD', confidence: 50, reason: 'Price inside Bollinger bands' };
  }
}

// ─── Risk Manager ─────────────────────────────────────────────
class RiskManager {
  constructor(config) {
    this.maxTrades = config.max_trades || 3;
    this.riskPercent = config.risk_percent || 2;
    this.minProfitPercent = config.min_profit_percent || 0.5;
    this.stopLossPercent = config.stop_loss_percent || 0.8;
    this.takeProfitPercent = config.take_profit_percent || 1.5;
    this.maxConsecutiveLosses = 3;
  }

  // How much USDT to allocate per trade
  calculatePositionSize(usdtBalance, openTradesCount) {
    const available = usdtBalance;
    const slotsLeft = this.maxTrades - openTradesCount;
    if (slotsLeft <= 0 || available < 1) return 0;
    const riskAmount = (available * this.riskPercent) / 100;
    const perTrade = Math.min(riskAmount, available / this.maxTrades);
    return Math.max(0, Math.min(perTrade, available * 0.3)); // Max 30% in one trade
  }

  calculateStopLoss(entryPrice, side) {
    return side === 'BUY'
      ? entryPrice * (1 - this.stopLossPercent / 100)
      : entryPrice * (1 + this.stopLossPercent / 100);
  }

  calculateTakeProfit(entryPrice, side) {
    return side === 'BUY'
      ? entryPrice * (1 + this.takeProfitPercent / 100)
      : entryPrice * (1 - this.takeProfitPercent / 100);
  }

  shouldPauseBot(consecutiveLosses, winRate, totalTrades) {
    if (consecutiveLosses >= this.maxConsecutiveLosses) {
      return { pause: true, reason: `${consecutiveLosses} consecutive losses` };
    }
    if (totalTrades >= 10 && winRate < 30) {
      return { pause: true, reason: `Win rate too low: ${winRate.toFixed(1)}%` };
    }
    return { pause: false };
  }
}

// ─── Main Bot Controller ──────────────────────────────────────
class TradingBot {
  constructor({ apiKey, apiSecret, supabaseUrl, supabaseKey, testnet = false }) {
    this.client = new BinanceClient(apiKey, apiSecret, testnet);
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.running = false;
    this.interval = null;
  }

  async db(path, method = 'GET', body = null) {
    const opts = {
      method,
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : ''
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${this.supabaseUrl}/rest/v1/${path}`, opts);
    if (!res.ok) throw new Error(`Supabase error: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async log(level, message, data = null) {
    console.log(`[${level}] ${message}`, data || '');
    try {
      await this.db('bot_logs', 'POST', { level, message, data });
    } catch (e) { /* silent */ }
  }

  async getConfig() {
    const rows = await this.db('bot_config?limit=1');
    return rows?.[0] || null;
  }

  async getOpenTrades() {
    return this.db('trades?status=eq.OPEN');
  }

  async saveBalance(balances, openTrades) {
    const usdtBalance = balances['USDT'] || 0;
    let totalValue = usdtBalance;
    for (const [asset, amount] of Object.entries(balances)) {
      if (asset !== 'USDT') {
        try {
          const price = await this.client.getPrice(`${asset}USDT`);
          totalValue += amount * price;
        } catch { /* skip */ }
      }
    }
    await this.db('balance_snapshots', 'POST', {
      usdt_balance: usdtBalance,
      total_value_usdt: totalValue,
      open_trades: openTrades.length
    });
    return { usdtBalance, totalValue };
  }

  async emergencyExit() {
    await this.log('WARN', '🚨 EMERGENCY EXIT TRIGGERED');
    const openTrades = await this.getOpenTrades();
    for (const trade of openTrades) {
      try {
        const price = await this.client.getPrice(trade.symbol);
        await this.client.marketSell(trade.symbol, trade.quantity);
        const pnl = (price - trade.entry_price) * trade.quantity;
        await this.db(`trades?id=eq.${trade.id}`, 'PATCH', {
          status: 'EMERGENCY_EXIT', closed_at: new Date().toISOString(),
          profit_loss: pnl
        });
        await this.log('WARN', `Emergency sold ${trade.symbol}`, { pnl });
      } catch (e) {
        await this.log('ERROR', `Failed emergency exit ${trade.symbol}: ${e.message}`);
      }
    }
    await this.db('bot_config?id=eq.' + (await this.getConfig())?.id, 'PATCH', {
      emergency_exit: false, is_active: false
    });
  }

  async checkAndClosePositions(config, openTrades) {
    for (const trade of openTrades) {
      try {
        const price = await this.client.getPrice(trade.symbol);
        const pnl = (price - trade.entry_price) * trade.quantity;
        const pnlPct = ((price - trade.entry_price) / trade.entry_price) * 100;

        let shouldClose = false;
        let closeReason = '';

        if (price <= trade.stop_loss_price) {
          shouldClose = true; closeReason = 'Stop Loss Hit';
        } else if (price >= trade.take_profit_price) {
          shouldClose = true; closeReason = 'Take Profit Hit';
        }

        if (shouldClose) {
          await this.client.marketSell(trade.symbol, trade.quantity);
          await this.db(`trades?id=eq.${trade.id}`, 'PATCH', {
            status: 'CLOSED', closed_at: new Date().toISOString(), profit_loss: pnl
          });
          await this.log(pnl > 0 ? 'SUCCESS' : 'WARN', `${closeReason}: ${trade.symbol}`, { pnl: pnl.toFixed(4), pnlPct: pnlPct.toFixed(2) });

          // Update strategy health
          await this.updateStrategyHealth(pnl > 0);
        }
      } catch (e) {
        await this.log('ERROR', `Error checking ${trade.symbol}: ${e.message}`);
      }
    }
  }

  async updateStrategyHealth(isWin) {
    const health = await this.db('strategy_health?limit=1');
    const h = health?.[0];
    if (!h) return;
    const newTotal = h.total_trades + 1;
    const newWins = h.winning_trades + (isWin ? 1 : 0);
    const newLosses = h.losing_trades + (isWin ? 0 : 1);
    const newConsecLoss = isWin ? 0 : h.consecutive_losses + 1;
    const winRate = (newWins / newTotal) * 100;

    const rm = new RiskManager({});
    const { pause, reason } = rm.shouldPauseBot(newConsecLoss, winRate, newTotal);

    await this.db(`strategy_health?id=eq.${h.id}`, 'PATCH', {
      total_trades: newTotal, winning_trades: newWins, losing_trades: newLosses,
      win_rate: winRate, consecutive_losses: newConsecLoss,
      bot_paused: pause, pause_reason: pause ? reason : null,
      evaluated_at: new Date().toISOString()
    });

    if (pause) {
      await this.log('ERROR', `🛑 Bot auto-paused: ${reason}`);
      await this.db('bot_config', 'PATCH', { is_active: false });
    }
  }

  async runCycle() {
    try {
      const config = await this.getConfig();
      if (!config || !config.is_active) { this.stop(); return; }

      // Emergency exit check
      if (config.emergency_exit) { await this.emergencyExit(); this.stop(); return; }

      // Strategy health check
      const health = await this.db('strategy_health?limit=1');
      if (health?.[0]?.bot_paused) {
        await this.log('WARN', `Bot paused: ${health[0].pause_reason}`);
        this.stop(); return;
      }

      const balances = await this.client.getBalance();
      const openTrades = await this.getOpenTrades();
      await this.saveBalance(balances, openTrades);

      // Check existing positions for SL/TP
      await this.checkAndClosePositions(config, openTrades);

      // Try new trades if slots available
      const rm = new RiskManager(config);
      const refreshedTrades = await this.getOpenTrades();
      const usdtBalance = balances['USDT'] || 0;
      const positionSize = rm.calculatePositionSize(usdtBalance, refreshedTrades.length);

      if (positionSize < 1) {
        await this.log('INFO', `No USDT available or max trades reached. USDT: ${usdtBalance.toFixed(2)}`);
        return;
      }

      for (const symbol of config.pairs) {
        const alreadyTrading = refreshedTrades.some(t => t.symbol === symbol);
        if (alreadyTrading) continue;

        const analysis = await StrategyEngine.analyze(this.client, symbol, config.strategy);

        if (analysis.signal === 'BUY' && analysis.confidence >= 65) {
          try {
            const order = await this.client.marketBuy(symbol, positionSize);
            const entryPrice = parseFloat(order.fills?.[0]?.price || order.price);
            const qty = parseFloat(order.executedQty);
            const fee = parseFloat(order.fills?.[0]?.commission || 0);

            await this.db('trades', 'POST', {
              symbol, side: 'BUY', quantity: qty, price: entryPrice,
              total: qty * entryPrice, fee, status: 'OPEN',
              strategy: config.strategy,
              binance_order_id: order.orderId,
              entry_price: entryPrice,
              stop_loss_price: rm.calculateStopLoss(entryPrice, 'BUY'),
              take_profit_price: rm.calculateTakeProfit(entryPrice, 'BUY')
            });

            await this.log('SUCCESS', `✅ BUY ${symbol} @ ${entryPrice}`, { qty, reason: analysis.reason });
          } catch (e) {
            await this.log('ERROR', `BUY failed ${symbol}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      await this.log('ERROR', `Cycle error: ${e.message}`);
    }
  }

  start(intervalMs = 60000) {
    this.running = true;
    this.runCycle();
    this.interval = setInterval(() => this.runCycle(), intervalMs);
    console.log(`Bot started, cycling every ${intervalMs / 1000}s`);
  }

  stop() {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
    console.log('Bot stopped');
  }
}

// Export for use in dashboard
window.TradingBot = TradingBot;
window.BinanceClient = BinanceClient;
window.StrategyEngine = StrategyEngine;
window.Indicators = Indicators;
