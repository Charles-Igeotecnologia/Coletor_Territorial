/* ============================================================
   Coletor Territorial — app.js
   Tudo em ES puro. Organizado em módulos por responsabilidade.
   ============================================================ */
'use strict';

/* ------------------------------------------------------------
   0. Utilidades gerais
   ------------------------------------------------------------ */
const Utils = {
  /** Escapa HTML para evitar injeção em pop-ups e listas. */
  escapeHtml(value) {
    if (value === undefined || value === null) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  },

  /** Gera ID curto e único suficiente para uso local. */
  uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  },

  /** ISO em UTC. */
  nowISO() { return new Date().toISOString(); },

  /** Formata data ISO para exibição no fuso local. */
  fmtDateTime(iso) {
    if (!iso) return '--';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short', timeStyle: 'short'
      }).format(new Date(iso));
    } catch { return iso; }
  },

  /** Coordenada válida em graus decimais. */
  isValidCoord(lat, lon) {
    const la = Number(lat), lo = Number(lon);
    return Number.isFinite(la) && Number.isFinite(lo) &&
           la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
  },

  /** Classifica precisão GNSS. */
  classifyAccuracy(acc) {
    if (acc === null || acc === undefined || !Number.isFinite(Number(acc))) {
      return { label: 'Não informado', cls: 'badge-muted', cardCls: '' };
    }
    const a = Number(acc);
    if (a <= 5)  return { label: 'Excelente', cls: 'badge-ok',    cardCls: '' };
    if (a <= 10) return { label: 'Boa',       cls: 'badge-ok',    cardCls: '' };
    if (a <= 25) return { label: 'Regular',   cls: 'badge-warn',  cardCls: 'gnss-regular' };
    return { label: 'Baixa', cls: 'badge-err', cardCls: 'gnss-low' };
  },

  /** Abrevia nome de campo p/ limite DBF (10 chars), sem símbolos. */
  abbreviateField(name, used) {
    let base = String(name)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^A-Za-z0-9_]/g, '_')
      .toUpperCase();
    let candidate = base.slice(0, 10);
    let n = 1;
    while (used.has(candidate)) {
      const suffix = String(n++);
      candidate = base.slice(0, 10 - suffix.length) + suffix;
    }
    used.add(candidate);
    return candidate;
  },

  /** Lê largura/altura de um arquivo de imagem (via Object URL temporário). */
  imageDimensions(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  },

  /** Calcula a caixa delimitadora (N/S/L/O) a partir de um world file (6 linhas: A,D,B,E,C,F). */
  parseWorldFile(text, width, height) {
    const nums = text.trim().split(/\r?\n/).map(Number);
    if (nums.length < 6 || nums.some(n => !Number.isFinite(n))) return null;
    const [A, , , E, C, F] = nums; // assume imagem sem rotação (D=B≈0)
    const west = C - A / 2;
    const north = F - E / 2;
    const east = west + width * A;
    const south = north + height * E;
    return { north, south, east, west };
  },

  /** Comprime uma foto (File/Blob) via canvas: redimensiona (máx. lado maior) e recodifica como JPEG. */
  compressImage(file, { maxDim = 1600, quality = 0.7 } = {}) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let { naturalWidth: width, naturalHeight: height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob); else reject(new Error('Falha ao comprimir imagem.'));
        }, 'image/jpeg', quality);
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }
};

/* ------------------------------------------------------------
   1. Camada de armazenamento — IndexedDB
   ------------------------------------------------------------ */
const DB = (() => {
  const DB_NAME = 'ColetorTerritorialDB';
  const DB_VERSION = 3;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const tx = e.target.transaction;
        if (!db.objectStoreNames.contains('forms')) {
          db.createObjectStore('forms', { keyPath: 'formId' });
        }
        if (!db.objectStoreNames.contains('records')) {
          const r = db.createObjectStore('records', { keyPath: 'recordId' });
          r.createIndex('formId', 'formId', { unique: false });
        }
        const attStore = db.objectStoreNames.contains('attachments')
          ? tx.objectStore('attachments')
          : db.createObjectStore('attachments', { keyPath: 'id' });
        if (!attStore.indexNames.contains('recordId')) {
          attStore.createIndex('recordId', 'recordId', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('imagery')) {
          db.createObjectStore('imagery', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode = 'readonly') {
    return _db.transaction(store, mode).objectStore(store);
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // FORMS
  async function putForm(form) {
    return reqToPromise(tx('forms', 'readwrite').put(form));
  }
  async function getForm(formId) {
    return reqToPromise(tx('forms').get(formId));
  }
  async function getAllForms() {
    return reqToPromise(tx('forms').getAll());
  }
  async function deleteForm(formId) {
    return reqToPromise(tx('forms', 'readwrite').delete(formId));
  }

  // RECORDS
  async function putRecord(record) {
    return reqToPromise(tx('records', 'readwrite').put(record));
  }
  async function getRecord(recordId) {
    return reqToPromise(tx('records').get(recordId));
  }
  async function getAllRecords() {
    return reqToPromise(tx('records').getAll());
  }
  async function deleteRecord(recordId) {
    return reqToPromise(tx('records', 'readwrite').delete(recordId));
  }

  // ATTACHMENTS (fotos anexadas a campos do tipo "photo")
  async function putAttachment(att) {
    return reqToPromise(tx('attachments', 'readwrite').put(att));
  }
  async function getAttachment(id) {
    return reqToPromise(tx('attachments').get(id));
  }
  async function getAttachmentsByRecord(recordId) {
    return reqToPromise(tx('attachments').index('recordId').getAll(recordId));
  }
  async function deleteAttachment(id) {
    return reqToPromise(tx('attachments', 'readwrite').delete(id));
  }
  async function deleteAttachmentsByRecord(recordId) {
    const atts = await getAttachmentsByRecord(recordId);
    await Promise.all(atts.map(a => deleteAttachment(a.id)));
  }

  // SETTINGS
  async function getSetting(key) {
    const r = await reqToPromise(tx('settings').get(key));
    return r ? r.value : null;
  }
  async function setSetting(key, value) {
    return reqToPromise(tx('settings', 'readwrite').put({ key, value }));
  }

  // IMAGERY (basemap local offline)
  async function putImagery(img) {
    return reqToPromise(tx('imagery', 'readwrite').put(img));
  }
  async function getAllImagery() {
    return reqToPromise(tx('imagery').getAll());
  }
  async function deleteImagery(id) {
    return reqToPromise(tx('imagery', 'readwrite').delete(id));
  }

  async function wipeAll() {
    await reqToPromise(tx('records', 'readwrite').clear());
    await reqToPromise(tx('forms', 'readwrite').clear());
    await reqToPromise(tx('attachments', 'readwrite').clear());
    await reqToPromise(tx('imagery', 'readwrite').clear());
  }

  return { open, putForm, getForm, getAllForms, deleteForm,
           putRecord, getRecord, getAllRecords, deleteRecord,
           putAttachment, getAttachment, getAttachmentsByRecord, deleteAttachment, deleteAttachmentsByRecord,
           getSetting, setSetting, putImagery, getAllImagery, deleteImagery, wipeAll };
})();

/* ------------------------------------------------------------
   2. UI helpers — toast, modal, navegação
   ------------------------------------------------------------ */
const UI = (() => {
  let toastTimer = null;
  function toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (type ? ` toast-${type}` : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function confirmDialog(message, { title = 'Confirmar' } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMsg').textContent = message;
      modal.classList.remove('hidden');

      const ok = document.getElementById('confirmOk');
      const cancel = document.getElementById('confirmCancel');

      const cleanup = (val) => {
        modal.classList.add('hidden');
        ok.removeEventListener('click', okH);
        cancel.removeEventListener('click', cancelH);
        resolve(val);
      };
      const okH = () => cleanup(true);
      const cancelH = () => cleanup(false);
      ok.addEventListener('click', okH);
      cancel.addEventListener('click', cancelH);
    });
  }

  function switchScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById('screen-' + name);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.navbtn').forEach(b => {
      b.classList.toggle('active', b.dataset.screen === name);
    });
    // Recarrega conteúdo dinâmico ao entrar em cada tela
    if (name === 'records') App.renderRecords();
    if (name === 'map') App.refreshMap();
    if (name === 'collect') { App.renderCollectFields(); CollectPreview.init(); App.populateFormSelectors(); }
    if (name === 'form') { App.renderFieldsList(); App.populateFormSelectors(); }
    if (name === 'export') App.renderExportOptions();
    if (name === 'settings') App.renderImageryList();

    // Rastreamento ao vivo: ativo somente durante o processo de coleta em campo
    if (name === 'collect') LiveTrack.start(); else LiveTrack.stop();
  }

  return { toast, confirmDialog, switchScreen };
})();

/* ------------------------------------------------------------
   3. Estado da aplicação
   ------------------------------------------------------------ */
const State = {
  currentForm: null,         // formulário ativo
  draftFields: [],           // campos em edição no construtor
  currentCoord: null,        // {lat, lon, acc, alt, ts, source, original?, manualOverride?}
  watchId: null,
  map: null,
  mapMarkersLayer: null,
  editingRecordId: null,
  miniMap: null,
  miniMapMarker: null,
  liveWatchId: null,       // watchPosition id do rastreamento contínuo em campo
  livePosition: null,      // {lat, lon, acc} — posição física atual, independente da coordenada capturada p/ o registro
  liveMiniMarker: null,
  liveMiniAccuracy: null,
  draftPhotos: {},         // fieldId -> {blob?, attachmentId?, previewUrl?, removed?} — fotos em edição na tela Coleta
};

/* ------------------------------------------------------------
   4. Construtor de formulário
   ------------------------------------------------------------ */
