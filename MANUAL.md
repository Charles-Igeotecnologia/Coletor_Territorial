# 📖 Manual de Uso — Coletor Territorial

Manual completo de instalação, configuração e uso em campo da aplicação **Coletor Territorial** — coletor de dados offline com formulário dinâmico, GNSS do celular e exportação geoespacial.

---

## 📑 Sumário

1. [Visão geral](#1-visão-geral)
2. [Antes de começar — requisitos](#2-antes-de-começar--requisitos)
3. [🟢 Etapa 1 — Preparação (faça uma vez, com internet)](#3-🟢-etapa-1--preparação-faça-uma-vez-com-internet)
4. [🟡 Etapa 2 — Em campo (coleta)](#4-🟡-etapa-2--em-campo-coleta)
5. [🔴 Etapa 3 — Depois do campo (exportar e backup)](#5-🔴-etapa-3--depois-do-campo-exportar-e-backup)
6. [Telas da aplicação](#6-telas-da-aplicação)
7. [Formatos de exportação](#7-formatos-de-exportação)
8. [Resolução de problemas](#8-resolução-de-problemas)
9. [Perguntas frequentes](#9-perguntas-frequentes)

---

## 1. Visão geral

O **Coletor Territorial** é uma aplicação web (PWA) que funciona como uma **prancheta digital territorial**. Ela permite:

- 📝 Criar formulários personalizados com diferentes tipos de campo
- 📍 Capturar coordenadas pelo GNSS (GPS) do celular
- 🗺️ Visualizar os pontos coletados em mapa
- 💾 Armazenar tudo localmente, mesmo sem internet
- 📤 Exportar os dados em CSV, KML, GeoJSON e Shapefile

**Aplicações típicas:** cadastro territorial, vistorias, rotas, escolas rurais, comunidades, infraestrutura, regularização fundiária, meio ambiente, saúde, logística, auditoria.

---

## 2. Antes de começar — requisitos

| Requisito | Por quê? |
|---|---|
| 📱 Celular Android ou iPhone | A aplicação é otimizada para uso móvel |
| 🌐 Internet na **primeira vez** | Para carregar a página, instalar a PWA e fazer o cache offline |
| 🔒 Conexão **HTTPS** | O GNSS só funciona em HTTPS (o GitHub Pages já provê isso automaticamente) |
| 📍 GPS/Localização habilitado no aparelho | Para capturar coordenadas |
| 🔋 Bateria carregada | Coleta em campo consome bateria, especialmente com GNSS ativo |

> ⚠️ **Importante:** O GNSS (GPS) é **bloqueado** pelos navegadores em conexões HTTP comuns. A aplicação só funciona em HTTPS ou em `localhost`. O GitHub Pages já provê HTTPS automaticamente.

---

## 3. 🟢 Etapa 1 — Preparação (faça uma vez, com internet)

Esta etapa é **crítica** e só funciona online. Faça antes de sair para o campo, com uma boa conexão.

### 3.1 Acesse e instale a PWA

1. No celular, abra o navegador:
   - **Android:** Google Chrome (recomendado)
   - **iOS:** Safari (obrigatório — Chrome no iOS não instala PWA direito)
2. Acesse o endereço da aplicação:

   > **https://charles-igeotecnologia.github.io/Formulario/**

3. Aguarde carregar totalmente. A tela "Configurar Formulário" aparecerá, já com 3 registros de exemplo.
4. **Instale como aplicativo:**

   **Android (Chrome):**
   - Menu (⋮, no canto superior direito) → **"Adicionar à tela inicial"**
   - Confirme

   **iOS (Safari):**
   - Botão **Compartilhar** (quadrado com seta para cima, na parte inferior)
   - **"Adicionar à Tela de Início"**
   - Confirme

5. A partir de agora, **abra sempre pelo ícone** na tela inicial — não pelo navegador.

> 💡 **Por que instalar?** O aplicativo instalado (PWA) tem armazenamento **persistente** — seus dados não somem. No navegador comum, o sistema operacional pode limpar os dados sob pressão de memória.

### 3.2 Configure SEU formulário

A aplicação vem com um formulário genérico de exemplo ("Cadastro Territorial de Campo"). Você precisa configurar o formulário real do seu projeto:

1. Abra o app → aba **Form** (📝)
2. Para começar do zero:
   - Vá em **⚙️ Ajustes** → **"Apagar todos os dados"**
   - Confirme (isso apaga formulário demo + registros de exemplo)
3. De volta à aba **Form**:
   - Edite o **Nome do formulário** (ex.: "Cadastro de Escolas Rurais — Setembro 2026")
   - Edite a **Descrição**
4. Clique em **"+ Adicionar campo"** e crie cada campo:

   | Campo | Exemplo |
   |---|---|
   | **Rótulo** | Nome da escola |
   | **Tipo** | Texto curto |
   | **Obrigatório** | Sim |

   | Campo | Exemplo |
   |---|---|
   | **Rótulo** | Tipo |
   | **Tipo** | Lista suspensa |
   | **Opções** | Estadual, Municipal, Particular |
   | **Obrigatório** | Sim |

5. Use os botões **▲** (subir) e **▼** (descer) para ordenar os campos
6. Para remover um campo: botão **✕**
7. Clique em **Salvar formulário**

#### Tipos de campo disponíveis

| Tipo | Uso | Exemplo |
|---|---|---|
| Texto curto | Nome, código, identificação | "Nome da localidade" |
| Texto longo | Observações, descrição, parecer | "Condições de acesso" |
| Número inteiro | Quantidade, contagem | "Número de alunos" |
| Número decimal | Medida, área, distância | "Área construída (m²)" |
| Lista suspensa | Categoria, status, classe | "Tipo: Estadual, Municipal" |
| Múltipla escolha | Ocorrências simultâneas | "Recursos: Poço, Energia, Internet" |
| Data | Data de vistoria | "Data da visita" |
| Hora | Horário | "Horário de início" |
| Data e hora | Registro completo de evento | "Início da vistoria" |
| Sim/Não | Presença, conformidade | "Possui energia elétrica?" |

### 3.3 Teste o GNSS e o fluxo completo

**Não vá para o campo sem ter testado isto em casa:**

1. Abra a aba **Coleta** (📍)
2. Clique em **📍 Capturar coordenada**
3. **Aceite a permissão de localização** quando o navegador perguntar:
   - Escolha **"Permitir sempre"** ou **"Permitir neste site"**
   - Marque para usar localização precisa, se oferecido
4. Confirme que aparecem:
   - ✅ Latitude e Longitude
   - ✅ Precisão (classificada como Excelente/Boa/Regular/Baixa)
   - ✅ Altitude (se disponível)
   - ✅ Data/hora da captura
5. Preencha todos os campos do formulário
6. Clique em **💾 Salvar registro**
7. Abra a aba **Mapa** (🗺️) — veja se o ponto aparece no mapa
8. Abra a aba **Registros** (📋) — veja se o registro aparece na lista
9. Abra a aba **Export** (📤) → teste exportar **CSV** e **GeoJSON**
10. Abra os arquivos no computador e confira se estão corretos

> ⚠️ Se algo não funcionar nesta etapa, **resolva antes de ir para o campo**. Em campo não haverá como corrigir.

### 3.4 Ative o modo offline

Ainda com internet:

1. Navegue por todas as telas pelo menos uma vez (Form, Coleta, Mapa, Registros, Export, Ajustes)
2. Deixe o aplicativo aberto por cerca de **30 segundos** para o Service Worker fazer o cache completo
3. **Teste o offline:**
   - Ative o **modo avião** do celular
   - Abra o app pelo **ícone** (não pelo navegador)
   - Tente criar um registro (capturar coordenada + preencher + salvar)
   - Se funcionar, **está pronto para o campo** ✅

---

## 4. 🟡 Etapa 2 — Em campo (coleta)

Agora sim, colete os dados. Siga este fluxo para **cada ponto**:

### 4.1 Procedimento padrão (para cada ponto)

1. Abra o app pelo **ícone** na tela inicial
2. Vá para a aba **Coleta** (📍)
3. Clique em **📍 Capturar coordenada**
4. Observe a **precisão** exibida:
   - 🟢 **Excelente** (0-5 m) — ideal, pode salvar
   - 🟢 **Boa** (5-10 m) — boa, pode salvar
   - 🟡 **Regular** (10-25 m) — aceitável, considere aguardar
   - 🔴 **Baixa** (>25 m) — **aguarde** e capture novamente
5. Preencha os campos do formulário
6. Clique em **💾 Salvar registro**
7. O formulário é limpo para o próximo ponto
8. Repita

### 4.2 Quando a precisão estiver instável

Use o **📈 Monitorar** em vez de captura única:

1. Clique em **📈 Monitorar**
2. A aplicação passa a atualizar a coordenada em tempo real
3. Observe a precisão estabilizar (geralmente melhora após 10-30 segundos)
4. Quando a precisão estiver boa, clique em **Parar**
5. Continue preenchendo e salvando

> 💡 Dica: em áreas com pouca visão do céu (dentro de mata, próximo a prédios), o sinal demora mais para estabilizar. Tenha paciência.

### 4.3 Se o GNSS falhar completamente

Para um ponto específico em que o GPS não conseguir precisão:

1. Clique em **✏️ Manual**
2. Digite a latitude e longitude (de outra fonte: GPS dedicado, foto aérea, mapa)
3. Informe o **motivo do ajuste** (ex.: "Coordenada obtida em mapa topográfico")
4. Clique em **Aplicar coordenada manual**

A coordenada original do GNSS (mesmo parcial) fica **preservada** nos metadados do registro, para auditoria.

### 4.4 Indicadores na tela

| Indicador | Onde | Significado |
|---|---|---|
| ● Online / ○ Offline | Topo direita | Status de conexão |
| "X registros" | Topo direita | Total coletado nesta sessão |
| Cor do card GNSS | Tela de Coleta | Verde = bom, Amarelo = regular, Vermelho = baixo |

---

## 5. 🔴 Etapa 3 — Depois do campo (exportar e backup)

**Faça isto no mesmo dia da coleta**, com internet, antes de fechar o app.

### 5.1 Exporte os dados

1. Abra a aba **Export** (📤)
2. Selecione o formulário (ou "Todos")
3. Escolha o separador CSV (ponto e vírgula `;` para Excel em português)
4. Clique no formato desejado:

| Botão | Formato | Use para | Resultado |
|---|---|---|---|
| 📊 CSV | Planilha | Excel, LibreOffice, auditoria | `.csv` |
| 🌍 KML | Google Earth | Visualização rápida no Google Earth | `.kml` |
| 📐 GeoJSON | SIG | QGIS, ArcGIS (formato mais confiável) | `.geojson` |
| 🗺️ Shapefile | SIG tradicional | QGIS, ArcGIS com camada vetorial | `.zip` (com .shp/.shx/.dbf/.prj) |

### 5.2 Sobre o Shapefile

Ao exportar Shapefile, a aplicação **exibirá uma tabela de mapeamento** antes do download, mostrando como os nomes dos campos foram abreviados (limite de 10 caracteres imposto pelo formato DBF).

Exemplo:
- `nome_local` → `NOMLOCAL`
- `categoria` → `CATEGORIA`
- `createdAt` → `DATACRIA`

Anote ou tire print desta tabela — você precisará saber qual nome corresponde a qual campo ao abrir no SIG.

### 5.3 Faça o backup

1. Após exportar, **transfira os arquivos para um local seguro:**
   - Envie por email para si mesmo
   - Salve no Google Drive / Dropbox / OneDrive
   - Transfira para o computador via cabo/Bluetooth
2. Abra os arquivos no computador (QGIS, Excel) e **confira se estão corretos**
3. Se estiver tudo certo, você pode apagar os dados do celular (Ajustes → Apagar todos os dados) para liberar espaço

> ⚠️ **Recomendação de segurança:** Exporte e faça backup dos dados ao final de **cada dia de campo**. Não dependa apenas do armazenamento do celular como único repositório.

---

## 6. Telas da aplicação

### 📝 Form — Configurar Formulário
Crie e edite os campos do formulário. Adicione, ordene, remova campos. Salve o modelo.

### 📍 Coleta — Coletar Registro
Preencha os campos, capture a coordenada GNSS, salve o registro localmente.

### 🗺️ Mapa — Visualização
Veja os pontos coletados no mapa. Clique em um ponto para abrir o pop-up com os atributos. Use os filtros por formulário e categoria.

### 📋 Dados — Registros
Lista tabular de todos os registros coletados. Busque, edite (✏️) ou exclua (🗑️) registros.

### 📤 Export — Exportação
Exporte os dados em CSV, KML, GeoJSON ou Shapefile.

### ⚙️ Ajustes — Configurações
Informações de ambiente (protocolo, armazenamento), solicitação de persistência, e opção de apagar todos os dados.

---

## 7. Formatodos de exportação

### CSV
- Codificação **UTF-8 com BOM** (abre corretamente no Excel em português)
- Separador configurável (`;` ou `,`)
- Inclui campos fixos (recordId, formId, createdAt, latitude, longitude, accuracy, altitude) + campos dinâmicos
- Trata aspas e quebras de linha

### KML
- Para **Google Earth**
- Cada ponto vira um `<Placemark>`
- Coordenadas na ordem KML: longitude, latitude, altitude
- CRS: WGS84 (EPSG:4326)

### GeoJSON
- Formato intermediário preferencial
- `FeatureCollection` com cada registro como `Feature`
- Atributos em `properties`, geometria em `geometry`
- Ordem das coordenadas: longitude, latitude

### Shapefile (.zip)
- Pacote `.zip` contendo `.shp`, `.shx`, `.dbf`, `.prj`
- CRS: EPSG:4326
- **Nomes de campos abreviados para ≤ 10 caracteres** (limite do DBF) — tabela de mapeamento exibida antes do download
- Para casos complexos (geometrias mistas), use GeoJSON e converta no QGIS

---

## 8. Resolução de problemas

| Problema | Causa provável | Solução |
|---|---|---|
| **GNSS não funciona** | HTTP (não HTTPS), ou permissão negada | Acesse sempre via `https://charles-igeotecnologia.github.io/Formulario/`. No Android: Configurações → Apps → Coletor → Permissões → Localização → Permitir |
| **Permissão de localização negada** | Usuário negou uma vez | Chrome → Configurações → Permissões do site → reativar localização. Ou desinstale e reinstale a PWA. |
| **Mapa aparece sem fundo** | Modo offline (sem tiles) | É normal. Os pontos coletados aparecem sobre fundo neutro. A conferência de coordenadas continua funcionando. |
| **Precisão sempre baixa** | Sinal GNSS fraco | Vá para área aberta, afaste-se de prédios/árvores/cobertura. Aguarde 30-60s antes de capturar. Use "Monitorar". |
| **App muito lento** | Muitos registros + fotos | Exporte e faça backup, depois use Ajustes → Apagar dados (faça backup do formulário antes re-salvando) |
| **Dados desapareceram** | Modo anônimo, ou "limpar dados ao sair" | Use sempre o app instalado (PWA), nunca o navegador em modo anônimo |
| **Não consigo editar o formulário** | Campo em uso em registros antigos | O sistema versiona o schema; registros antigos ficam marcados. Crie um novo formulário se necessário. |
| **iOS: GNSS demora muito** | Safari mais lento que Chrome | Use **📈 Monitorar** em vez de captura única. Aguarde estabilizar. |
| **Exportação Shapefile falha** | Biblioteca não carregou (offline sem cache) | Volte online, abra a tela Export, aguarde 30s. Ou use GeoJSON e converta no QGIS. |
| **Botão não responde** | JavaScript com erro | Feche o app completamente, abra novamente. Se persistir, reporte o erro. |

---

## 9. Perguntas frequentes

### Preciso de internet para coletar?
**Não.** Após a configuração inicial (Etapa 1), a coleta funciona 100% offline. A internet só é necessária para:
- A primeira instalação e configuração
- O download das bibliotecas (Leaflet, shp-write) para cache
- A exportação de Shapefile (a biblioteca precisa estar em cache)

### Os dados são perdidos ao fechar o app?
**Não**, desde que você use o app instalado (PWA). O armazenamento é persistente em IndexedDB. Evite modo anônimo/incógnita, que apaga tudo ao fechar.

### Quantos registros consigo armazenar?
Depende do espaço livre no aparelho. Tipicamente milhares de registros. A tela de Ajustes mostra o uso atual. Registros com fotos ocupam muito mais — exporte e limpe com frequência.

### Posso usar em mais de um aparelho?
Sim, mas os dados são **locais por aparelho**. Cada coletor terá sua própria base. A sincronização entre aparelhos é **fora do escopo** desta versão — exporte os dados de cada aparelho e consolide no computador.

### Posso editar um registro depois de salvo?
Sim. Aba **Dados** → botão ✏️ no registro. Ou no **Mapa**, clique no ponto → "Editar".

### A coordenada está em qual sistema?
**EPSG:4326** (WGS84, graus decimais) — o padrão do GPS e dos principais SIG. Não há conversão para SIRGAS/UTM nesta versão (faça no QGIS se necessário).

### Como instalei uma versão antiga — como atualizar?
Basta acessar o endereço novamente no navegador. O Service Worker atualiza automaticamente na próxima visita. Se necessário, limpe o cache do navegador.

### O app pediu para "solicitar persistência" — o que é?
É uma solicitação ao navegador para proteger seus dados contra limpeza automática. Clique em **"Solicitar persistência"** na tela de Ajustes. Recomendado.

---

## 📞 Suporte

Encontrou um bug ou tem uma sugestão?
- Abra uma issue em: https://github.com/Charles-Igeotecnologia/Formulario/issues
- Ou relate para a equipe de desenvolvimento com a descrição do problema, a tela onde ocorreu e o passo-a-passo para reproduzir.

---

**Versão deste manual:** 2.0 — julho/2026  
**Versão da aplicação:** 2.0.0  
**Especificação técnica:** `skill_formulario_dinamico_offline_gnss_webgis.md` v2.0
