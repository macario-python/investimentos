// api/cron.js
// Vercel Cron Job — roda automaticamente a cada 5 minutos
// Configure em vercel.json: "crons": [{"path": "/api/cron", "schedule": "*/5 * * * *"}]

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  // Segurança: só aceita chamadas do próprio Vercel Cron
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Dispara o scan chamando nossa própria API
    const baseUrl = `https://${req.headers.host}`;
    const scanRes = await fetch(`${baseUrl}/api/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scan' })
    });
    const data = await scanRes.json();

    // Se houver alertas novos, loga
    if (data.alerts?.length > 0) {
      console.log(`🚨 ALERTAS DISPARADOS: ${data.alerts.map(a => a.ticker).join(', ')}`);
    }

    return res.json({
      ok: true,
      scanned: data.rows_saved,
      alerts: data.alerts?.length || 0,
      timestamp: data.timestamp
    });

  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