const FormBuilder = (() => {
  async function saveMeta() {
    const name = document.getElementById('formName').value.trim();
    const desc = document.getElementById('formDesc').value.trim();
    if (!name) { UI.toast('Informe o nome do formulário.', 'err'); return; }

    try {
      let form = State.currentForm;
      const now = Utils.nowISO();
      if (!form) {
        form = {
          formId: Utils.uid('form'),
          name, description: desc,
          version: '1.0.0',
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
          fields: [...State.draftFields]
        };
      } else {
        // Migração: se campos mudaram, incrementa schemaVersion
        const changed = JSON.stringify(form.fields) !== JSON.stringify(State.draftFields);
        form.name = name;
        form.description = desc;
        form.fields = [...State.draftFields].sort((a, b) => a.order - b.order);
        form.updatedAt = now;
        if (changed) {
          form.schemaVersion = (form.schemaVersion || 1) + 1;
        }
      }
      await DB.putForm(form);
      State.currentForm = form;
      UI.toast('Formulário salvo.', 'ok');
      App.refreshTopbar();
      App.populateFormSelectors();
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'FormBuilder.saveMeta' });
      UI.toast('Erro ao salvar formulário.', 'err');
    }
  }

  function addField() {
    const label = document.getElementById('fLabel').value.trim();
    const type = document.getElementById('fType').value;
    const optionsRaw = document.getElementById('fOptions').value.trim();
    const required = document.getElementById('fRequired').value === 'true';

    if (!label) { UI.toast('Informe o rótulo do campo.', 'err'); return; }

    const field = {
      id: Utils.uid('campo'),
      label, type, required,
      options: (type === 'select' || type === 'multiselect')
        ? optionsRaw.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      order: State.draftFields.length + 1
    };
    State.draftFields.push(field);
    renderList();

    // limpa inputs de novo campo
    document.getElementById('fLabel').value = '';
    document.getElementById('fOptions').value = '';
    UI.toast('Campo adicionado.', 'ok');
  }

  function removeField(id) {
    State.draftFields = State.draftFields.filter(f => f.id !== id)
      .map((f, i) => ({ ...f, order: i + 1 }));
    renderList();
  }

  function moveField(id, dir) {
    const arr = [...State.draftFields].sort((a, b) => a.order - b.order);
    const idx = arr.findIndex(f => f.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    arr.forEach((f, i) => f.order = i + 1);
    State.draftFields = arr;
    renderList();
  }

  function renderList() {
    const container = document.getElementById('fieldsList');
    const arr = [...State.draftFields].sort((a, b) => a.order - b.order);
    if (arr.length === 0) {
      container.innerHTML = '<p class="hint">Nenhum campo ainda. Adicione o primeiro.</p>';
      return;
    }
    container.innerHTML = arr.map(f => {
      const typeLabel = {
        text:'Texto curto', textarea:'Texto longo', integer:'Inteiro',
        decimal:'Decimal', select:'Lista', multiselect:'Múltipla',
        date:'Data', time:'Hora', datetime:'Data/hora', boolean:'Sim/Não', photo:'Foto'
      }[f.type] || f.type;
      const opt = (f.options && f.options.length) ? `<small>Opções: ${Utils.escapeHtml(f.options.join(', '))}</small>` : '';
      return `
        <div class="field-item">
          <div class="meta">
            <strong>${Utils.escapeHtml(f.label)}</strong>
            ${f.required ? '<span class="req-dot">*</span>' : ''}
            <small>${typeLabel} • ordem ${f.order}</small>
            ${opt}
          </div>
          <div class="actions">
            <button class="icon-btn" data-act="up" data-id="${f.id}" aria-label="Subir"><svg class="icon"><use href="#icon-chevron-up"/></svg></button>
            <button class="icon-btn" data-act="down" data-id="${f.id}" aria-label="Descer"><svg class="icon"><use href="#icon-chevron-down"/></svg></button>
            <button class="icon-btn danger" data-act="del" data-id="${f.id}" aria-label="Remover"><svg class="icon"><use href="#icon-x"/></svg></button>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (btn.dataset.act === 'up') moveField(id, -1);
        if (btn.dataset.act === 'down') moveField(id, 1);
        if (btn.dataset.act === 'del') removeField(id);
      });
    });
  }

  /** Carrega um formulário salvo no editor (e o torna o formulário ativo). */
  function loadForm(form) {
    State.currentForm = form;
    State.draftFields = JSON.parse(JSON.stringify(form.fields || []));
    document.getElementById('formName').value = form.name || '';
    document.getElementById('formDesc').value = form.description || '';
    renderList();
    App.refreshTopbar();
    App.populateFormSelectors();
  }

  /** Limpa o editor para começar um formulário novo e independente. */
  function newForm() {
    State.currentForm = null;
    State.draftFields = [];
    document.getElementById('formName').value = '';
    document.getElementById('formDesc').value = '';
    renderList();
    App.refreshTopbar();
    App.populateFormSelectors();
  }

  return { saveMeta, addField, removeField, moveField, renderList, loadForm, newForm };
})();

/* ------------------------------------------------------------
   5. Motor de renderização de campos (coleta)
   ------------------------------------------------------------ */
const FieldRenderer = (() => {
  function render(fields, container, values = {}) {
    container.innerHTML = '';
    const arr = [...fields].sort((a, b) => a.order - b.order);
    arr.forEach(f => {
      const block = document.createElement('div');
      block.className = 'field-block';
      const labelFor = f.type === 'photo' ? `photoInput_${f.id}` : f.id;
      const labelHtml = `<label for="${labelFor}">${Utils.escapeHtml(f.label)} ${f.required ? '<span class="req-dot">*</span>' : ''}</label>`;
      let inputHtml = '';
      const val = values[f.id] !== undefined ? Utils.escapeHtml(values[f.id]) : '';

      switch (f.type) {
        case 'photo':
          inputHtml = PhotoField.fieldHtml(f);
          break;
        case 'textarea':
          inputHtml = `<textarea id="${f.id}" name="${f.id}" rows="3">${val}</textarea>`;
          break;
        case 'integer':
          inputHtml = `<input type="number" step="1" id="${f.id}" name="${f.id}" value="${val}" inputmode="numeric" />`;
          break;
        case 'decimal':
          inputHtml = `<input type="number" step="any" id="${f.id}" name="${f.id}" value="${val}" inputmode="decimal" />`;
          break;
        case 'select':
          inputHtml = `<select id="${f.id}" name="${f.id}">
            <option value="">--</option>
            ${(f.options || []).map(o => `<option value="${Utils.escapeHtml(o)}" ${values[f.id] === o ? 'selected' : ''}>${Utils.escapeHtml(o)}</option>`).join('')}
          </select>`;
          break;
        case 'multiselect': {
          const selected = Array.isArray(values[f.id]) ? values[f.id] : [];
          inputHtml = `<div role="group" aria-label="${Utils.escapeHtml(f.label)}">` +
            (f.options || []).map(o =>
              `<label class="checkbox-line"><input type="checkbox" name="${f.id}" value="${Utils.escapeHtml(o)}" ${selected.includes(o) ? 'checked' : ''}/> ${Utils.escapeHtml(o)}</label>`
            ).join('') + `</div>`;
          break;
        }
        case 'date':
          inputHtml = `<input type="date" id="${f.id}" name="${f.id}" value="${val}" />`;
          break;
        case 'time':
          inputHtml = `<input type="time" id="${f.id}" name="${f.id}" value="${val}" />`;
          break;
        case 'datetime':
          inputHtml = `<input type="datetime-local" id="${f.id}" name="${f.id}" value="${val}" />`;
          break;
        case 'boolean':
          inputHtml = `<select id="${f.id}" name="${f.id}">
            <option value="">--</option>
            <option value="true" ${values[f.id] === true || values[f.id] === 'true' ? 'selected' : ''}>Sim</option>
            <option value="false" ${values[f.id] === false || values[f.id] === 'false' ? 'selected' : ''}>Não</option>
          </select>`;
          break;
        default: // text
          inputHtml = `<input type="text" id="${f.id}" name="${f.id}" value="${val}" />`;
      }
      block.innerHTML = labelHtml + inputHtml;
      container.appendChild(block);
    });
  }

  /** Coleta valores a partir do container, considerando tipos. */
  function collectValues(fields, formEl) {
    const values = {};
    fields.forEach(f => {
      if (f.type === 'photo') {
        values[f.id] = undefined; // tratado à parte pelo PhotoField (ver App.saveRecord)
      } else if (f.type === 'multiselect') {
        const checked = formEl.querySelectorAll(`input[name="${f.id}"]:checked`);
        values[f.id] = Array.from(checked).map(c => c.value);
      } else {
        const el = formEl.querySelector(`[name="${f.id}"]`);
        if (!el) { values[f.id] = ''; return; }
        let v = el.value;
        if (f.type === 'integer') v = v === '' ? null : parseInt(v, 10);
        else if (f.type === 'decimal') v = v === '' ? null : parseFloat(v);
        else if (f.type === 'boolean') {
          v = v === '' ? null : (v === 'true');
        }
        values[f.id] = v;
      }
    });
    return values;
  }

  return { render, collectValues };
})();

/* ------------------------------------------------------------
   5b. PhotoField — captura, compressão e pré-visualização de fotos
   anexadas a campos do tipo "photo" (armazenadas em DB.attachments,
   referenciadas nos atributos do registro pelo id do anexo).
   ------------------------------------------------------------ */
const PhotoField = (() => {
  function fieldHtml(f) {
    return `
      <div class="photo-capture">
        <input type="file" accept="image/*" capture="environment" id="photoInput_${f.id}" class="hidden" data-photo-input="${f.id}" />
        <button type="button" class="btn btn-secondary" data-photo-pick="${f.id}">
          <svg class="icon"><use href="#icon-image"/></svg>Adicionar foto
        </button>
        <div class="photo-preview hidden" id="photoPreview_${f.id}">
          <img alt="Pré-visualização da foto anexada" />
          <button type="button" class="icon-btn danger" data-photo-remove="${f.id}" aria-label="Remover foto">
            <svg class="icon"><use href="#icon-x"/></svg>
          </button>
        </div>
      </div>`;
  }

  /** Delegação única no container de campos — sobrevive à substituição do innerHTML a cada render. */
  function bindDelegated(container) {
    container.addEventListener('click', (e) => {
      const pickBtn = e.target.closest('[data-photo-pick]');
      if (pickBtn) { document.getElementById(`photoInput_${pickBtn.dataset.photoPick}`)?.click(); return; }
      const rmBtn = e.target.closest('[data-photo-remove]');
      if (rmBtn) { remove(rmBtn.dataset.photoRemove); }
    });
    container.addEventListener('change', (e) => {
      const input = e.target.closest('[data-photo-input]');
      if (!input) return;
      const file = input.files[0];
      if (file) onFileSelected(input.dataset.photoInput, file);
    });
  }

  async function onFileSelected(fieldId, file) {
    try {
      UI.toast('Processando foto...');
      const blob = await Utils.compressImage(file);
      const prevAttId = State.draftPhotos[fieldId]?.attachmentId || null;
      if (State.draftPhotos[fieldId]?.previewUrl) URL.revokeObjectURL(State.draftPhotos[fieldId].previewUrl);
      State.draftPhotos[fieldId] = { blob, attachmentId: prevAttId, removed: false };
      showPreview(fieldId, blob);
      UI.toast('Foto anexada.', 'ok');
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'PhotoField.onFileSelected' });
      UI.toast('Não foi possível processar a foto.', 'err');
    }
  }

  function showPreview(fieldId, blob) {
    const wrap = document.getElementById(`photoPreview_${fieldId}`);
    if (!wrap) return;
    const url = URL.createObjectURL(blob);
    if (State.draftPhotos[fieldId]) State.draftPhotos[fieldId].previewUrl = url;
    wrap.querySelector('img').src = url;
    wrap.classList.remove('hidden');
  }

  function remove(fieldId) {
    const draft = State.draftPhotos[fieldId];
    if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    State.draftPhotos[fieldId] = { removed: true, attachmentId: draft?.attachmentId || null };
    const wrap = document.getElementById(`photoPreview_${fieldId}`);
    if (wrap) { wrap.classList.add('hidden'); wrap.querySelector('img').src = ''; }
    const input = document.getElementById(`photoInput_${fieldId}`);
    if (input) input.value = '';
  }

  /** Marca presença de foto (nova ou já anexada e não removida) em `values`, só para a validação de obrigatoriedade. */
  function markPresence(fields, values) {
    fields.forEach(f => {
      if (f.type !== 'photo') return;
      const d = State.draftPhotos[f.id];
      values[f.id] = (d && !d.removed && (d.blob || d.attachmentId)) ? 'photo' : '';
    });
  }

  /** Persiste blobs pendentes como anexos e grava o id do anexo em record.attributes; remove os marcados para exclusão. */
  async function applyToRecord(fields, record) {
    for (const f of fields) {
      if (f.type !== 'photo') continue;
      const draft = State.draftPhotos[f.id];
      if (!draft) continue; // campo não tocado nesta sessão — mantém o que já estava em record.attributes
      if (draft.removed) {
        if (draft.attachmentId) await DB.deleteAttachment(draft.attachmentId);
        record.attributes[f.id] = null;
        continue;
      }
      if (draft.blob) {
        const attId = draft.attachmentId || Utils.uid('att');
        await DB.putAttachment({
          id: attId, recordId: record.recordId, fieldId: f.id,
          blob: draft.blob, mime: draft.blob.type || 'image/jpeg', capturedAt: Utils.nowISO()
        });
        record.attributes[f.id] = attId;
      } else if (draft.attachmentId) {
        record.attributes[f.id] = draft.attachmentId;
      }
    }
  }

  /** Carrega pré-visualização de fotos já anexadas (edição de registro existente). */
  async function loadFromRecord(fields, attributes) {
    for (const f of fields) {
      if (f.type !== 'photo') continue;
      const attId = attributes?.[f.id];
      if (!attId) continue;
      try {
        const att = await DB.getAttachment(attId);
        if (!att) continue;
        State.draftPhotos[f.id] = { attachmentId: attId, removed: false };
        showPreview(f.id, att.blob);
      } catch (e) {
        console.error({ msg: e.message, stack: e.stack, context: 'PhotoField.loadFromRecord' });
      }
    }
  }

  /** Limpa o rascunho de fotos (nova coleta, troca de formulário, cancelar edição). */
  function reset() {
    Object.values(State.draftPhotos).forEach(d => { if (d?.previewUrl) URL.revokeObjectURL(d.previewUrl); });
    State.draftPhotos = {};
  }

  return { fieldHtml, bindDelegated, markPresence, applyToRecord, loadFromRecord, reset };
})();

/* ------------------------------------------------------------
   6. GNSS — Captura rápida + Captura fina (média ponderada)
   ------------------------------------------------------------ */
const GNSS = (() => {

  // Config padrão (sobrescrito pelas Settings)
  const cfg = {
    minSamples: 8,        // amostras válidas mínimas para finalizar
    maxAcc: 30,           // descarta leituras com precisão > maxAcc
    targetAcc: 10,        // consideramos "estável" quando média <= targetAcc
    maxDurationMs: 30000, // duração máxima da coleta fina
    outlierDist: 75       // distância (m) acima da qual uma leitura é outlier
  };

  // Estado da captura fina
  let fine = {
    running: false,
    samples: [],      // [{lat, lon, acc, alt, ts}]
    discarded: 0,
    startedAt: 0,
    timer: null,
    raf: null
  };

  async function loadConfig() {
    try {
      const s = await DB.getSetting('gnssConfig');
      if (s) Object.assign(cfg, s);
    } catch {}
    return cfg;
  }

  function setDisplay(coord) {
    if (!coord) {
      document.getElementById('gnssLat').textContent = '--';
      document.getElementById('gnssLon').textContent = '--';
      document.getElementById('gnssAcc').textContent = '--';
      document.getElementById('gnssAlt').textContent = '--';
      document.getElementById('gnssTime').textContent = '--';
      document.getElementById('gnssAccClass').textContent = '';
      document.querySelector('.gnss-card').className = 'card gnss-card';
      CollectPreview.update(null);
      return;
    }
    const cls = Utils.classifyAccuracy(coord.acc);
    document.getElementById('gnssLat').textContent = coord.lat.toFixed(6);
    document.getElementById('gnssLon').textContent = coord.lon.toFixed(6);
    document.getElementById('gnssAcc').textContent = coord.acc !== null && coord.acc !== undefined ? `${coord.acc.toFixed(1)} m` : 'N/I';
    document.getElementById('gnssAlt').textContent = coord.alt !== null && coord.alt !== undefined ? coord.alt.toFixed(1) : '--';
    document.getElementById('gnssTime').textContent = Utils.fmtDateTime(coord.ts);
    document.getElementById('gnssAccClass').textContent = `(${cls.label})`;
    document.querySelector('.gnss-card').className = 'card gnss-card ' + cls.cardCls;
    CollectPreview.update(coord);

    if (cls.label === 'Baixa') {
      UI.toast('Precisão baixa. Use "Captura fina" para melhorar.', 'warn');
    } else if (cls.label === 'Regular') {
      UI.toast('Precisão regular. Considere a captura fina.', 'warn');
    }
  }

  function fromPosition(pos) {
    const c = pos.coords;
    return {
      lat: c.latitude,
      lon: c.longitude,
      acc: c.accuracy,
      alt: c.altitude,
      altAcc: c.altitudeAccuracy,
      ts: new Date(pos.timestamp).toISOString(),
      source: 'gnss'
    };
  }

  // ---------- Captura rápida (única) ----------
  function captureOnce() {
    if (!('geolocation' in navigator)) {
      UI.toast('Geolocalização não suportada neste navegador.', 'err');
      return;
    }
    UI.toast('Capturando coordenada...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        State.currentCoord = fromPosition(pos);
        setDisplay(State.currentCoord);
        UI.toast('Coordenada capturada.', 'ok');
      },
      (err) => {
        console.error({ msg: err.message, context: 'GNSS.captureOnce' });
        let msg = 'Falha ao capturar coordenada.';
        if (err.code === 1) msg = 'Permissão de localização negada. Reative nas configurações do navegador.';
        else if (err.code === 3) msg = 'Tempo esgotado ao obter a posição. Tente novamente.';
        UI.toast(msg, 'err');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // ---------- Distância haversine (m) ----------
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ---------- Cálculo do resultado médio ----------
  function computeAverage(samples) {
    if (!samples.length) return null;
    // pesos = 1/acc (mais preciso = maior peso)
    let wSum = 0, latSum = 0, lonSum = 0, altSum = 0, altW = 0;
    const accs = [];
    samples.forEach(s => {
      const w = 1 / Math.max(s.acc, 1);
      wSum += w;
      latSum += s.lat * w;
      lonSum += s.lon * w;
      accs.push(s.acc);
      if (s.alt !== null && s.alt !== undefined) { altSum += s.alt * w; altW += w; }
    });
    const lat = latSum / wSum;
    const lon = lonSum / wSum;
    // precisão estimada da média: média das acc / sqrt(N)
    const meanAcc = accs.reduce((a,b)=>a+b,0) / accs.length;
    const avgAcc = meanAcc / Math.sqrt(samples.length);
    const alt = altW > 0 ? altSum / altW : null;
    // desvio-padrão das coordenadas (m) — medida de dispersão
    let varSum = 0;
    samples.forEach(s => {
      const d = haversine(lat, lon, s.lat, s.lon);
      varSum += d * d;
    });
    const stdMeters = Math.sqrt(varSum / samples.length);

    return {
      lat, lon,
      acc: avgAcc,
      alt, altAcc: null,
      ts: Utils.nowISO(),
      source: 'gnss-avg',
      samples: samples.length,
      meanRawAcc: meanAcc,
      stdMeters,
      sampleRange: samples
    };
  }

  // ---------- Gráfico de convergência ----------
  function drawChart() {
    const canvas = document.getElementById('gnssChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // fundo
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--card').trim() || '#fff';
    ctx.fillRect(0, 0, W, H);

    if (fine.samples.length === 0) {
      ctx.fillStyle = '#999';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aguardando leituras...', W/2, H/2);
      return;
    }

    // Escala Y: de 0 até maxAcc (inverso — menor precisão no topo é ruim, no fundo é bom)
    const maxAcc = cfg.maxAcc;
    const pad = 8;

    // Linha-alvo
    const yTarget = H - pad - (cfg.targetAcc / maxAcc) * (H - 2*pad);
    ctx.strokeStyle = '#1b8e3f';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(pad, yTarget); ctx.lineTo(W - pad, yTarget);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#1b8e3f';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`alvo ${cfg.targetAcc}m`, pad + 2, yTarget - 2);

    // Pontos das precisões individuais (cinza)
    const xStep = (W - 2*pad) / Math.max(fine.samples.length + fine.discarded - 1, 1);
    let xi = 0;
    fine.samples.forEach((s, i) => {
      const x = pad + i * xStep;
      const y = H - pad - (Math.min(s.acc, maxAcc) / maxAcc) * (H - 2*pad);
      ctx.fillStyle = '#9a9a92';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2*Math.PI);
      ctx.fill();
    });

    // Linha da precisão média acumulada (verde)
    ctx.strokeStyle = '#178a55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const accum = [];
    const validSorted = [];
    for (let i = 0; i < fine.samples.length; i++) {
      validSorted.push(fine.samples[i]);
      const avg = computeAverage(validSorted);
      if (avg) {
        const x = pad + i * xStep;
        const y = H - pad - (Math.min(avg.acc, maxAcc) / maxAcc) * (H - 2*pad);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.lineWidth = 1;

    // Eixo Y rótulos
    ctx.fillStyle = '#6b6b6b';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${maxAcc}m`, pad + 14, pad + 6);
    ctx.fillText('0m', pad + 10, H - pad);
  }

  function updateFineStats() {
    const valid = fine.samples.length;
    const avg = computeAverage(fine.samples);
    document.getElementById('gnssSamples').textContent = valid;
    document.getElementById('gnssDiscarded').textContent = fine.discarded;
    document.getElementById('gnssAvgAcc').textContent = avg ? `${avg.acc.toFixed(1)} m` : '--';

    const stableEl = document.getElementById('gnssStable');
    stableEl.className = '';
    if (!avg) {
      stableEl.textContent = 'aguardando'; stableEl.className = 'stable-wait';
    } else if (avg.acc <= cfg.targetAcc && valid >= Math.max(5, cfg.minSamples - 3)) {
      stableEl.textContent = 'estável'; stableEl.className = 'stable-ok';
    } else if (valid < cfg.minSamples) {
      stableEl.textContent = `coletando (${valid}/${cfg.minSamples})`; stableEl.className = 'stable-wait';
    } else {
      stableEl.textContent = 'precisão acima do alvo'; stableEl.className = 'stable-bad';
    }
    drawChart();
  }

  // ---------- Captura fina ----------
  function startFine() {
    if (!('geolocation' in navigator)) {
      UI.toast('Geolocalização não suportada.', 'err'); return;
    }
    if (fine.running) return;

    fine = { running: true, samples: [], discarded: 0, startedAt: Date.now(), timer: null, raf: null };
    document.getElementById('gnssChartWrap').classList.remove('hidden');
    updateFineStats();
    UI.toast(`Captura fina iniciada — aguarde coletar ${cfg.minSamples} amostras...`);

    State.watchId = navigator.geolocation.watchPosition(
      (pos) => onFineSample(fromPosition(pos)),
      (err) => {
        console.error({ msg: err.message, context: 'GNSS.fine.watch' });
        UI.toast('Falha no GNSS durante captura fina.', 'err');
        stopWatch();
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    // Timer de duração máxima
    fine.timer = setTimeout(() => {
      if (fine.running) {
        UI.toast('Tempo máximo atingido. Finalizando com as amostras disponíveis.', 'warn');
        finishFine(true);
      }
    }, cfg.maxDurationMs);
  }

  function onFineSample(reading) {
    if (!fine.running) return;
    // Filtro 1: precisão máxima
    if (reading.acc === null || reading.acc === undefined || reading.acc > cfg.maxAcc) {
      fine.discarded++;
      updateFineStats();
      return;
    }
    // Filtro 2: outlier por distância em relação ao centróide atual (se já houver amostras)
    if (fine.samples.length >= 3) {
      const avg = computeAverage(fine.samples);
      const d = haversine(avg.lat, avg.lon, reading.lat, reading.lon);
      if (d > cfg.outlierDist) {
        fine.discarded++;
        updateFineStats();
        return;
      }
    }
    fine.samples.push(reading);
    updateFineStats();

    // Atualiza display com o resultado médio atual
    const avg = computeAverage(fine.samples);
    if (avg) {
      State.currentCoord = avg;
      setDisplay(avg);
    }

    // Condição de finalização antecipada: amostras mínimas + precisão-alvo atingida
    if (fine.samples.length >= cfg.minSamples && avg && avg.acc <= cfg.targetAcc) {
      finishFine(false);
    }
  }

  function finishFine(timedOut) {
    if (!fine.running) return;
    fine.running = false;
    clearTimeout(fine.timer);
    stopWatch();

    const avg = computeAverage(fine.samples);
    if (!avg || fine.samples.length < 3) {
      UI.toast(`Captura fina sem amostras suficientes (${fine.samples.length} válidas). Tente novamente em local aberto.`, 'err');
      return;
    }
    // Preserva o resultado como coordenada atual já com sample info
    State.currentCoord = avg;
    setDisplay(avg);
    let msg = `Captura fina finalizada: ${avg.acc.toFixed(1)} m (média de ${fine.samples.length} amostras`;
    if (avg.stdMeters !== undefined) msg += `, dispersão ${avg.stdMeters.toFixed(1)}m`;
    msg += ').';
    UI.toast(msg, timedOut ? 'warn' : 'ok');
  }

  function stopWatch() {
    if (State.watchId !== null) {
      navigator.geolocation.clearWatch(State.watchId);
      State.watchId = null;
    }
    if (fine.running) {
      finishFine(false);
    }
  }

  function applyManual() {
    const lat = parseFloat(document.getElementById('manualLat').value);
    const lon = parseFloat(document.getElementById('manualLon').value);
    const reason = document.getElementById('manualReason').value.trim() || 'Ajuste manual';
    if (!Utils.isValidCoord(lat, lon)) {
      UI.toast('Coordenada manual inválida. Verifique os limites.', 'err');
      return;
    }
    const original = State.currentCoord && State.currentCoord.source.startsWith('gnss')
      ? { ...State.currentCoord } : (State.currentCoord?.manualOverride?.original || null);

    State.currentCoord = {
      lat, lon,
      acc: null, alt: null, altAcc: null,
      ts: Utils.nowISO(),
      source: 'manual',
      manualOverride: { at: Utils.nowISO(), reason },
      original
    };
    setDisplay(State.currentCoord);
    document.getElementById('manualCoord').classList.add('hidden');
    document.getElementById('manualLat').value = '';
    document.getElementById('manualLon').value = '';
    document.getElementById('manualReason').value = '';
    UI.toast('Coordenada manual aplicada.', 'ok');
  }

  function getConfig() { return { ...cfg }; }

  async function saveConfig(partial) {
    Object.assign(cfg, partial);
    await DB.setSetting('gnssConfig', cfg);
  }

  return { captureOnce, startFine, stopWatch, applyManual, setDisplay,
           loadConfig, getConfig, saveConfig };
})();

/* ------------------------------------------------------------
   7. Validação
   ------------------------------------------------------------ */
const Validation = (() => {
  function validateRecord(form, values, coord) {
    const errors = [];
    if (!form || !form.fields) { errors.push('Formulário não configurado.'); return errors; }

    form.fields.forEach(f => {
      if (f.required) {
        const v = values[f.id];
        const empty = v === null || v === undefined || v === '' ||
                      (Array.isArray(v) && v.length === 0);
        if (empty) errors.push(`Campo obrigatório não preenchido: ${f.label}`);
      }
      // Tipagem numérica
      if (f.type === 'integer' && values[f.id] !== null && values[f.id] !== undefined) {
        if (!Number.isInteger(values[f.id])) errors.push(`Valor inteiro inválido em: ${f.label}`);
      }
      if (f.type === 'decimal' && values[f.id] !== null && values[f.id] !== undefined) {
        if (!Number.isFinite(values[f.id])) errors.push(`Valor decimal inválido em: ${f.label}`);
      }
    });

    if (!coord || !Utils.isValidCoord(coord.lat, coord.lon)) {
      errors.push('Coordenada GNSS ainda não capturada ou inválida.');
    }
    return errors;
  }
  return { validateRecord };
})();

/* ------------------------------------------------------------
   7b. Basemap — camadas base (ruas, satélite online, imagens locais)
   ------------------------------------------------------------ */
const Basemap = (() => {
  const objectUrls = new Map(); // imageryId -> object URL (Blob), reutilizável entre mapas

  function osmLayer() {
    return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    });
  }

  function satelliteLayer() {
    // Esri World Imagery — gratuito para exibição em apps web. Ordem de tile: {z}/{y}/{x}.
    // Só funciona online (não é pré-cacheado pelo Service Worker, mesma política do OSM/README).
    return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri — Fonte: Esri, Maxar, Earthstar Geographics',
      maxZoom: 19
    });
  }

  function referenceLabelsLayer() {
    // Camada de referência (rótulos, vias, limites) do Esri — usada por cima do satélite p/ formar o "Híbrido".
    return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri',
      maxZoom: 19,
      pane: 'overlayPane'
    });
  }

  function hybridLayer() {
    // Satélite + rótulos combinados num único L.layerGroup, tratado como uma camada base só.
    return L.layerGroup([satelliteLayer(), referenceLabelsLayer()]);
  }

  function imageryObjectUrl(img) {
    if (!objectUrls.has(img.id)) {
      objectUrls.set(img.id, URL.createObjectURL(img.blob));
    }
    return objectUrls.get(img.id);
  }

  function revokeImagery(id) {
    if (objectUrls.has(id)) {
      URL.revokeObjectURL(objectUrls.get(id));
      objectUrls.delete(id);
    }
  }

  function revokeAll() {
    objectUrls.forEach(u => URL.revokeObjectURL(u));
    objectUrls.clear();
  }

  /** Monta o dicionário de camadas base disponíveis (fixas + imagens locais salvas). */
  async function buildLayers() {
    const imagery = await DB.getAllImagery();
    const layers = {
      osm: { label: 'Ruas (OSM)', icon: 'map', layer: osmLayer() },
      satellite: { label: 'Satélite (online)', icon: 'satellite', layer: satelliteLayer() },
      hybrid: { label: 'Híbrido (satélite + rótulos)', icon: 'layers', layer: hybridLayer() }
    };
    imagery.forEach(img => {
      layers[img.id] = {
        label: img.name,
        icon: 'image',
        layer: L.imageOverlay(imageryObjectUrl(img), [
          [img.bounds.south, img.bounds.west],
          [img.bounds.north, img.bounds.east]
        ])
      };
    });
    return layers;
  }

  async function resolveActiveId(layers) {
    const activeId = await DB.getSetting('activeBasemapId');
    return (activeId && layers[activeId]) ? activeId : 'osm';
  }

  /** Aplica a camada ativa + control de camadas (com ícones) a um mapa Leaflet. */
  async function applyTo(map) {
    const layers = await buildLayers();
    const activeId = await resolveActiveId(layers);
    layers[activeId].layer.addTo(map);

    const namedLayers = {};
    Object.values(layers).forEach(v => {
      const key = `<span class="leaflet-layer-label"><svg class="icon icon-sm"><use href="#icon-${v.icon}"/></svg>${Utils.escapeHtml(v.label)}</span>`;
      namedLayers[key] = v.layer;
    });
    L.control.layers(namedLayers, {}, { collapsed: true }).addTo(map);

    map.on('baselayerchange', (e) => {
      const found = Object.entries(layers).find(([, v]) => v.layer === e.layer);
      if (found) DB.setSetting('activeBasemapId', found[0]).catch(() => {});
    });
  }

  return { applyTo, imageryObjectUrl, revokeImagery, revokeAll };
})();

