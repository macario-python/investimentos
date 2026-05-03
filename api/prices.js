// api/prices.js — APIs GRATUITAS: Brapi (B3), CoinGecko (Cripto), Yahoo Finance (Intl)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ASSETS = [
  { id:'VALE3',  name:'Vale S.A.',       type:'br',     compra:87.68 },
  { id:'PETR4',  name:'Petrobras PN',    type:'br',     compra:49.68 },
  { id:'BBAS3',  name:'Banco do Brasil', type:'br',     compra:24.60 },
  { id:'ABEV3',  name:'Ambev',           type:'br',     compra:15.86 },
  { id:'CPTS11', name:'Capitânia Sec.',  type:'fii',    compra:8.12  },
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

async function fetchBR() {
  const tickers = ASSETS.filter(a=>a.type==='br'||a.type==='fii').map(a=>a.id).join(',');
  const res = await fetch(`https://brapi.dev/api/quote/${tickers}?token=guest`);
  const data = await res.json();
  const prices = {};
  (data.results||[]).forEach(item => {
    if (item.regularMarketPrice) prices[item.symbol] = item.regularMarketPrice;
  });
  return prices;
}

async function fetchIntl() {
  const tickers = ['O','TSM','BABA','TCEHY','PDD','SONY'].join('%2C');
  const res = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers}&fields=regularMarketPrice`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const data = await res.json();
  const prices = {};
  (data?.quoteResponse?.result||[]).forEach(q => {
    if (q.regularMarketPrice) prices[q.symbol] = q.regularMarketPrice;
  });
  return prices;
}

async function fetchCrypto() {
  const coinMap = { 'render-token':'RNDR', 'tether':'USDT', 'binancecoin':'BNB' };
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${Object.keys(coinMap).join(',')}&vs_currencies=usd`
  );
  const data = await res.json();
  const prices = {};
  Object.entries(coinMap).forEach(([id, ticker]) => {
    if (data[id]?.usd) prices[ticker] = data[id].usd;
  });
  return prices;
}

async function fetchFX() {
  try {
    const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const data = await res.json();
    return parseFloat(data.USDBRL?.bid || '4.975');
  } catch { return 4.975; }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data: latestPrices } = await supabase
        .from('price_history').select('ticker,price,currency,asset_type,captured_at')
        .order('captured_at', { ascending: false }).limit(200);

      const seen = new Set(), prices = {};
      (latestPrices||[]).forEach(row => {
        if (!seen.has(row.ticker)) { seen.add(row.ticker); prices[row.ticker] = row.price; }
      });

      const { data: thresholds } = await supabase.from('thresholds').select('ticker,threshold,ativo');
      const { data: fxConfig }   = await supabase.from('app_config').select('value').eq('key','fx_usd_brl').single();
      const { data: recentAlerts } = await supabase.from('alert_log').select('*')
        .order('triggered_at',{ascending:false}).limit(20);

      return res.json({
        prices,
        thresholds: Object.fromEntries((thresholds||[]).map(t=>[t.ticker,{value:t.threshold,ativo:t.ativo}])),
        fx: parseFloat(fxConfig?.value||'4.975'),
        recentAlerts: recentAlerts||[],
        cached: true
      });
    }

    if (req.method === 'POST') {
      const body = req.body||{};

      if (body.action==='set_threshold' && body.ticker) {
        await supabase.from('thresholds').upsert(
          { ticker:body.ticker, threshold:parseFloat(body.threshold), updated_at:new Date().toISOString() },
          { onConflict:'ticker' }
        );
        return res.json({ ok:true });
      }

      const [brPrices, intlPrices, cryptoPrices, fx] = await Promise.all([
        fetchBR().catch(()=>({})),
        fetchIntl().catch(()=>({})),
        fetchCrypto().catch(()=>({})),
        fetchFX().catch(()=>4.975),
      ]);

      const allPrices = { ...brPrices, ...intlPrices, ...cryptoPrices };
      const timestamp = new Date().toISOString();

      const historyRows = ASSETS.filter(a=>allPrices[a.id]!=null).map(a=>({
        ticker: a.id,
        price: allPrices[a.id],
        currency: (a.type==='br'||a.type==='fii') ? 'BRL' : 'USD',
        asset_type: a.type,
        captured_at: timestamp
      }));

      if (historyRows.length) await supabase.from('price_history').insert(historyRows);

      await supabase.from('app_config').upsert([
        { key:'fx_usd_brl', value:String(fx),  updated_at:timestamp },
        { key:'last_scan',  value:timestamp,    updated_at:timestamp }
      ]);

      const { data: thresholds } = await supabase.from('thresholds')
        .select('ticker,threshold').eq('ativo',true);

      const alerts = [];
      (thresholds||[]).forEach(t => {
        const price = allPrices[t.ticker];
        const asset = ASSETS.find(a=>a.id===t.ticker);
        if (!price||!asset) return;
        const changePct = ((price - asset.compra) / asset.compra) * 100;
        if (changePct <= -t.threshold) {
          alerts.push({
            ticker: t.ticker, asset_name: asset.name,
            price_at_alert: price, compra_price: asset.compra,
            change_pct: changePct, threshold_pct: t.threshold,
            currency: (asset.type==='br'||asset.type==='fii') ? 'BRL' : 'USD',
            fx_rate: fx
          });
        }
      });

      if (alerts.length) await supabase.from('alert_log').insert(alerts);

      return res.json({
        prices: allPrices, fx, alerts, timestamp,
        rows_saved: historyRows.length,
        sources: {
          br: `${Object.keys(brPrices).length} ativos via Brapi`,
          intl: `${Object.keys(intlPrices).length} ativos via Yahoo Finance`,
          crypto: `${Object.keys(cryptoPrices).length} ativos via CoinGecko`,
          fx: `USD/BRL = ${fx} via AwesomeAPI`
        }
      });
    }

    return res.status(405).json({ error:'Method not allowed' });

  } catch(err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
};