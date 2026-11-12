# Atari Terror Content Studio

Webová aplikace pro skládání příspěvků z médií kapely, výběr formátu a uložení návrhů do repozitáře `atariterror-band/at-content-studio`.

## Export videa

Video se exportuje lokálně v prohlížeči. Studio nahraje obrazovou vrstvu v pevné snímkové frekvenci a FFmpeg.wasm ji spojí s původní zvukovou stopou, oříznutou podle vybraných snímků. Výstupem je MP4 s H.264 a AAC, jeho délka odpovídá počtu vybraných snímků při 25 fps. Zdrojové video se neposílá na renderovací server.

Před a za zvoleným úsekem se při záznamu přidá nejvýše tří snímková rezerva (120 ms při 25 fps). Při skládání se tato rezerva z obrazu odstraní; zvuk i výsledný počet snímků zůstávají svázané s přesným výběrem. Na začátku nebo konci zdroje se rezerva zkrátí podle dostupných snímků.

Při prvním video exportu se stáhne jednovláknové jádro FFmpeg.wasm (přibližně 30 MB) z CDN jsDelivr. Potom se načte z cache prohlížeče. Prohlížečový export je náročný na paměť a zpracování může trvat déle než délka výsledného videa; kvůli paměti je velikost zdrojového videa omezena na 200 MB. Uživatel uvidí průběh načítání a renderování.

Soubor `assets/ffmpeg-export.js` a složka `assets/ffmpeg/` obsahují připnutý wrapper `@ffmpeg/ffmpeg` 0.12.15 (MIT). FFmpeg core 0.12.9 (GPL-2.0-or-later) se načítá z CDN podle `assets/ffmpeg/NOTICE.txt`. Repozitář obsahuje potřebné licenční upozornění.

Export obrázkového obsahu zůstává klientský záznam plátna bez FFmpeg. Prohlížeč musí podporovat `MediaRecorder`, Web Workers, WebAssembly a síťové požadavky na jsDelivr.

## Nasazení

GitHub Pages hostuje statické HTML/CSS/JavaScript. Nejsou potřeba vlastní servery ani běhové funkce. Otevři nasazený web přes HTTPS; exportní jádro a videosoubory načítané z GitHub knihovny vyžadují internetové připojení a povolené CORS požadavky.
