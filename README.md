<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/activity.svg" width="80" alt="BizPulse Logo">
  <h1>BizPulse Analytics</h1>
  <p><strong>The McKinsey for Indian SMBs.</strong><br>A fully automated, consultant-grade business health analysis SaaS.</p>
</div>

<div align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?style=flat&logo=nodedotjs" alt="Node.js">
  <img src="https://img.shields.io/badge/Claude_3.5_Sonnet-AI-purple" alt="Claude AI">
  <img src="https://img.shields.io/badge/Supabase-Database-1D9E75?logo=supabase" alt="Supabase">
  <img src="https://img.shields.io/badge/Upstash-Redis-red?logo=redis" alt="Redis">
  <img src="https://img.shields.io/badge/Vercel-%26_Render-black" alt="Deployed">
</div>

<br>

BizPulse is a distributed SaaS application that ingests messy, real-world financial data exports (from Tally, Zoho, etc.) and performs advanced AI-driven differential analysis. Within 60 seconds, it generates an institutional-grade Executive PDF Report highlighting P&L leaks, customer risks, and growth opportunities.

---

## ⚡ Features

- **Decoupled Architecture:** Heavy AI context parsing and PDF rendering is shifted to a background `BullMQ` thread to ensure 100% API uptime.
- **AI Analytics Engine:** Powers structural financial health grading utilizing Anthropoic's `claude-3-5-sonnet` models without hallucinations.
- **Freemium Lifecycle (Integrated Razorpay):** Features a "First Upload Free" mechanic gated by local tracking and a strict Razorpay Checkout Paywall for recurring uploads.
- **Signed URL Persistence:** Temporary URL bucket sharing ensures PDF payload files never stall the backend. Heavily secured with Supabase RLS.

## 🛠 Tech Stack

| Component | Technology | Description |
|-----------|---|---|
| **Frontend** | `Next.js`, React, Tailwind | Highly engaging landing page with React Dropzones and dynamic payment flows. Hosted on **Vercel**. |
| **Backend API** | `Node.js`, Express, Multer | File pipeline, queue manager, and cryptographic Razorpay Webhook listener. Hosted on **Render**. |
| **Worker Engine** | `BullMQ`, Puppeteer | Isolated background thread running Google Chrome natively to construct beautiful PDF templates. |
| **Database** | Supabase | Manages the `reports` schema and signed URL blob storage. |
| **Queue Layer** | Redis (Upstash) | Facilitates cross-container state management for job progress polling. |

---

## 🚀 Running Locally

### 1. Root Setup (Backend)
Clone the repository and install Node backend dependencies.
```bash
git clone https://github.com/Sk4saurav/BizPulse.git
cd BizPulse
npm install
```

Create a `.env` file referencing the `SUPABASE`, `ANTHROPIC_API_KEY`, `RAZORPAY`, and `REDIS_URL` credentials:
```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxx
REDIS_URL=rediss://default:xxxx@upstash.io:6379
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhb...
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_SECRET=xxxx
RAZORPAY_WEBHOOK_SECRET=xxxx
```

Boot the concurrent environment (boots both API and Worker locally):
```bash
npm start
```

### 2. Web Setup (Frontend)
Open a new terminal to start the Next.js client.

```bash
cd web
npm install
```

Create a `.env.local` inside `/web`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_RAZORPAY_KEY=rzp_test_xxxx
```

Boot the client:
```bash
npm run dev
```

---

## ☁️ Zero-Cost Cloud Deployment

This project is meticulously configured to run globally without a credit card.
- **Frontend** connects directly to **Vercel**.
- **Backend (API & Worker)** binds to **Render.com** (utilizing the included `render.yaml` Free Service blueprint). Make sure to inject the Docker Chrome configs dynamically!
- **State & SQL** leverages free-tier limits on **Supabase** and **Upstash Redis**.