/* ------------------------------------------------------------
   8. Mapa
   ------------------------------------------------------------ */
const Mapa = (() => {
  let initialized = false;

  function init() {
    if (initialized) return;
    try {
      State.map = L.map('map', { center: [-3.1, -60.0], zoom: 11 });
      // Basemap (ruas/satélite/imagem local) — apenas ruas/satélite exigem internet;
      // em offline sem imagem local carregada, pontos aparecem sobre fundo neutro.
      Basemap.applyTo(State.map).catch(() => {
        console.warn('Basemap indisponível; exibindo pontos sem base.');
      });
      State.mapMarkersLayer = L.layerGroup().addTo(State.map);
      initialized = true;
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'Mapa.init' });
      UI.toast('Erro ao inicializar mapa.', 'err');
    }
  }

  function buildPopup(record, form) {
    const fields = (form && form.fields) ? form.fields : [];
    const rows = fields.map(f => {
      const v = record.attributes[f.id];
      if (v === undefined || v === null || v === '' ||
          (Array.isArray(v) && v.length === 0)) return '';
      const display = Array.isArray(v) ? v.join(', ') : v;
      return `<div><strong>${Utils.escapeHtml(f.label)}:</strong> ${Utils.escapeHtml(display)}</div>`;
    }).join('');

    const title = record.attributes[fields[0]?.id] || 'Registro de campo';
    const lat = record.geometry.coordinates[1];
    const lon = record.geometry.coordinates[0];

    return `
      <div class="popup-card">
        <h3>${Utils.escapeHtml(title)}</h3>
        ${rows}
        <hr/>
        <div><strong>Latitude:</strong> ${Utils.escapeHtml(lat.toFixed(6))}</div>
        <div><strong>Longitude:</strong> ${Utils.escapeHtml(lon.toFixed(6))}</div>
        <div><strong>Precisão:</strong> ${record.gnss && record.gnss.accuracy !== null && record.gnss.accuracy !== undefined ? Utils.escapeHtml(record.gnss.accuracy.toFixed(1)) + ' m' : 'N/I'}</div>
        <div><strong>Captura:</strong> ${Utils.escapeHtml(Utils.fmtDateTime(record.gnss?.timestamp || record.createdAt))}</div>
        <div class="row">
          <button class="btn btn-ghost" data-popup-copy="${lat},${lon}"><svg class="icon icon-sm"><use href="#icon-copy"/></svg>Copiar</button>
          <button class="btn btn-secondary" data-popup-edit="${record.recordId}"><svg class="icon icon-sm"><use href="#icon-edit-pencil"/></svg>Editar</button>
        </div>
      </div>`;
  }

  async function refresh() {
    if (!initialized) init();
    if (!State.map) return;
    try {
      State.mapMarkersLayer.clearLayers();
      const formFilter = document.getElementById('filterForm').value;
      const catFilter = document.getElementById('filterCat').value;
      const records = await DB.getAllRecords();
      const forms = await DB.getAllForms();
      const formMap = new Map(forms.map(f => [f.formId, f]));

      const bounds = [];
      let count = 0;
      for (const r of records) {
        if (!r.geometry || !Utils.isValidCoord(r.geometry.coordinates[1], r.geometry.coordinates[0])) continue;
        if (formFilter && r.formId !== formFilter) continue;
        if (catFilter) {
          const form = formMap.get(r.formId);
          const catField = form?.fields.find(f => f.type === 'select');
          if (catField && r.attributes[catField.id] !== catFilter) continue;
        }
        const lat = r.geometry.coordinates[1];
        const lon = r.geometry.coordinates[0];
        bounds.push([lat, lon]);
        const m = L.marker([lat, lon]).addTo(State.mapMarkersLayer);
        m.bindPopup(buildPopup(r, formMap.get(r.formId)));
        count++;
      }
      if (bounds.length) {
        try { State.map.fitBounds(bounds, { padding: [30, 30] }); } catch {}
      }
      // rebind ações dos popups (delegação ao abrir)
      State.map.on('popupopen', (e) => {
        const root = e.popup.getElement();
        const copyBtn = root.querySelector('[data-popup-copy]');
        const editBtn = root.querySelector('[data-popup-edit]');
        if (copyBtn) copyBtn.addEventListener('click', () => {
          const [la, lo] = copyBtn.dataset.popupCopy.split(',');
          navigator.clipboard?.writeText(`${la}, ${lo}`).then(
            () => UI.toast('Coordenada copiada.', 'ok'),
            () => UI.toast(`Coordenada: ${la}, ${lo}`)
          );
        });
        if (editBtn) editBtn.addEventListener('click', async () => {
          const id = editBtn.dataset.popupEdit;
          await App.startEdit(id);
        });
      });
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'Mapa.refresh' });
      UI.toast('Erro ao atualizar mapa.', 'err');
    }
  }

  function centerOnMe() {
    if (!State.currentCoord || !Utils.isValidCoord(State.currentCoord.lat, State.currentCoord.lon)) {
      UI.toast('Nenhuma coordenada atual. Capture antes.', 'warn'); return;
    }
    if (!State.map) return;
    State.map.setView([State.currentCoord.lat, State.currentCoord.lon], 16);
    UI.toast('Centralizado na posição atual.', 'ok');
  }

  function fitAll() {
    refresh();
  }

  return { init, refresh, centerOnMe, fitAll };
})();

