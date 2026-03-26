# TopListers

**Privacy-first job market intelligence platform.**

Track your job applications in a Kanban board, submit anonymous job sightings, and explore global hiring trends — all without compromising your privacy.

🌐 **Live:** [toplisters.xyz](https://toplisters.xyz)

---

## What it does

### For job seekers
- **Kanban tracker** — drag and drop your applications across stages (Saved → Applied → Interview → Offer)
- **Adzuna-powered job search** — find real jobs directly when adding an application, no manual typing
- **Follow-up reminders** — never let an application go cold
- **Private by default** — your application data is yours only, protected by row-level security

### For the community
- **Anonymous job sightings** — submit a role you've seen open (company + title + city + month only, no PII ever)
- **Global heatmap** — see where hiring is hottest worldwide
- **Trend charts** — monthly hiring trends by role and location
- **Top roles dashboard** — which jobs are being hired most right now

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python · FastAPI · Uvicorn |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Job data | Adzuna API (cached 24hrs) |
| Frontend | React · Vite · Recharts · Leaflet |
| Hosting | Render (backend) · Vercel (frontend) |

---

## Privacy by design

- Zero PII stored in public sightings — no email, no IP, no user ID
- All private data protected by Supabase Row Level Security
- GDPR compliant — cookie consent, right to erasure, privacy policy
- No tracking pixels, no fingerprinting, no analytics without consent

---

## Getting started

### Prerequisites
- Python 3.12+
- Node 20+
- Supabase account (free)
- Adzuna API key (free — developer.adzuna.com)

### Backend setup
```bash
cd backend
cp .env.example .env        # Fill in your keys
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Database setup
1. Create a new project at supabase.com
2. Go to SQL Editor → New Query
3. Paste and run the contents of `backend/supabase_schema.sql`

### Frontend setup
```bash
cd frontend
cp .env.example .env        # Set VITE_API_URL
npm install
npm run dev
```

---

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

By contributing, you agree to our [Contributor License Agreement](CLA.md) — this allows TopListers to be offered under a dual license (AGPL v3 for open source use, commercial license for SaaS deployments).

---

## License

TopListers is open source under the [GNU Affero General Public License v3.0](LICENSE).

For commercial licensing (SaaS deployment, white-labelling, or removing AGPL obligations) contact: **hello@ainika.xyz**

---

## Built by

**Josen Joy** — Senior Product Owner · AI/ML Specialist · MSc Data Science
[ainika.xyz](https://ainika.xyz) · [linkedin.com/in/josenjoy](https://linkedin.com/in/josenjoy) · [github.com/ainikaventures](https://github.com/ainikaventures)
