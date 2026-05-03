// api/prices.js
// Vercel Serverless Function
// GET  /api/prices        → retorna preços atuais + thresholds do Supabase
// POST /api/prices        → força novo scan e salva no histórico

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Carteira fixa (mesma do front)
const ASSETS = [
  { id:'VALE3',  name:'Vale S.A.',       type:'br',     compra:87.68 },
  { id:'PETR4',  name:'Petrobras PN',    type:'br',     compra:49.68 },
  { id:'BBAS3',  name:'Banco do Brasil', type:'br',     compra:24.60 },
  { id:'ABEV3',  name:'Ambev',           type:'br',     compra:15.86 },
  { id:'CPTS11', name:'Capitânia Sec.', type:'fii',    compra:8.12  },
  { id:'AZZA3',  name:'Azzas 2154',      type:'br',     compra:21.28 },
  { id:'CURY3',  name:'Cury',            type:'br',     compra:27.40 },
  { id:'BMOB3',  name:'Biomob',          type:'br',     compra:34.60 },
  { id:'DIRR3',  name:'Direcional',      type:'br',     compra:14.85 },
  { id:'SIMH3',  name:'Simpar',          type:'br',     compra:21.28 },
  { id:'O',      name:'Realty Income',   type:'intl',   compra:63.73 },
  { id:'TSM',    name:'TSMC ADR',        type:'intl',   compra:133.28},
  { id:'BABA',   name:'Alibaba ADR',     type:'intl',   compra:101.97},
  { id:'TCEHY',  name:'Tencent OTC',     type:'intl',   compra:63.61 },
  { id:'PDD',    name:'PDD Holdings',    type:'intl',   compra:375.10},
  { id:'SONY',   name:'Sony ADR',        type:'intl',   compra:21.28 },
  { id:'RNDR',   name:'Render',          type:'crypto', compra:1.75  },
  { id:'USDT',   name:'USDT Earn',       type:'crypto', compra:1.00  },
  { id:'BNB',    name:'Binance Coin',    type:'crypto', compra:617.0 },
];

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'Assistente financeiro. Responda APENAS com JSON válido, sem texto extra.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return null; }
}

async function fetchAllPrices() {
  const brTickers  = ASSETS.filter(a => a.type==='br'||a.type==='fii').map(a=>a.id).join(', ');
  const intlTickers = ASSETS.filter(a => a.type==='intl').map(a=>a.id).join(', ');
  const cryptoTickers = ASSETS.filter(a => a.type==='crypto').map(a=>a.id).join(', ');

  const [brPrices, intlPrices, cryptoPrices, fxData] = await Promise.all([
    callClaude(`Cotação atual B3 das ações: ${brTickers}. Retorne APENAS JSON: {"VALE3":81.47,...}`),
    callClaude(`Preço atual USD: ${intlTickers}. Retorne APENAS JSON: {"O":63.82,...}`),
    callClaude(`Preço atual USD cripto: ${cryptoTickers}. Retorne APENAS JSON: {"RNDR":1.68,"USDT":1.00,"BNB":617.0}`),
    callClaude(`Cotação USD/BRL agora. Retorne APENAS JSON: {"usd_brl":4.975}`)
  ]);

  return {
    prices: { ...brPrices, ...intlPrices, ...cryptoPrices },
    fx: fxData?.usd_brl || 4.975,
    timestamp: new Date().toISOString()
  };
}

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET: retorna dados mais recentes do banco
    if (req.method === 'GET') {
      // Último preço de cada ticker
      const { data: latestPrices } = await supabase
        .from('price_history')
        .select('ticker, price, currency, asset_type, captured_at')
        .order('captured_at', { ascending: false });

      // Deduplica — pega só o mais recente de cada ticker
      const seen = new Set();
      const prices = {};
      (latestPrices || []).forEach(row => {
        if (!seen.has(row.ticker)) {
          seen.add(row.ticker);
          prices[row.ticker] = row.price;
        }
      });

      // Thresholds
      const { data: thresholds } = await supabase
        .from('thresholds')
        .select('ticker, threshold, ativo');

      // FX
      const { data: fxConfig } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'fx_usd_brl')
        .single();

      // Últimos alertas
      const { data: recentAlerts } = await supabase
        .from('alert_log')
        .select('*')
        .order('triggered_at', { ascending: false })
        .limit(20);

      return res.json({
        prices,
        thresholds: Object.fromEntries((thresholds||[]).map(t => [t.ticker, { value: t.threshold, ativo: t.ativo }])),
        fx: parseFloat(fxConfig?.value || '4.975'),
        recentAlerts: recentAlerts || [],
        cached: true
      });
    }

    // POST: força novo scan
    if (req.method === 'POST') {
      const { action, ticker, threshold } = req.body || {};

      // Atualizar threshold de um ativo
      if (action === 'set_threshold' && ticker) {
        await supabase
          .from('thresholds')
          .upsert({ ticker, threshold: parseFloat(threshold), updated_at: new Date().toISOString() }, { onConflict: 'ticker' });
        return res.json({ ok: true });
      }

      // Scan completo
      const { prices, fx, timestamp } = await fetchAllPrices();

      // Salva histórico de preços
      const historyRows = ASSETS
        .filter(a => prices[a.id] != null)
        .map(a => ({
          ticker: a.id,
          price: prices[a.id],
          currency: (a.type === 'br' || a.type === 'fii') ? 'BRL' : 'USD',
          asset_type: a.type,
          captured_at: timestamp
        }));

      if (historyRows.length) {
        await supabase.from('price_history').insert(historyRows);
      }

      // Atualiza FX
      await supabase
        .from('app_config')
        .upsert({ key: 'fx_usd_brl', value: String(fx), updated_at: timestamp });

      // Atualiza last_scan
      await supabase
        .from('app_config')
        .upsert({ key: 'last_scan', value: timestamp });

      // Verifica e loga alertas
      const { data: thresholds } = await supabase
        .from('thresholds')
        .select('ticker, threshold')
        .eq('ativo', true);

      const alerts = [];
      (thresholds || []).forEach(t => {
        const price = prices[t.ticker];
        const asset = ASSETS.find(a => a.id === t.ticker);
        if (!price || !asset) return;
        const changePct = ((price - asset.compra) / asset.compra) * 100;
        if (changePct <= -t.threshold) {
          alerts.push({
            ticker: t.ticker,
            asset_name: asset.name,
            price_at_alert: price,
            compra_price: asset.compra,
            change_pct: changePct,
            threshold_pct: t.threshold,
            currency: (asset.type==='br'||asset.type==='fii') ? 'BRL' : 'USD',
            fx_rate: fx
          });
        }
      });

      if (alerts.length) {
        await supabase.from('alert_log').insert(alerts);
      }

      return res.json({
        prices,
        fx,
        alerts,
        timestamp,
        rows_saved: historyRows.length
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
