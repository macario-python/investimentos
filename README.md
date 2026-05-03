# ⚡ AlertaInvest — Monitor de Oportunidades

App PWA para monitorar quedas de ações e receber alertas no celular.

---

## 🗂 Estrutura do projeto

```
alertainvest/
├── public/
│   ├── index.html       ← Front-end do app (PWA)
│   ├── sw.js            ← Service Worker (push notifications)
│   └── manifest.json    ← Manifesto PWA
├── api/
│   ├── prices.js        ← Serverless function: busca preços + salva no Supabase
│   └── cron.js          ← Cron job automático a cada 5 min (Vercel)
├── supabase_schema.sql  ← Cole no SQL Editor do Supabase
├── vercel.json          ← Config do Vercel (rotas + cron)
├── package.json
├── .env.example         ← Modelo das variáveis de ambiente
└── .gitignore
```

---

## 🚀 PASSO A PASSO — Deploy completo

### 1. Supabase — criar banco

1. Acesse [supabase.com](https://supabase.com) → seu projeto
2. No menu lateral: **SQL Editor** → **New query**
3. Cole todo o conteúdo de `supabase_schema.sql` e clique **Run**
4. Vá em **Settings → API** e copie:
   - `Project URL` → sua `SUPABASE_URL`
   - `anon public` → sua `SUPABASE_ANON_KEY`
   - `service_role` → sua `SUPABASE_SERVICE_KEY` ⚠️ nunca exponha no front

---

### 2. GitHub — subir o código

```bash
# No terminal, dentro da pasta do projeto:
git init
git add .
git commit -m "feat: AlertaInvest inicial"

# Crie um repo no github.com (ex: alertainvest) e rode:
git remote add origin https://github.com/SEU_USUARIO/alertainvest.git
git branch -M main
git push -u origin main
```

---

### 3. Vercel — conectar e configurar

1. Acesse [vercel.com](https://vercel.com) → **Add New Project**
2. Importe o repositório `alertainvest` do GitHub
3. Em **Environment Variables**, adicione:

| Nome | Valor |
|------|-------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJ...` (anon public) |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (service_role) |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `CRON_SECRET` | qualquer senha forte ex: `minha-senha-123` |

4. Clique **Deploy** — em ~1 minuto estará no ar
5. Sua URL será: `https://alertainvest.vercel.app` (ou similar)

---

### 4. Configurar o front com suas chaves

Abra `public/index.html` e edite as linhas no topo do `<script>`:

```js
const SUPABASE_URL  = 'https://xxxx.supabase.co';     // ← sua URL
const SUPABASE_ANON = 'eyJhbGci...';                   // ← sua anon key
```

Depois faça um novo push:
```bash
git add public/index.html
git commit -m "config: supabase keys"
git push
```

O Vercel redeploya automaticamente.

---

### 5. Instalar como app no celular

**Android (Chrome):**
1. Abra a URL do app no Chrome
2. Toque em ⋮ → **Adicionar à tela inicial**

**iPhone (Safari):**
1. Abra a URL no Safari
2. Toque em **Compartilhar** (ícone de seta) → **Adicionar à Tela de Início**

---

## ⚙️ Como funciona

| Camada | Função |
|--------|--------|
| **Vercel Cron** | A cada 5 min chama `/api/cron` automaticamente |
| **`/api/prices`** | Busca preços via Claude API (web search) e salva no Supabase |
| **Supabase Realtime** | Notifica o app instantaneamente quando novos preços chegam |
| **Front-end PWA** | Exibe o painel, detecta alertas, dispara push no celular |
| **Service Worker** | Mantém o app funcional offline e recebe push notifications |

---

## 📊 Tabelas no Supabase

| Tabela | Dados |
|--------|-------|
| `thresholds` | % de queda configurado por ativo |
| `price_history` | Histórico de todos os preços coletados |
| `alert_log` | Log de cada alerta disparado |
| `app_config` | Configurações gerais (intervalo, FX, etc.) |

---

## 🔧 Personalizar alertas

No app, em cada card de ativo, há um campo **"Alerta X%"**.
Ao mudar o valor, ele salva automaticamente no Supabase.

---

## ❓ Problemas comuns

**App não recebe notificações no iPhone:**
- Safari requer iOS 16.4+ para push notifications de PWA
- O app deve estar instalado na tela inicial (não funciona direto no browser)

**Cron não está rodando:**
- Verifique se o `CRON_SECRET` está configurado no Vercel
- O plano gratuito do Vercel suporta crons com limite de execuções/dia

**Supabase não conecta:**
- Verifique se as variáveis de ambiente estão corretas no Vercel
- Confirme que o schema SQL foi executado com sucesso
