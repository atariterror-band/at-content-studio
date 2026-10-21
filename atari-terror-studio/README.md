# AT Content Studio — lokální prototyp

Samostatný prototyp studia pro přípravu návrhů příspěvků z oficiálních klipů kapely. Otevři `index.html` v moderním prohlížeči. Pro spolehlivý náhled a export spusť v kořenové složce projektu lokální statický server (`python3 -m http.server 8765`) a otevři `http://localhost:8765/atari-terror-studio/`.

## Co prototyp umí

- Nahrát fotky a videa z počítače.
- Vybrat složku `Plocha/AT Content Studio/official-videos` a načíst do knihovny její oficiální videoklipy.
- Vybrat skladbu Atari Terror, zkopírovat odkaz na její vyhledání na Spotify a upravit či obměnit text příspěvku.
- Přepínat náhledy Instagram Story (9:16), Feed (4:5), čtverec (1:1), Facebook příspěvek (1.91:1) a Facebook Stories (9:16).
- Stáhnout grafiku v PNG ve velikosti odpovídající vybranému formátu.
- Vytvořit krátké desetisekundové video ve WebM z vybraného obrázku nebo videosouboru. Výstup zachycuje lokální plátno a v této verzi nepřidává hudební stopu.
- Označit návrh ke schválení a ručně pokračovat v publikování přes používaný nástroj kapely.
- Přepínat mezi oddělenými stránkami Studia, Rozpracovaných návrhů, Formátů k exportu a Knihovny médií.
- Procházet obsah podle adresářů; `official-videos` zobrazuje pět nalezených zdrojových klipů a po načtení se aktualizuje podle skutečných souborů.
- Otevřít návrh nebo výstupní formát v přehledovém okně uprostřed stránky a pokračovat odtud do editoru.
- Kliknout na název souboru v knihovně a otevřít tvorbu s vybraným klipem; nenačtený soubor si vyžádá načtení zdrojové složky.

## Zdrojová média

Primárním zdrojem jsou klipy ve složce `Plocha/AT Content Studio/official-videos`. Prohlížeč nedovoluje webové stránce číst složku na Ploše potichu, proto v prototypu stiskni **Načíst Official Videos** a ve výběru složku zvol. Soubory se načtou pouze do aktuální relace; zůstanou ve zdrojové složce a nic se nikam neodesílá. Další fotografie můžeš přidat tlačítkem **Přidat média**.

Pro velké videosoubory používejte Git LFS. Hotové varianty příspěvků se v této verzi do repozitáře nezapisují; stáhnou se do počítače.

## Omezení prototypu

- Návrhy, knihovna nahraných souborů a stav schválení nejsou sdílené mezi členy kapely ani trvale uložené.
- Export videa závisí na podpoře `MediaRecorder` v prohlížeči a vytváří WebM. Pro finální MP4/Reels výstup by následovala serverová nebo lokální renderovací služba s FFmpeg.
- Zvukovou stopu je nutné přidat při finální úpravě a používat pouze média, ke kterým má kapela práva.
- Označení „ke schválení“ je pouze pracovní stav v prototypu; zveřejnění na Instagramu nebo Facebooku zůstává ruční.
- Knihovna médií se při otevření stránky záměrně nespouští s ukázkovým obsahem Creatures; začíná prázdná, dokud nenačteš oficiální videa.
