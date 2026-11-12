# Serverové ukládání Content Studia

Cloudflare Worker přijímá přihlášení, vydává podepsanou relaci a ukládá nebo maže návrhy v GitHubu. Osobní GitHub token zůstává na serveru. Členové kapely nepotřebují GitHub účet ani token.

## Nasazení

Worker je propojený s atariterror-band/at-content-studio na větvi main. Cloudflare Builds používá kořen /worker a při commitu spustí npx wrangler deploy.

V Cloudflare jsou nastavené šifrované secrets GITHUB_TOKEN, STUDIO_PASSWORD a SESSION_SECRET, plus povolený produkční původ ALLOWED_ORIGINS.

Token je spravovatelská závislost: při jeho vypršení (90 dní) správce vygeneruje nový fine-grained token pouze pro tento repozitář s Contents: Read and write a nahradí pouze secret GITHUB_TOKEN. Členové kapely nic nemění.

## API

- POST /auth/login přijme heslo studia a vrátí podepsanou relaci platnou 30 dní.
- POST /api/drafts uloží nebo přesune návrh do content-studio/drafts/ či content-studio/completed/.
- DELETE /api/drafts/:id odstraní návrh z těchto složek.
- Povolená velikost jednoho návrhu je 1 MB.