/* ------------------------------------------------------------
   8b. CollectPreview — miniatura de localização na tela Coleta
   ------------------------------------------------------------ */
const CollectPreview = (() => {
  let initialized = false;

  async function init() {
    if (initialized) return;
    const el = document.getElementById('collectMiniMap');
    if (!el) return;
    try {
      State.miniMap = L.map('collectMiniMap', {
        center: [-3.1, -60.0],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false
      });
      await Basemap.applyTo(State.miniMap);
      initialized = true;
      if (State.currentCoord) update(State.currentCoord);
      LiveTrack.sync();
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'CollectPreview.init' });
    }
  }

  function update(coord) {
    if (!initialized || !State.miniMap) return;
    if (!coord || !Utils.isValidCoord(coord.lat, coord.lon)) {
      if (State.miniMapMarker) { State.miniMapMarker.remove(); State.miniMapMarker = null; }
      return;
    }
    const ll = [coord.lat, coord.lon];
    if (!State.miniMapMarker) {
      State.miniMapMarker = L.marker(ll).addTo(State.miniMap);
    } else {
      State.miniMapMarker.setLatLng(ll);
    }
    State.miniMap.setView(ll, Math.max(State.miniMap.getZoom(), 16));
  }

  /** Alterna entre a altura padrão e uma versão ampliada da miniatura. */
  function toggleExpand() {
    const el = document.getElementById('collectMiniMap');
    const btn = document.getElementById('miniMapExpandBtn');
    if (!el) return;
    const expanded = el.classList.toggle('expanded');
    if (btn) {
      btn.querySelector('use').setAttribute('href', expanded ? '#icon-collapse' : '#icon-expand');
      btn.setAttribute('aria-label', expanded ? 'Reduzir mapa' : 'Ampliar mapa');
    }
    // Leaflet precisa recalcular o tamanho depois que o contêiner muda de altura.
    // invalidateSize() imediato cobre quem tem "reduzir movimento" ativado (sem transição
    // CSS); o listener de transitionend garante o tamanho final correto quando há animação.
    if (State.miniMap) State.miniMap.invalidateSize();
    el.addEventListener('transitionend', () => {
      if (State.miniMap) State.miniMap.invalidateSize();
    }, { once: true });
  }

  return { init, update, toggleExpand };
})();

