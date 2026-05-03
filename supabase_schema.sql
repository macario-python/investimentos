-- ============================================================
--  AlertaInvest — Schema Supabase
--  Cole isso no SQL Editor do Supabase e clique em Run
-- ============================================================

-- 1. Tabela de configurações de threshold por ativo
CREATE TABLE IF NOT EXISTS thresholds (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker      TEXT NOT NULL UNIQUE,
  threshold   NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Histórico de preços coletados
CREATE TABLE IF NOT EXISTS price_history (
  id          BIGSERIAL PRIMARY KEY,
  ticker      TEXT NOT NULL,
  price       NUMERIC(12,4) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'BRL',
  asset_type  TEXT NOT NULL, -- 'br', 'intl', 'fii', 'crypto'
  captured_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para consultas rápidas por ticker + data
CREATE INDEX IF NOT EXISTS idx_price_history_ticker_date
  ON price_history (ticker, captured_at DESC);

-- 3. Log de alertas disparados
CREATE TABLE IF NOT EXISTS alert_log (
  id           BIGSERIAL PRIMARY KEY,
  ticker       TEXT NOT NULL,
  asset_name   TEXT,
  price_at_alert NUMERIC(12,4),
  compra_price   NUMERIC(12,4),
  change_pct     NUMERIC(6,2),
  threshold_pct  NUMERIC(5,2),
  currency       TEXT DEFAULT 'BRL',
  fx_rate        NUMERIC(8,4),
  triggered_at   TIMESTAMPTZ DEFAULT now(),
  notified       BOOLEAN DEFAULT false
);

-- 4. Configuração geral do app
CREATE TABLE IF NOT EXISTS app_config (
  key    TEXT PRIMARY KEY,
  value  TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Valores padrão de configuração
INSERT INTO app_config (key, value) VALUES
  ('interval_min',  '5'),
  ('fx_usd_brl',    '4.975'),
  ('sound_enabled', 'true'),
  ('last_scan',     NULL)
ON CONFLICT (key) DO NOTHING;

-- 5. Thresholds padrão da carteira Renato
INSERT INTO thresholds (ticker, threshold, ativo) VALUES
  ('VALE3',  5.0, true),
  ('PETR4',  5.0, true),
  ('BBAS3',  5.0, true),
  ('ABEV3',  5.0, true),
  ('CPTS11', 5.0, true),
  ('AZZA3',  5.0, true),
  ('CURY3',  7.0, true),
  ('BMOB3',  7.0, true),
  ('DIRR3',  7.0, true),
  ('SIMH3',  8.0, true),
  ('O',      5.0, true),
  ('TSM',    5.0, true),
  ('BABA',   8.0, true),
  ('TCEHY',  7.0, true),
  ('PDD',    8.0, true),
  ('SONY',   6.0, true),
  ('RNDR',  10.0, true),
  ('USDT',   2.0, true),
  ('BNB',    8.0, true)
ON CONFLICT (ticker) DO NOTHING;

-- ============================================================
--  Row Level Security — deixa público por enquanto
--  (adicione auth depois se quiser multi-usuário)
-- ============================================================
ALTER TABLE thresholds    ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config    ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas (acesso via service key no backend)
CREATE POLICY "service_full_access" ON thresholds    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON price_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON alert_log     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON app_config    FOR ALL USING (true) WITH CHECK (true);
