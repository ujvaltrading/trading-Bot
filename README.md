# ⚡ CryptoBot Pro — Binance Trading Bot

A full-featured Binance trading bot with real-time dashboard, multiple strategies, risk management, and emergency controls. Deployable via GitHub Pages + Supabase.

---

## 🚀 Quick Deployment (15 minutes)

### Step 1: Set Up Supabase Database

1. Go to [supabase.com](https://supabase.com) → Create a free account
2. Create a new project (remember your database password)
3. Go to **SQL Editor** → Click **New Query**
4. Paste the entire contents of `supabase/migrations/001_init.sql`
5. Click **Run**
6. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public key** (long JWT string)

### Step 2: Deploy to GitHub Pages

1. Create a new GitHub repository (e.g., `my-crypto-bot`)
2. Upload all files from this folder to the repository:
   ```
   index.html
   src/bot-engine.js
   supabase/migrations/001_init.sql
   README.md
   ```
3. Go to **Settings → Pages**
4. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)`
5. Click **Save**
6. Your bot URL will be: `https://yourusername.github.io/my-crypto-bot`

### Step 3: Configure the Bot

1. Open your GitHub Pages URL
2. Enter your **Supabase URL** and **Supabase Anon Key**
3. Click **Connect & Launch Dashboard**
4. Go to **Configuration → API Keys** tab
5. Enter your **Binance API Key** and **Secret Key**
   - ⚠️ Enable "Use Testnet" first for testing!
6. Configure your strategy and risk settings
7. Click **Save Configuration**
8. Click **▶ START BOT**

---

## 🔑 Getting Binance API Keys

### Testnet (Recommended for Testing)
1. Go to [testnet.binance.vision](https://testnet.binance.vision)
2. Log in with GitHub
3. Click **Generate HMAC_SHA256 Key**
4. Copy both keys — check "Use Testnet" in bot settings

### Live Trading
1. Go to [binance.com](https://binance.com) → Profile → API Management
2. Create API → Enable **Spot & Margin Trading**
3. **DISABLE** withdrawals for security
4. Whitelist your IP address if possible
5. Copy API Key and Secret

---

## 📊 Strategies Explained

### 📈 Trend Follow (EMA Cross) — Recommended for Beginners
- Uses EMA 20 and EMA 50 crossovers
- Buys on "Golden Cross" (EMA20 crosses above EMA50)
- Filters with RSI to avoid overbought entries
- Best for: trending markets, 15m–1h timeframes

### 📊 RSI + MACD — Intermediate
- Buys when RSI < 35 AND MACD histogram is improving
- Sells when RSI > 65 AND MACD histogram is declining
- Best for: range-bound markets, catching reversals

### 〰️ Bollinger Bounce — Advanced
- Buys when price touches lower Bollinger Band + RSI oversold
- Sells when price touches upper Bollinger Band + RSI overbought
- Best for: sideways markets, mean-reversion plays

---

## ⚠️ Risk Management Features

| Feature | Description |
|---------|-------------|
| **Max Trades** | Bot won't open more than N positions simultaneously |
| **Risk Per Trade** | % of available USDT used per trade |
| **Stop Loss** | Auto market-sell if price drops X% from entry |
| **Take Profit** | Auto market-sell when profit target reached |
| **Auto-Pause** | Bot pauses after 3 consecutive losses |
| **Win Rate Guard** | Bot pauses if win rate drops below 30% after 10+ trades |
| **Emergency Exit** | Instantly market-sells ALL open positions |

---

## 💡 Recommended Settings for $10

```
Strategy: Trend Follow (EMA Cross)
Max Trades: 2
Risk Per Trade: 20%  (= $2 per trade)
Stop Loss: 0.8%
Take Profit: 1.5%
Min Profit: 0.5%
Pairs: BTCUSDT, ETHUSDT
Cycle: 5 minutes
```

With these settings:
- Each trade risks ~$2
- Need 0.5%+ move to profit after fees
- Bot auto-stops after 3 bad trades in a row
- Max loss scenario: ~$4 before auto-pause

---

## 🏗️ Architecture

```
GitHub Pages (Frontend)
    │
    ├── index.html          — Dashboard UI
    └── src/bot-engine.js   — Bot logic runs in browser
            │
            ├── Binance API — Live market data & trading
            └── Supabase    — Config, trade logs, balance history
```

The bot runs **in your browser tab**. Keep the tab open for the bot to run.
For 24/7 operation, deploy `src/bot-engine.js` as a **Supabase Edge Function**.

---

## 🔒 Security Notes

- API Keys are stored in Supabase (encrypted at rest)
- Never share your Supabase anon key publicly
- Consider enabling Supabase Row Level Security with auth
- Always test with Testnet before using real funds
- Start with small amounts ($10–$50) to validate strategy

---

## 📁 File Structure

```
binance-bot/
├── index.html                    # Main dashboard
├── src/
│   └── bot-engine.js             # Bot core (trading logic, indicators)
├── supabase/
│   └── migrations/
│       └── 001_init.sql          # Database schema
└── README.md
```

---

## ⚡ Supabase Edge Function (Optional: 24/7 Bot)

To run the bot 24/7 without keeping browser open:

1. Install Supabase CLI: `npm install -g supabase`
2. Copy the trading logic from `bot-engine.js` into a Deno Edge Function
3. Deploy: `supabase functions deploy trading-bot`
4. Set up a cron trigger in Supabase Dashboard

---

## ⚠️ Disclaimer

**This bot is for educational purposes. Cryptocurrency trading involves significant risk of loss. Never trade with money you cannot afford to lose. Past performance does not guarantee future results. Always test with Testnet first.**