/* ------------------------------------------------------------
   8c. LiveTrack — rastreamento contínuo da posição em campo
   Ativo automaticamente durante a tela de Coleta. Independente da
   coordenada capturada para o registro (State.currentCoord): mostra
   onde o usuário está fisicamente agora, em tempo real, sobre a
   miniatura de mapa local.
   ------------------------------------------------------------ */
const LiveTrack = (() => {
  let warnedOnce = false;
  let watchdogTimer = null;

  function start() {
    if (!('geolocation' in navigator)) return;
    if (State.liveWatchId !== null) return; // já em execução
    warnedOnce = false;
    try {
      State.liveWatchId = navigator.geolocation.watchPosition(onUpdate, onError, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 3000
      });
      setBadge(true);
      // Alguns navegadores não disparam sucesso nem erro quando a permissão já
      // está bloqueada (o `timeout` da PositionOptions não cobre esse caso).
      // Watchdog evita que o selo fique preso em "ativo" indefinidamente.
      clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(checkStuck, 22000);
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'LiveTrack.start' });
    }
  }

  async function checkStuck() {
    if (State.liveWatchId === null || State.livePosition) return; // já parado ou já recebeu posição
    let denied = false;
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        denied = status.state === 'denied';
      }
    } catch { /* API indisponível — segue como timeout comum */ }
    if (denied) {
      stop();
      UI.toast('Permissão de localização negada — rastreamento contínuo desativado.', 'warn');
    } else {
      onError({ code: 3, message: 'Nenhuma posição recebida a tempo.' });
    }
  }

  function stop() {
    clearTimeout(watchdogTimer);
    if (State.liveWatchId !== null) {
      navigator.geolocation.clearWatch(State.liveWatchId);
      State.liveWatchId = null;
    }
    if (State.liveMiniMarker)   { try { State.liveMiniMarker.remove(); } catch {} State.liveMiniMarker = null; }
    if (State.liveMiniAccuracy) { try { State.liveMiniAccuracy.remove(); } catch {} State.liveMiniAccuracy = null; }
    State.livePosition = null;
    setBadge(false);
  }

  function onUpdate(pos) {
    clearTimeout(watchdogTimer);
    const c = pos.coords;
    if (!Utils.isValidCoord(c.latitude, c.longitude)) return;
    State.livePosition = { lat: c.latitude, lon: c.longitude, acc: c.accuracy };
    render();
  }

  function onError(err) {
    console.error({ msg: err.message, context: 'LiveTrack.watch' });
    if (err.code === 1) {
      // Permissão negada: não insistir, e não mostrar o selo como se estivesse ativo.
      stop();
      UI.toast('Permissão de localização negada — rastreamento contínuo desativado.', 'warn');
      return;
    }
    if (!warnedOnce) {
      warnedOnce = true;
      UI.toast('Não foi possível iniciar o rastreamento contínuo da posição.', 'warn');
    }
  }

  /** Redesenha o ponto de rastreamento na miniatura, se já houver posição e mapa prontos. */
  function render() {
    if (!State.miniMap || !State.livePosition) return;
    const { lat, lon, acc } = State.livePosition;
    const ll = [lat, lon];
    try {
      if (!State.liveMiniMarker) {
        State.liveMiniMarker = L.marker(ll, {
          icon: L.divIcon({
            className: 'live-dot-icon',
            html: '<span class="live-dot"><span class="live-dot-core"></span></span>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          }),
          zIndexOffset: 900,
          keyboard: false,
          interactive: false,
          alt: 'Sua posição atual'
        }).addTo(State.miniMap);
      } else {
        State.liveMiniMarker.setLatLng(ll);
      }
      if (Number.isFinite(acc) && acc > 0) {
        if (!State.liveMiniAccuracy) {
          State.liveMiniAccuracy = L.circle(ll, {
            radius: acc, className: 'live-accuracy-circle', interactive: false,
            color: '#1f8ed1', weight: 1, fillColor: '#1f8ed1', fillOpacity: .12
          }).addTo(State.miniMap);
        } else {
          State.liveMiniAccuracy.setLatLng(ll).setRadius(acc);
        }
      }
      State.miniMap.setView(ll, Math.max(State.miniMap.getZoom(), 16));
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'LiveTrack.render' });
    }
  }

  function setBadge(active) {
    const el = document.getElementById('liveTrackBadge');
    if (el) el.classList.toggle('hidden', !active);
  }

  /** Chamado quando a miniatura é (re)inicializada, para redesenhar a posição já conhecida. */
  function sync() { render(); }

  return { start, stop, sync };
})();

/* ------------------------------------------------------------
   9. Exportações
   ------------------------------------------------------------ */
