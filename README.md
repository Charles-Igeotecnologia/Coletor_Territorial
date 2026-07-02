# Coletor Territorial

Aplicação web (PWA) para coleta de dados territoriais offline com formulário dinâmico, GNSS do celular, mapa e exportação geoespacial (CSV, KML, GeoJSON e Shapefile).

## Estrutura

```
ColetorTerritorial/
├── index.html              # Layout, telas, navegação
├── styles.css              # Tema campo (alto contraste, dark mode, acessível)
├── app.js                  # Lógica (IndexedDB, formulário, GNSS, mapa, export)
├── sw.js                   # Service Worker (cache offline)
├── manifest.webmanifest    # Manifest PWA
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Como executar

### Requisito crítico: HTTPS

O GNSS (`navigator.geolocation`) **só funciona em HTTPS** ou em `localhost`. Em `http://` comum o navegador bloqueia a captura.

### Opção A — desenvolvimento local

**Atalho rápido (Windows):** dê duplo-clique em [`iniciar.bat`](./iniciar.bat) — ele inicia o servidor local e abre o app no navegador automaticamente. Mantenha a janela aberta enquanto usa o app.

Ou manualmente:

```bash
# Python (se instalado)
python -m http.server 8080
# acessar http://localhost:8080  (GNSS funciona em localhost)
```

```bash
# Node.js
npx serve .
```

> ⚠️ **Nunca abra `index.html` direto pelo Explorer/Finder (protocolo `file://`).**
> O app usa um script ES module (`type="module"`), que os navegadores bloqueiam
> em `file://` por política de CORS — nenhum botão vai responder. O GNSS e o
> Service Worker também exigem HTTPS ou `localhost`, e não funcionam em
> `file://`. É sempre necessário um servidor local ou hospedagem online.

### Opção B — produção (recomendado)

Publique a pasta em qualquer host estático com HTTPS:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- ou seu próprio servidor web com TLS

Depois de carregar a página uma vez online, instale como PWA (menu do navegador → "Adicionar à tela inicial"). A partir daí o Service Worker garante funcionamento offline.

## Funcionalidades

- **Construtor de formulário dinâmico** com 10 tipos de campo e versionamento de schema.
- **Coleta offline** com armazenamento em IndexedDB (persistente).
- **GNSS** com captura única, monitoramento contínuo e entrada manual com preservação da coordenada original.
- **Mapa Leaflet** com pop-ups dinâmicos baseados nos campos do formulário, seletor de camadas base (Ruas, Satélite online e imagens locais) e miniatura de localização na tela de Coleta.
- **Validação** de campos obrigatórios, coordenadas e tipos numéricos.
- **Exportação**:
  - **CSV** — UTF-8 com BOM (abre certo no Excel pt-BR), separador configurável.
  - **KML** — para Google Earth, ordem lon,lat,alt.
  - **GeoJSON** — FeatureCollection, ordem lon,lat.
  - **Shapefile (.zip)** — via `@crmackey/shp-write`, com mapeamento automático de nomes de campo ≤ 10 caracteres exibido antes do download.
- **Acessibilidade** — alto contraste, alvos de toque ≥ 44px, navegação por teclado, `aria-live`.
- **Status online/offline** e indicador de cota de armazenamento.

## Dados de exemplo

No primeiro acesso, a aplicação cria automaticamente:
- Um formulário demo ("Cadastro Territorial de Campo") com 4 campos.
- Três registros de exemplo (Comunidade, Escola, Porto) ao redor de Manaus.

Para recomeçar do zero: Configurações → "Apagar todos os dados".

## Sobre o Shapefile

A exportação usa `@crmackey/shp-write` (fork mantido do `mapbox/shp-write`, com `fflate` no lugar de JSZip). Como o formato DBF impõe limite de 10 caracteres no nome do campo, a aplicação abrevia automaticamente e mostra a tabela de mapeamento antes do download.

Para casos-limite (geometrias mistas, reprojeção complexa), use a exportação GeoJSON e converta no QGIS.

## Basemap de satélite

Duas opções, para dois cenários diferentes:

- **Satélite online** (Esri World Imagery) — disponível no seletor de
  camadas do mapa (canto superior direito) sempre que houver internet.
  Igual ao OSM, não é pré-cacheado pelo Service Worker (ver limitações
  abaixo) — não funciona sem conexão.
- **Imagem local offline** — em Configurações → "Imagem de satélite
  offline", carregue uma imagem já baixada (recorte de satélite,
  ortomosaico de drone etc.) da área que será mapeada. Informe a caixa
  delimitadora (Norte/Sul/Leste/Oeste) manualmente, ou envie junto um
  "world file" (`.wld`/`.jgw`/`.pgw`/`.tfw`, exportado pelo QGIS/ArcGIS)
  para preenchimento automático. A imagem fica salva no IndexedDB do
  aparelho e funciona 100% offline, aparecendo como opção no seletor de
  camadas do mapa e na miniatura da tela de Coleta. Só funciona
  corretamente para imagens sem rotação (norte para cima); múltiplas
  imagens podem ser salvas e alternadas.

## Limitações conhecidas

- Sincronização com servidor está fora do escopo desta versão.
- Tiles de mapa base online (OSM e Satélite Esri) não são cacheados
  offline (política de uso dos provedores, mesma restrição que já valia
  para Google/Bing). Sem internet, o mapa usa a imagem local carregada
  (se houver) ou fica sem base, mostrando apenas os pontos coletados.
- Imagens locais de satélite só suportam orientação norte-para-cima
  (sem rotação); para casos com rotação, reprojete no QGIS antes de
  exportar o recorte.
- Modo anônimo/incógnita do navegador apaga o IndexedDB ao fechar — use a instalação PWA.

## Versão

2.0.0 — conforme especificação da skill `skill_formulario_dinamico_offline_gnss_webgis.md` (v2.0).
