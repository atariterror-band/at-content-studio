# Serverové ukládání Content Studia

Cloudflare Worker přijímá přihlášení, vydává podepsanou relaci a ukládá nebo maže návrhy v GitHubu. Osobní GitHub token zůstává na serveru. Členové kapely nepotřebují GitHub účet ani token.

## Nasazení správcem

1. V Cloudflare vytvoř Worker pojmenovaný `at-content-studio-api` a nasaď tento adresář (`worker/`) přes Wrangler nebo propojený Git repozitář.
2. V **Workers & Pages → at-content-studio-api → Settings → Variables and Secrets** přidej jako typ **Secret**:
   - `GITHUB_TOKEN`: nový fine-grained token vytvořený správcem, pouze pro `atariterror-band/at-content-studio`, s `Contents: Read and write`.
   - `STUDIO_PASSWORD`: přístupové heslo pro členy kapely.
   - `SESSION_SECRET`: náhodný řetězec dlouhý alespoň 32 znaků.
3. Přidej běžnou proměnnou `ALLOWED_ORIGINS` s původem produkční stránky, např. `https://atariterror-band.github.io`. Vlastní doménu případně přidej jako další hodnotu oddělenou čárkou.
4. Worker zobrazí adresu ve tvaru `https://at-content-studio-api.<account-subdomain>.workers.dev`.
5. V `atari-terror-studio/config.js` nastav `window.AT_CONTENT_STUDIO_API` na tuto adresu a publikuj stránku. `ALLOWED_ORIGINS` musí přesně odpovídat doméně stránky.

Token se nastavuje jednou v Cloudflare. Když GitHub token vyprší, správce vytvoří nový a v Cloudflare nahradí pouze `GITHUB_TOKEN`; členové kapely nic nemění. Starý token vložený do veřejného kódu či konverzace znovu nepoužívej.

## Ověření po nasazení

Přihlas se do Studia, ulož testovací rozpracovaný návrh a ověř jeho soubor v `content-studio/drafts/`. Ulož jej jako hotový a ověř přesun do `content-studio/completed/`. API omezuje ukládání na tyto složky a návrhy do 1 MB.
