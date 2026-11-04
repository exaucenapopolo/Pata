# Pata

Application Next.js de gestion financière personnelle.

## Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

Renseigne les variables Firebase, Fapshi et IA dans `.env.local`. Ne publie jamais les secrets Firebase Admin, Fapshi, Groq, Gemini ou le secret Cron.

## IA et automatisations

Consulte [`docs/IA_ET_AUTOMATISATIONS.md`](docs/IA_ET_AUTOMATISATIONS.md) pour les améliorations apportées, les routes, les bilans hebdomadaires automatiques et la configuration du planificateur Vercel.