const Exporter = (() => {

  async function gatherRecords() {
    const formFilter = document.getElementById('exportForm').value;
    let records = await DB.getAllRecords();
    if (formFilter) records = records.filter(r => r.formId === formFilter);
    const forms = await DB.getAllForms();
    const formMap = new Map(forms.map(f => [f.formId, f]));
    return { records, forms, formMap };
  }

  /** Download via Blob. */
  function download(content, filename, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function nowStamp() {
    return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  }

  // ---- CSV ----
  async function toCSV() {
    try {
      const { records, formMap } = await gatherRecords();
      if (records.length === 0) { UI.toast('Nenhum registro para exportar.', 'warn'); return; }
      const sep = document.getElementById('csvSep').value || ';';

      // Coleta todos os campos dinâmicos (união dos forms)
      const fieldSet = new Map(); // id -> {id,label}
      records.forEach(r => {
        const f = formMap.get(r.formId);
        (f?.fields || []).forEach(fld => fieldSet.set(fld.id, { id: fld.id, label: fld.label }));
      });
      const dynFields = [...fieldSet.values()];

      const fixed = ['recordId', 'formId', 'createdAt', 'latitude', 'longitude', 'accuracy', 'altitude', 'crs'];
      const header = [...fixed, ...dynFields.map(f => f.label)];
      const esc = (v) => {
        if (v === null || v === undefined) return '';
        let s = Array.isArray(v) ? v.join('|') : String(v);
        if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      const lines = [header.map(esc).join(sep)];
      records.forEach(r => {
        const la = r.geometry?.coordinates?.[1] ?? '';
        const lo = r.geometry?.coordinates?.[0] ?? '';
        const row = [
          r.recordId, r.formId, r.createdAt,
          la, lo,
          r.gnss?.accuracy ?? '', r.gnss?.altitude ?? '',
          'EPSG:4326',
          ...dynFields.map(f => r.attributes?.[f.id] ?? '')
        ];
        lines.push(row.map(esc).join(sep));
      });

      // BOM UTF-8 p/ Excel pt-BR
      const csv = '\uFEFF' + lines.join('\r\n');
      download(csv, `coleta_${nowStamp()}.csv`, 'text/csv;charset=utf-8');
      UI.toast(`CSV exportado (${records.length} registros).`, 'ok');
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'Exporter.toCSV' });
      UI.toast('Erro ao exportar CSV.', 'err');
    }
  }

  // ---- GeoJSON ----
  async function toGeoJSON() {
    try {
      const { records, formMap } = await gatherRecords();
      if (records.length === 0) { UI.toast('Nenhum registro para exportar.', 'warn'); return; }

      const features = [];
      const noGeom = [];
      records.forEach(r => {
        const la = r.geometry?.coordinates?.[1];
        const lo = r.geometry?.coordinates?.[0];
        if (!Utils.isValidCoord(la, lo)) { noGeom.push(r.recordId); return; }
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [Number(lo), Number(la)] },
          properties: {
            recordId: r.recordId,
            formId: r.formId,
            createdAt: r.createdAt,
            accuracy: r.gnss?.accuracy ?? null,
            altitude: r.gnss?.altitude ?? null,
            crs: 'EPSG:4326',
            ...r.attributes
          }
        });
      });

      const fc = { type: 'FeatureCollection', features };
      download(JSON.stringify(fc, null, 2), `coleta_${nowStamp()}.geojson`, 'application/geo+json');
      let msg = `GeoJSON exportado (${features.length} feições).`;
      if (noGeom.length) msg += ` ${noGeom.length} sem coordenada foram omitidos.`;
      UI.toast(msg, features.length ? 'ok' : 'warn');
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'Exporter.toGeoJSON' });
      UI.toast('Erro ao exportar GeoJSON.', 'err');
    }
  }

  // ---- KML ----
  function escapeXml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function toKML() {
    try {
      const { records, formMap } = await gatherRecords();
      if (records.length === 0) { UI.toast('Nenhum registro para exportar.', 'warn'); return; }

      const placemarks = records.map(r => {
        const la = r.geometry?.coordinates?.[1];
        const lo = r.geometry?.coordinates?.[0];
        const alt = r.gnss?.altitude ?? 0;
        if (!Utils.isValidCoord(la, lo)) return '';
        const form = formMap.get(r.formId);
        const firstField = form?.fields?.[0];
        const name = (firstField && r.attributes?.[firstField.id]) || 'Registro';
        const descRows = (form?.fields || []).map(f => {
          const v = r.attributes?.[f.id];
          if (v === undefined || v === null || v === '' ||
              (Array.isArray(v) && v.length === 0)) return '';
          return `<br/><b>${escapeXml(f.label)}:</b> ${escapeXml(Array.isArray(v) ? v.join(', ') : v)}`;
        }).join('');
        const desc = `${descRows}<br/><b>Lat:</b> ${escapeXml(la.toFixed(6))}<br/><b>Lon:</b> ${escapeXml(lo.toFixed(6))}<br/><b>Precisão:</b> ${escapeXml(r.gnss?.accuracy ?? 'N/I')} m`;
        return `
      <Placemark>
        <name>${escapeXml(name)}</name>
        <description><![CDATA[${desc}]]></description>
        <Point><coordinates>${lo},${la},${alt}</coordinates></Point>
      </Placemark>`;
      }).filter(Boolean).join('');

      const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Coleta Territorial</name>
    ${placemarks}
  </Document>
</kml>`;
      download(kml, `coleta_${nowStamp()}.kml`, 'application/vnd.google-earth.kml+xml');
      UI.toast('KML exportado.', 'ok');
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'Exporter.toKML' });
      UI.toast('Erro ao exportar KML.', 'err');
    }
  }

  // ---- Shapefile (via @crmackey/shp-write) ----
  async function toShapefile() {
    try {
      const { records, formMap } = await gatherRecords();
      if (records.length === 0) { UI.toast('Nenhum registro para exportar.', 'warn'); return; }

      const validRecords = records.filter(r =>
        r.geometry && Utils.isValidCoord(r.geometry.coordinates[1], r.geometry.coordinates[0]));
      if (validRecords.length === 0) {
        UI.toast('Nenhum registro com coordenada válida.', 'warn'); return;
      }

      // Coleta todos os campos dinâmicos (união) e aplica mapeamento DBF ≤ 10 chars
      const dynFieldMap = new Map();
      validRecords.forEach(r => {
        const f = formMap.get(r.formId);
        (f?.fields || []).forEach(fld => {
          if (!dynFieldMap.has(fld.id)) dynFieldMap.set(fld.id, fld.label);
        });
      });

      const fixedFields = [
        ['recordId', 'RECORDID'],
        ['formId', 'FORMID'],
        ['createdAt', 'DATACRIA'],
        ['accuracy', 'PRECISAO'],
        ['altitude', 'ALTITUDE']
      ];
      const usedNames = new Set();
      const mapping = []; // {original, abbr}
      fixedFields.forEach(([orig, abbr]) => {
        usedNames.add(abbr);
        mapping.push({ original: orig, abbr });
      });
      dynFieldMap.forEach((label, id) => {
        const abbr = Utils.abbreviateField(label || id, usedNames);
        mapping.push({ original: label || id, abbr, fieldId: id });
      });

      // Exibe tabela de mapeamento
      showMapping(mapping);

      // Constrói GeoJSON de entrada com properties já abreviadas
      const fc = {
        type: 'FeatureCollection',
        features: validRecords.map(r => {
          const props = {};
          const setProp = (origKey, abbr, val) => {
            if (val === null || val === undefined) { props[abbr] = ''; return; }
            if (Array.isArray(val)) props[abbr] = val.join('|');
            else if (typeof val === 'object') props[abbr] = JSON.stringify(val);
            else props[abbr] = val;
          };
          fixedFields.forEach(([orig, abbr]) => {
            if (orig === 'recordId') setProp(orig, abbr, r.recordId);
            else if (orig === 'formId') setProp(orig, abbr, r.formId);
            else if (orig === 'createdAt') setProp(orig, abbr, r.createdAt);
            else if (orig === 'accuracy') setProp(orig, abbr, r.gnss?.accuracy);
            else if (orig === 'altitude') setProp(orig, abbr, r.gnss?.altitude);
          });
          dynFieldMap.forEach((label, id) => {
            const m = mapping.find(x => x.fieldId === id);
            if (m) setProp(id, m.abbr, r.attributes?.[id]);
          });
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [r.geometry.coordinates[0], r.geometry.coordinates[1]] },
            properties: props
          };
        })
      };

      // shp-write é módulo ESM: import dinâmico
      let shpwrite;
      try {
        const mod = await import('https://unpkg.com/@crmackey/shp-write@0.4.5/lib/shpwriter.esm.js');
        shpwrite = mod;
      } catch (eImp) {
        console.error({ msg: eImp.message, stack: eImp.stack, context: 'Exporter.toShapefile.import' });
        UI.toast('Biblioteca shp-write indisponível (offline?). Tente novamente online ou use GeoJSON.', 'err');
        return;
      }
      const zipFn = shpwrite.zip;

      // A API do @crmackey/shp-write: zip(geojson, options) -> Promise<Blob>
      // options.name define o basename; options.types mapeia o tipo de geometria -> nome do arquivo
      const options = {
        name: `coleta_${nowStamp()}`,
        types: { point: 'pontos' }
      };

      let result;
      try {
        result = await zipFn(fc, options);
      } catch (e1) {
        // fallback: algumas versões expõem download() que dispara saveAs; não usaremos.
        console.error({ msg: e1.message, stack: e1.stack, context: 'Exporter.toShapefile.zip' });
        throw e1;
      }

      const blob = result instanceof Blob ? result : new Blob([result], { type: 'application/zip' });
      download(blob, `coleta_${nowStamp()}.zip`, 'application/zip');
      UI.toast(`Shapefile exportado (${validRecords.length} pontos).`, 'ok');
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'Exporter.toShapefile' });
      UI.toast('Erro ao exportar Shapefile. Detalhes no console.', 'err');
    }
  }

  function showMapping(mapping) {
    const el = document.getElementById('shpMapping');
    el.innerHTML = `
      <strong>Mapeamento de campos (limite DBF = 10 caracteres):</strong>
      <table>
        <thead><tr><th>Campo original</th><th>Nome no Shapefile</th></tr></thead>
        <tbody>
          ${mapping.map(m => `<tr><td>${Utils.escapeHtml(m.original)}</td><td>${Utils.escapeHtml(m.abbr)}</td></tr>`).join('')}
        </tbody>
      </table>`;
    el.classList.remove('hidden');
  }

  return { toCSV, toGeoJSON, toKML, toShapefile };
})();

/* ------------------------------------------------------------
   9b. Report — relatório técnico em PDF por registro (nome do local,
   finalidade/formulário, atributos, foto anexada e esquema de
   localização com coordenada). Gerado 100% no cliente via jsPDF.
   ------------------------------------------------------------ */
const Report = (() => {
  let jsPDFPromise = null;

  /** Carrega o build UMD do jsPDF via <script> clássico (o build ESM referencia
   *  specifiers "nus" de @babel/runtime que o navegador não resolve em import()). */
  function loadJsPDF() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (jsPDFPromise) return jsPDFPromise;
    jsPDFPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js';
      s.onload = () => {
        if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
        else reject(new Error('jsPDF carregado, mas construtor não encontrado.'));
      };
      s.onerror = () => reject(new Error('Falha ao carregar a biblioteca de PDF (sem conexão na primeira vez?).'));
      document.head.appendChild(s);
    }).catch(e => { jsPDFPromise = null; throw e; });
    return jsPDFPromise;
  }

  /** Desenha um esquema técnico de localização (sem tiles online — evita bloqueio de CORS e funciona 100% offline). */
  function drawLocationDiagram(gnss) {
    const size = 500;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // reticulado técnico
    ctx.strokeStyle = '#e2e5ea';
    ctx.lineWidth = 1;
    const step = size / 10;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
    ctx.strokeStyle = '#9aa1ab';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);

    const cx = size / 2, cy = size / 2;

    // círculo de precisão (proporcional, ilustrativo — não é escala cartográfica real)
    const acc = Number.isFinite(gnss?.acc) ? gnss.acc : null;
    const accPx = acc ? Math.min(Math.max(acc * 2, 40), size * 0.42) : 60;
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = '#0079c1';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, accPx, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // crosshair + ponto central
    ctx.strokeStyle = '#00436b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy); ctx.lineTo(cx + 26, cy);
    ctx.moveTo(cx, cy - 26); ctx.lineTo(cx, cy + 26);
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();

    // seta norte
    ctx.strokeStyle = '#1b1f24'; ctx.fillStyle = '#1b1f24'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size - 34, 44); ctx.lineTo(size - 34, 18);
    ctx.moveTo(size - 34, 18); ctx.lineTo(size - 40, 28);
    ctx.moveTo(size - 34, 18); ctx.lineTo(size - 28, 28);
    ctx.stroke();
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', size - 34, 62);

    // rótulo de precisão
    if (acc) {
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#0079c1'; ctx.textAlign = 'left';
      ctx.fillText(`raio de incerteza ≈ ${acc.toFixed(1)} m`, 12, size - 14);
    }

    return canvas.toDataURL('image/png');
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function imageDims(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function fileSafeName(s) {
    return String(s || '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
  }

  async function generate(record, form) {
    try {
      UI.toast('Gerando relatório em PDF...');
      const jsPDFCtor = await loadJsPDF();
      const doc = new jsPDFCtor({ unit: 'mm', format: 'a4' });
      const pageW = 210, marginX = 18;
      let y = 20;

      // Cabeçalho — formulário (finalidade) + nome do local coletado
      doc.setFontSize(9); doc.setTextColor(120);
      doc.text(String(form.name || 'Formulário').toUpperCase(), marginX, y);
      y += 5;
      if (form.description) {
        const descLines = doc.splitTextToSize(form.description, pageW - marginX * 2);
        doc.text(descLines, marginX, y);
        y += 4.5 * descLines.length + 3;
      } else {
        y += 3;
      }
      doc.setDrawColor(210); doc.line(marginX, y, pageW - marginX, y);
      y += 9;

      const firstField = form.fields?.[0];
      const localName = (firstField && record.attributes?.[firstField.id]) || 'Registro de campo';
      doc.setFontSize(18); doc.setTextColor(20);
      const titleLines = doc.splitTextToSize(String(localName), pageW - marginX * 2);
      doc.text(titleLines, marginX, y);
      y += 7 * titleLines.length + 2;

      // Metadados de coleta e coordenada
      const la = record.geometry?.coordinates?.[1];
      const lo = record.geometry?.coordinates?.[0];
      doc.setFontSize(10); doc.setTextColor(70);
      const metaLines = [
        `Coletado em: ${Utils.fmtDateTime(record.createdAt)}`,
        `Coordenada: ${Number.isFinite(la) ? la.toFixed(6) : '--'}, ${Number.isFinite(lo) ? lo.toFixed(6) : '--'} (EPSG:4326)`,
        `Precisão: ${record.gnss?.accuracy != null ? record.gnss.accuracy.toFixed(1) + ' m' : 'N/I'}` +
          (record.gnss?.altitude != null ? `  •  Altitude: ${record.gnss.altitude.toFixed(1)} m` : '')
      ];
      metaLines.forEach(line => { doc.text(line, marginX, y); y += 5.5; });
      y += 3;

      // Esquema de localização (canto direito)
      const diagramSize = 55;
      const diagramX = pageW - marginX - diagramSize;
      const diagramY = y;
      try {
        const diagramDataUrl = drawLocationDiagram({ acc: record.gnss?.accuracy });
        doc.addImage(diagramDataUrl, 'PNG', diagramX, diagramY, diagramSize, diagramSize);
        doc.setFontSize(7.5); doc.setTextColor(140);
        const capLines = doc.splitTextToSize('Esquema técnico de localização (sem base cartográfica online)', diagramSize);
        doc.text(capLines, diagramX, diagramY + diagramSize + 4);
      } catch (e) {
        console.error({ msg: e.message, stack: e.stack, context: 'Report.diagram' });
      }

      // Atributos do formulário (coluna esquerda, ao lado do esquema)
      const attrColWidth = diagramX - marginX - 8;
      doc.setFontSize(11); doc.setTextColor(20);
      doc.text('Atributos coletados', marginX, y);
      y += 6;
      doc.setFontSize(9.5);
      (form.fields || []).forEach(f => {
        if (f.type === 'photo') return;
        const raw = record.attributes?.[f.id];
        if (raw === undefined || raw === null || raw === '') return;
        const display = Array.isArray(raw) ? raw.join(', ') : (typeof raw === 'boolean' ? (raw ? 'Sim' : 'Não') : String(raw));
        doc.setTextColor(20); doc.setFont(undefined, 'bold');
        doc.text(`${f.label}:`, marginX, y);
        doc.setTextColor(60); doc.setFont(undefined, 'normal');
        const lines = doc.splitTextToSize(display, attrColWidth - 30);
        doc.text(lines, marginX + 30, y);
        y += 5.2 * Math.max(lines.length, 1);
      });
      doc.setFont(undefined, 'normal');

      y = Math.max(y, diagramY + diagramSize + 10) + 4;

      // Foto anexada (se houver)
      const photoField = (form.fields || []).find(f => f.type === 'photo');
      if (photoField) {
        const attId = record.attributes?.[photoField.id];
        const att = attId ? await DB.getAttachment(attId) : null;
        if (att?.blob) {
          const dataUrl = await blobToDataURL(att.blob);
          const dims = await imageDims(dataUrl);
          const maxW = pageW - marginX * 2, maxH = 95;
          let w = maxW, h = w * (dims.height / dims.width);
          if (h > maxH) { h = maxH; w = h * (dims.width / dims.height); }
          if (y + h + 12 > 280) { doc.addPage(); y = 20; }
          doc.setFontSize(11); doc.setTextColor(20);
          doc.text(photoField.label || 'Evidência fotográfica', marginX, y);
          y += 5;
          doc.addImage(dataUrl, 'JPEG', marginX, y, w, h);
          y += h + 6;
        }
      }

      // Rodapé
      doc.setFontSize(7.5); doc.setTextColor(150);
      doc.text(`Gerado por Coletor Territorial em ${Utils.fmtDateTime(Utils.nowISO())} • ID: ${record.recordId}`, marginX, 290);

      doc.save(`relatorio_${fileSafeName(localName) || record.recordId}.pdf`);
      UI.toast('PDF gerado.', 'ok');
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'Report.generate' });
      UI.toast(e.message || 'Erro ao gerar o PDF.', 'err');
    }
  }

  return { generate };
})();

/* ------------------------------------------------------------
   10. App — orquestra tudo
   ------------------------------------------------------------ */
const App = {

  async init() {
    try {
      await DB.open();

      // Inicializa estado de formulário
      const forms = await DB.getAllForms();
      if (forms.length > 0) {
        // Usa o primeiro formulário disponível como ativo
        State.currentForm = forms[0];
        State.draftFields = JSON.parse(JSON.stringify(forms[0].fields || []));
        document.getElementById('formName').value = forms[0].name || '';
        document.getElementById('formDesc').value = forms[0].description || '';
      } else {
        // seed demo
        await this.seedDemo();
      }

      FormBuilder.renderList();
      this.bindEvents();
      this.bindNav();
      this.refreshTopbar();
      this.populateFormSelectors();
      this.showConnStatus();
      this.showProtocolInfo();
      this.maybeRequestPersist();
      this.updateStorageInfo();
      await GNSS.loadConfig();
      this.populateGnssSettings();

      window.addEventListener('online', () => this.showConnStatus());
      window.addEventListener('offline', () => this.showConnStatus());
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.init' });
      UI.toast('Erro ao iniciar aplicação.', 'err');
    }
  },

  bindEvents() {
    // Form meta
    document.getElementById('formMeta').addEventListener('submit', (e) => { e.preventDefault(); FormBuilder.saveMeta(); });
    document.getElementById('addFieldBtn').addEventListener('click', () => FormBuilder.addField());
    document.getElementById('loadDemoFormBtn').addEventListener('click', async () => { await this.seedDemo(); FormBuilder.renderList(); });
    document.getElementById('newFormBtn').addEventListener('click', () => FormBuilder.newForm());
    document.getElementById('formSelect').addEventListener('change', async (e) => {
      try {
        const formId = e.target.value;
        if (!formId) { FormBuilder.newForm(); return; }
        const form = await DB.getForm(formId);
        if (form) FormBuilder.loadForm(form);
      } catch (err) {
        console.error({ msg: err.message, stack: err.stack, context: 'formSelect.change' });
        UI.toast('Erro ao carregar formulário.', 'err');
      }
    });
    document.getElementById('collectFormSelect').addEventListener('change', async (e) => {
      try {
        const formId = e.target.value;
        if (!formId) { FormBuilder.newForm(); }
        else {
          const form = await DB.getForm(formId);
          if (form) FormBuilder.loadForm(form);
        }
        State.editingRecordId = null;
        State.currentCoord = null;
        GNSS.setDisplay(null);
        this.renderCollectFields();
      } catch (err) {
        console.error({ msg: err.message, stack: err.stack, context: 'collectFormSelect.change' });
        UI.toast('Erro ao trocar formulário.', 'err');
      }
    });

    // GNSS
    document.getElementById('captureBtn').addEventListener('click', () => GNSS.captureOnce());
    document.getElementById('fineBtn').addEventListener('click', () => GNSS.startFine());
    document.getElementById('stopWatchBtn').addEventListener('click', () => GNSS.stopWatch());
    document.getElementById('manualCoordBtn').addEventListener('click', () => {
      document.getElementById('manualCoord').classList.toggle('hidden');
    });
    document.getElementById('applyManualBtn').addEventListener('click', () => GNSS.applyManual());

    // GNSS settings
    document.getElementById('saveGnssBtn').addEventListener('click', async () => {
      const partial = {
        minSamples: Math.max(3, parseInt(document.getElementById('setSamples').value, 10) || 8),
        maxAcc: Math.max(1, parseFloat(document.getElementById('setMaxAcc').value) || 30),
        targetAcc: Math.max(1, parseFloat(document.getElementById('setTargetAcc').value) || 10),
        maxDurationMs: (Math.max(10, parseInt(document.getElementById('setDuration').value, 10) || 30)) * 1000
      };
      await GNSS.saveConfig(partial);
      this.populateGnssSettings();
      UI.toast('Parâmetros GNSS salvos.', 'ok');
    });

    // Coleta
    document.getElementById('collectForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveRecord(); });
    document.getElementById('clearFormBtn').addEventListener('click', () => {
      State.currentCoord = null;
      GNSS.setDisplay(null);
      State.editingRecordId = null;
      this.renderCollectFields();
    });
    PhotoField.bindDelegated(document.getElementById('collectFields'));

    // Miniatura de localização (tela Coleta)
    document.getElementById('miniMapExpandBtn').addEventListener('click', () => CollectPreview.toggleExpand());

    // Mapa
    document.getElementById('centerBtn').addEventListener('click', () => Mapa.centerOnMe());
    document.getElementById('fitAllBtn').addEventListener('click', () => Mapa.fitAll());
    document.getElementById('filterForm').addEventListener('change', () => this.refreshMap());
    document.getElementById('filterCat').addEventListener('change', () => this.refreshMap());

    // Registros
    document.getElementById('searchRecords').addEventListener('input', () => this.renderRecords());

    // Export
    document.getElementById('exportCsvBtn').addEventListener('click', () => Exporter.toCSV());
    document.getElementById('exportKmlBtn').addEventListener('click', () => Exporter.toKML());
    document.getElementById('exportGeoJsonBtn').addEventListener('click', () => Exporter.toGeoJSON());
    document.getElementById('exportShpBtn').addEventListener('click', () => Exporter.toShapefile());

    // Settings
    document.getElementById('requestPersistBtn').addEventListener('click', () => this.maybeRequestPersist(true));
    document.getElementById('wipeBtn').addEventListener('click', async () => {
      const ok = await UI.confirmDialog('Apagar TODOS formulários e registros locais? Esta ação é irreversível.', { title: 'Apagar tudo' });
      if (!ok) return;
      await DB.wipeAll();
      Basemap.revokeAll();
      State.currentForm = null;
      State.draftFields = [];
      document.getElementById('formName').value = '';
      document.getElementById('formDesc').value = '';
      FormBuilder.renderList();
      this.refreshTopbar();
      this.populateFormSelectors();
      this.renderImageryList();
      UI.toast('Dados apagados.', 'ok');
    });

    // Imagem de satélite offline (basemap local)
    document.getElementById('saveImageryBtn').addEventListener('click', () => this.saveImagery());
    document.getElementById('imgFile').addEventListener('change', () => this.maybeAutoFillImageryBounds());
    document.getElementById('imgWorldFile').addEventListener('change', () => this.maybeAutoFillImageryBounds());
  },

  bindNav() {
    document.querySelectorAll('.navbtn').forEach(btn => {
      btn.addEventListener('click', () => UI.switchScreen(btn.dataset.screen));
    });
  },

  async seedDemo() {
    try {
      const now = Utils.nowISO();
      const form = {
        formId: 'form_demo_001',
        name: 'Cadastro Territorial de Campo',
        description: 'Formulário demo para coleta offline com GNSS.',
        version: '1.0.0',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        fields: [
          { id: 'nome_local', label: 'Nome do local', type: 'text', required: true, options: [], order: 1 },
          { id: 'categoria',  label: 'Categoria',     type: 'select', required: true, options: ['Escola', 'Comunidade', 'Porto', 'Ponto de apoio'], order: 2 },
          { id: 'observacao', label: 'Observação',    type: 'textarea', required: false, options: [], order: 3 },
          { id: 'conforme',   label: 'Conforme?',     type: 'boolean', required: false, options: [], order: 4 }
        ]
      };
      await DB.putForm(form);
      State.currentForm = form;
      State.draftFields = JSON.parse(JSON.stringify(form.fields));
      document.getElementById('formName').value = form.name;
      document.getElementById('formDesc').value = form.description;

      // registros demo
      const demoRecords = [
        { nome_local: 'Comunidade Santa Luzia', categoria: 'Comunidade', observacao: 'Acesso por rio.', conforme: true,  lat: -3.1019, lon: -60.0250, acc: 6.2, alt: 42.1 },
        { nome_local: 'Escola Ribeirinha Sol Nascente', categoria: 'Escola', observacao: 'Visita em horário escolar.', conforme: false, lat: -3.0832, lon: -60.0411, acc: 12.4, alt: 38.5 },
        { nome_local: 'Porto do Sítio', categoria: 'Porto', observacao: 'Cais de madeira.', conforme: true, lat: -3.1198, lon: -59.9888, acc: 28.0, alt: 35.0 }
      ];
      for (const d of demoRecords) {
        await DB.putRecord({
          recordId: Utils.uid('rec'),
          formId: form.formId,
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          syncStatus: 'local',
          geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
          gnss: { latitude: d.lat, longitude: d.lon, accuracy: d.acc, altitude: d.alt, altitudeAccuracy: null, timestamp: now, crs: 'EPSG:4326', format: 'graus decimais', source: 'gnss' },
          attributes: { nome_local: d.nome_local, categoria: d.categoria, observacao: d.observacao, conforme: d.conforme }
        });
      }
      UI.toast('Formulário e registros de exemplo carregados.', 'ok');
      this.refreshTopbar();
      this.populateFormSelectors();
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.seedDemo' });
    }
  },

  renderFieldsList() {
    FormBuilder.renderList();
  },

  renderCollectFields() {
    PhotoField.reset();
    if (!State.currentForm) {
      document.getElementById('collectFields').innerHTML =
        '<p class="hint">Nenhum formulário configurado. Vá em "Form" para criar.</p>';
      return;
    }
    FieldRenderer.render(State.currentForm.fields, document.getElementById('collectFields'));
  },

  async saveRecord() {
    try {
      const form = State.currentForm;
      if (!form) { UI.toast('Nenhum formulário ativo.', 'err'); return; }

      const values = FieldRenderer.collectValues(form.fields, document.getElementById('collectForm'));
      PhotoField.markPresence(form.fields, values);
      const errors = Validation.validateRecord(form, values, State.currentCoord);
      if (errors.length) {
        UI.toast(errors[0], 'err');
        return;
      }

      const now = Utils.nowISO();
      const coord = State.currentCoord;

      let record;
      if (State.editingRecordId) {
        record = await DB.getRecord(State.editingRecordId);
      }
      if (!record) {
        record = {
          recordId: Utils.uid('rec'),
          formId: form.formId,
          schemaVersion: form.schemaVersion || 1,
          createdAt: now,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          syncStatus: 'local',
          attributes: {}
        };
      }

      record.updatedAt = now;
      record.attributes = values;
      await PhotoField.applyToRecord(form.fields, record);
      record.gnss = {
        latitude: coord.lat,
        longitude: coord.lon,
        accuracy: coord.acc ?? null,
        altitude: coord.alt ?? null,
        altitudeAccuracy: coord.altAcc ?? null,
        timestamp: coord.ts,
        crs: 'EPSG:4326',
        format: 'graus decimais',
        source: coord.source || 'gnss'
      };
      // Metadados de captura fina (média), quando aplicável
      if (coord.source === 'gnss-avg') {
        record.gnss.samples = coord.samples || null;
        record.gnss.stdMeters = coord.stdMeters ?? null;
        record.gnss.meanRawAccuracy = coord.meanRawAcc ?? null;
      }
      if (coord.manualOverride) record.gnss.manualOverride = coord.manualOverride;
      if (coord.original) record.gnss.original = coord.original;
      record.geometry = { type: 'Point', coordinates: [coord.lon, coord.lat] };

      await DB.putRecord(record);
      UI.toast(State.editingRecordId ? 'Registro atualizado.' : 'Registro salvo localmente.', 'ok');
      State.editingRecordId = null;
      document.getElementById('collectForm').reset();
      State.currentCoord = null;
      GNSS.setDisplay(null);
      this.renderCollectFields();
      this.refreshTopbar();
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.saveRecord' });
      UI.toast('Erro ao salvar registro.', 'err');
    }
  },

  async startEdit(recordId) {
    try {
      const r = await DB.getRecord(recordId);
      if (!r) { UI.toast('Registro não encontrado.', 'err'); return; }
      const form = await DB.getForm(r.formId);
      if (form) State.currentForm = form;
      State.editingRecordId = recordId;

      // Carrega coordenada atual no estado
      State.currentCoord = {
        lat: r.gnss.latitude,
        lon: r.gnss.longitude,
        acc: r.gnss.accuracy,
        alt: r.gnss.altitude,
        altAcc: r.gnss.altitudeAccuracy,
        ts: r.gnss.timestamp,
        source: r.gnss.source,
        manualOverride: r.gnss.manualOverride,
        original: r.gnss.original
      };
      GNSS.setDisplay(State.currentCoord);

      UI.switchScreen('collect');
      FieldRenderer.render(State.currentForm.fields, document.getElementById('collectFields'), r.attributes);
      await PhotoField.loadFromRecord(State.currentForm.fields, r.attributes);
      UI.toast('Editando registro.', 'ok');
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.startEdit' });
      UI.toast('Erro ao editar.', 'err');
    }
  },

  async deleteRecord(recordId) {
    const ok = await UI.confirmDialog('Excluir este registro?');
    if (!ok) return;
    try {
      await DB.deleteRecord(recordId);
      await DB.deleteAttachmentsByRecord(recordId);
      UI.toast('Registro excluído.', 'ok');
      this.renderRecords();
      this.refreshTopbar();
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.deleteRecord' });
      UI.toast('Erro ao excluir.', 'err');
    }
  },

  async renderRecords() {
    try {
      const tbody = document.getElementById('recordsBody');
      const search = (document.getElementById('searchRecords').value || '').toLowerCase();
      const records = await DB.getAllRecords();
      const forms = await DB.getAllForms();
      const formMap = new Map(forms.map(f => [f.formId, f]));

      const rows = records
        .filter(r => {
          if (!search) return true;
          const blob = JSON.stringify(r.attributes || {}).toLowerCase();
          return blob.includes(search);
        })
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="hint">Nenhum registro.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(r => {
        const form = formMap.get(r.formId);
        const firstField = form?.fields?.[0];
        const local = (firstField && r.attributes?.[firstField.id]) || '--';
        const la = r.geometry?.coordinates?.[1];
        const lo = r.geometry?.coordinates?.[0];
        const acc = r.gnss?.accuracy;
        return `<tr>
          <td>${Utils.escapeHtml(Utils.fmtDateTime(r.createdAt))}</td>
          <td>${Utils.escapeHtml(form?.name || '--')}</td>
          <td>${Utils.escapeHtml(local)}</td>
          <td>${la !== undefined ? la.toFixed(5) : '--'}</td>
          <td>${lo !== undefined ? lo.toFixed(5) : '--'}</td>
          <td>${acc !== null && acc !== undefined ? acc.toFixed(0) + 'm' : '--'}</td>
          <td>
            <button class="icon-btn" data-pdf="${r.recordId}" aria-label="Gerar relatório em PDF"><svg class="icon"><use href="#icon-file-csv"/></svg></button>
            <button class="icon-btn" data-edit="${r.recordId}" aria-label="Editar"><svg class="icon"><use href="#icon-edit-pencil"/></svg></button>
            <button class="icon-btn danger" data-del="${r.recordId}" aria-label="Excluir"><svg class="icon"><use href="#icon-trash"/></svg></button>
          </td>
        </tr>`;
      }).join('');

      tbody.querySelectorAll('[data-pdf]').forEach(b =>
        b.addEventListener('click', async () => {
          const r = rows.find(x => x.recordId === b.dataset.pdf);
          const form = formMap.get(r?.formId);
          if (!r || !form) { UI.toast('Formulário do registro não encontrado.', 'err'); return; }
          await Report.generate(r, form);
        }));
      tbody.querySelectorAll('[data-edit]').forEach(b =>
        b.addEventListener('click', () => this.startEdit(b.dataset.edit)));
      tbody.querySelectorAll('[data-del]').forEach(b =>
        b.addEventListener('click', () => this.deleteRecord(b.dataset.del)));
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.renderRecords' });
    }
  },

  refreshMap() { Mapa.refresh(); },

  /** Tenta preencher N/S/L/O automaticamente a partir de imagem + world file (se ambos selecionados). */
  async maybeAutoFillImageryBounds() {
    try {
      const imgFile = document.getElementById('imgFile').files[0];
      const wldFile = document.getElementById('imgWorldFile').files[0];
      if (!imgFile || !wldFile) return;
      const [text, dims] = await Promise.all([wldFile.text(), Utils.imageDimensions(imgFile)]);
      const bounds = Utils.parseWorldFile(text, dims.width, dims.height);
      if (!bounds) { UI.toast('Arquivo de referência inválido.', 'warn'); return; }
      document.getElementById('imgNorth').value = bounds.north.toFixed(7);
      document.getElementById('imgSouth').value = bounds.south.toFixed(7);
      document.getElementById('imgEast').value = bounds.east.toFixed(7);
      document.getElementById('imgWest').value = bounds.west.toFixed(7);
      UI.toast('Caixa delimitadora preenchida a partir do arquivo de referência.', 'ok');
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.maybeAutoFillImageryBounds' });
      UI.toast('Não foi possível ler o arquivo de referência.', 'err');
    }
  },

  async saveImagery() {
    try {
      const name = document.getElementById('imgName').value.trim();
      const fileInput = document.getElementById('imgFile');
      const file = fileInput.files[0];
      if (!name) { UI.toast('Informe um nome para a imagem.', 'err'); return; }
      if (!file) { UI.toast('Selecione um arquivo de imagem.', 'err'); return; }

      const bounds = {
        north: parseFloat(document.getElementById('imgNorth').value),
        south: parseFloat(document.getElementById('imgSouth').value),
        east: parseFloat(document.getElementById('imgEast').value),
        west: parseFloat(document.getElementById('imgWest').value)
      };
      const cornersValid = Utils.isValidCoord(bounds.north, bounds.east) && Utils.isValidCoord(bounds.south, bounds.west);
      if (!cornersValid || bounds.north <= bounds.south || bounds.east <= bounds.west) {
        UI.toast('Caixa delimitadora inválida. Confira Norte/Sul/Leste/Oeste.', 'err');
        return;
      }

      await DB.putImagery({
        id: Utils.uid('img'),
        name,
        createdAt: Utils.nowISO(),
        blob: file,
        bounds
      });

      document.getElementById('imgName').value = '';
      fileInput.value = '';
      document.getElementById('imgWorldFile').value = '';
      ['imgNorth', 'imgSouth', 'imgEast', 'imgWest'].forEach(id => { document.getElementById(id).value = ''; });

      UI.toast('Imagem salva. Escolha-a no seletor de camadas da tela Mapa.', 'ok');
      this.renderImageryList();
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.saveImagery' });
      UI.toast('Erro ao salvar imagem.', 'err');
    }
  },

  async renderImageryList() {
    try {
      const container = document.getElementById('imageryList');
      if (!container) return;
      const imagery = await DB.getAllImagery();
      if (imagery.length === 0) {
        container.innerHTML = '<p class="hint">Nenhuma imagem local carregada ainda.</p>';
        return;
      }
      container.innerHTML = imagery.map(img => `
        <div class="field-item">
          <div class="meta">
            <strong>${Utils.escapeHtml(img.name)}</strong>
            <small>N ${img.bounds.north.toFixed(4)} · S ${img.bounds.south.toFixed(4)} · L ${img.bounds.east.toFixed(4)} · O ${img.bounds.west.toFixed(4)}</small>
          </div>
          <div class="actions">
            <button class="icon-btn danger" data-del-imagery="${img.id}" aria-label="Excluir imagem"><svg class="icon"><use href="#icon-trash"/></svg></button>
          </div>
        </div>`).join('');

      container.querySelectorAll('[data-del-imagery]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ok = await UI.confirmDialog('Excluir esta imagem local? Ela deixará de aparecer como opção de basemap.', { title: 'Excluir imagem' });
          if (!ok) return;
          const id = btn.dataset.delImagery;
          await DB.deleteImagery(id);
          Basemap.revokeImagery(id);
          UI.toast('Imagem excluída.', 'ok');
          this.renderImageryList();
        });
      });
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.renderImageryList' });
    }
  },

  async populateFormSelectors() {
    try {
      const forms = await DB.getAllForms();
      const opts = '<option value="">Todos</option>' +
        forms.map(f => `<option value="${f.formId}">${Utils.escapeHtml(f.name)}</option>`).join('');
      ['filterForm', 'exportForm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
      });

      // Formulário ativo (edição na tela Form / uso na tela Coleta) — cada
      // formulário criado passa a aparecer aqui como opção selecionável.
      const activeId = State.currentForm ? State.currentForm.formId : '';
      const formOpts = forms.map(f => `<option value="${f.formId}">${Utils.escapeHtml(f.name)}</option>`).join('');
      const formSelectEl = document.getElementById('formSelect');
      if (formSelectEl) {
        formSelectEl.innerHTML = '<option value="">+ Novo formulário</option>' + formOpts;
        formSelectEl.value = activeId;
      }
      const collectSelectEl = document.getElementById('collectFormSelect');
      if (collectSelectEl) {
        collectSelectEl.innerHTML = forms.length ? formOpts : '<option value="">Nenhum formulário salvo</option>';
        collectSelectEl.value = activeId;
      }

      // categoria: primeiros campos select de todos forms
      const catSet = new Set();
      forms.forEach(f => (f.fields || []).forEach(fld => {
        if (fld.type === 'select') (fld.options || []).forEach(o => catSet.add(o));
      }));
      const catEl = document.getElementById('filterCat');
      if (catEl) catEl.innerHTML = '<option value="">Todas</option>' +
        [...catSet].map(c => `<option value="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</option>`).join('');
    } catch (e) {
      console.error({ msg: e.message, stack: e.stack, context: 'App.populateFormSelectors' });
    }
  },

  renderExportOptions() {
    // só re-popula, se necessário
  },

  async refreshTopbar() {
    try {
      const records = await DB.getAllRecords();
      document.getElementById('recordsCount').textContent = `${records.length} registro(s)`;
    } catch {}
  },

  showConnStatus() {
    const el = document.getElementById('connStatus');
    if (navigator.onLine) {
      el.textContent = '● Online';
      el.className = 'badge badge-ok';
    } else {
      el.textContent = '○ Offline';
      el.className = 'badge badge-warn';
    }
  },

  showProtocolInfo() {
    const el = document.getElementById('protocolInfo');
    const isHttps = location.protocol === 'https:';
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
    if (isHttps) {
      el.textContent = `${location.protocol} — GNSS funcionará.`;
    } else if (isLocal) {
      el.textContent = `${location.protocol}//${location.hostname} — ambiente local, GNSS deve funcionar.`;
    } else {
      el.textContent = `${location.protocol} — ATENÇÃO: GNSS é bloqueado em HTTP. Use HTTPS.`;
      UI.toast('GNSS exige HTTPS. Instale como PWA ou use HTTPS.', 'warn');
    }
  },

  async maybeRequestPersist(force = false) {
    if (!navigator.storage || !navigator.storage.persist) return;
    try {
      const already = await navigator.storage.persisted();
      if (already) {
        this.updateStorageInfo();
        return;
      }
      if (force) {
        const ok = await navigator.storage.persist();
        UI.toast(ok ? 'Armazenamento persistente ativado.' : 'Navegador negou persistência.', ok ? 'ok' : 'warn');
      }
      this.updateStorageInfo();
    } catch (e) {
      console.warn('persist error', e);
    }
  },

  async updateStorageInfo() {
    const el = document.getElementById('storageInfo');
    if (!el) return;
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const usedMB = (est.usage / 1048576).toFixed(1);
        const quotaMB = (est.quota / 1048576).toFixed(0);
        const pct = est.quota ? ((est.usage / est.quota) * 100).toFixed(0) : 0;
        el.textContent = `${usedMB} MB usados de ${quotaMB} MB (${pct}%)`;
        if (Number(pct) > 80) UI.toast('Armazenamento próximo do limite. Exporte e limpe registros antigos.', 'warn');
      } catch {
        el.textContent = 'Indisponível neste navegador.';
      }
    } else {
      el.textContent = 'Indisponível neste navegador.';
    }
  },

  populateGnssSettings() {
    const c = GNSS.getConfig();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('setSamples', c.minSamples);
    set('setMaxAcc', c.maxAcc);
    set('setTargetAcc', c.targetAcc);
    set('setDuration', Math.round(c.maxDurationMs / 1000));
  }
};

// ------------------------------------------------------------
// Bootstrap
// ------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  App.init();

  // Registra Service Worker com detecção de atualização automática
  if ('serviceWorker' in navigator) {
    let refreshing = false;

    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Detecta novo SW instalado em segundo plano
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Há um SW novo pronto — mostra banner
            UpdateBanner.show();
          }
        });
      });
      // Verifica updates a cada 30 min (mesmo com aba aberta)
      setInterval(() => reg.update().catch(()=>{}), 30 * 60 * 1000);
    }).catch(err => console.error('SW registration failed', err));

    // Quando o SW avisar que terminou a ativação, recarrega uma vez
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
});

// ------------------------------------------------------------
// Banner de "Atualização disponível"
// ------------------------------------------------------------
const UpdateBanner = {
  _el: null,
  _waitingReg: null,

  show() {
    if (this._el) return; // já visível
    const el = document.createElement('div');
    el.className = 'update-banner';
    el.setAttribute('role', 'alert');
    el.innerHTML = '<span><svg class="icon"><use href="#icon-refresh-cw"/></svg> Nova versão disponível.</span>';
    const btn = document.createElement('button');
    btn.textContent = 'Atualizar';
    btn.addEventListener('click', () => {
      // força o SW esperante a assumir; controllerchange recarrega
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
    });
    el.appendChild(btn);
    document.body.appendChild(el);
    this._el = el;
  },

  hide() {
    if (this._el) { this._el.remove(); this._el = null; }
  }
};
