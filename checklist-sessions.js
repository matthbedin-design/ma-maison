// ---- Interventions à prévoir : notées depuis une checklist (ou manuellement),
// en attente de planification (pièce à commander, devis à demander...) avant
// d'être converties en une vraie intervention historisée. ----
function getPlannedInterventions(propertyId){
  return state.plannedInterventions[propertyId] || [];
}

async function addPlannedIntervention(propertyId, label, notes, sourceSessionId, sourceItemId){
  if(!state.plannedInterventions[propertyId]) state.plannedInterventions[propertyId] = [];
  var item = {
    id: genId('planned'),
    label: label,
    notes: notes || '',
    createdAt: new Date().toISOString(),
    sourceSessionId: sourceSessionId || null,
    sourceItemId: sourceItemId || null
  };
  state.plannedInterventions[propertyId].push(item);
  logEvent(propertyId, 'Intervention à prévoir ajoutée : ' + label);
  await warnIfSaveFailed(await persist());
  return item.id;
}

async function removePlannedIntervention(propertyId, id){
  var list = state.plannedInterventions[propertyId] || [];
  var item = list.filter(function(p){ return p.id === id; })[0];
  state.plannedInterventions[propertyId] = list.filter(function(p){ return p.id !== id; });
  if(item) logEvent(propertyId, 'Intervention à prévoir retirée : ' + item.label);
  await warnIfSaveFailed(await persist());
}

// Ouvre le formulaire d'intervention habituel, pré-rempli avec le libellé/la remarque
// de l'intervention à prévoir. La suppression de l'entrée "à prévoir" n'a lieu qu'au
// moment de l'enregistrement effectif (voir saveEntry), pas à l'ouverture — pour ne
// rien perdre si l'utilisateur annule.
function startConvertPlannedIntervention(propertyId, id){
  var item = getPlannedInterventions(propertyId).filter(function(p){ return p.id === id; })[0];
  if(!item) return;
  closeModal();
  activePropertyId = propertyId;
  convertingPlannedIntervention = { propertyId: propertyId, id: id };
  openEntryModal(null);
  var notesField = document.getElementById('f-notes');
  if(notesField) notesField.value = item.label + (item.notes ? ' — ' + item.notes : '');
}

function openAddPlannedInterventionModal(propertyId){
  var modal = document.getElementById('modal');
  modal.innerHTML =
    '<h3>Intervention à prévoir <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>' +
    '<div class="field-hint" style="margin-bottom:10px;">Pour noter un besoin identifié (ex : devis toiture, pièce à commander) sans créer tout de suite une intervention complète.</div>' +
    '<div class="field"><label>Intitulé</label><input type="text" id="plannedLabel" placeholder="Ex : Changer plaquettes avant"></div>' +
    '<div class="field"><label>Notes (optionnel)</label><textarea id="plannedNotes"></textarea></div>' +
    '<div class="modal-actions" style="margin-top:16px;">' +
      '<button class="btn btn-ghost" id="cancelBtn" style="flex:1;">Annuler</button>' +
      '<button class="btn btn-primary" id="savePlannedBtn" style="flex:1;">Ajouter</button>' +
    '</div>';

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('cancelBtn').onclick = closeModal;
  var labelInput = document.getElementById('plannedLabel');
  labelInput.focus();

  document.getElementById('savePlannedBtn').onclick = async function(){
    var label = labelInput.value.trim();
    if(!label){ await showAlert('Merci de renseigner un intitulé.'); return; }
    var notes = document.getElementById('plannedNotes').value.trim();
    await addPlannedIntervention(propertyId, label, notes, null, null);
    closeModal();
    renderContent();
  };
}

// ---- Modale : gestion de la checklist de vérifications d'usage (globale) ----
function openChecklistManagerModal(returnToPropertyId){
  var modal = document.getElementById('modal');

  var themesSet = {};
  state.checklistItems.forEach(function(c){ if(c.theme) themesSet[c.theme] = true; });
  var themeOptionsHtml = Object.keys(themesSet).sort(function(a,b){ return a.localeCompare(b, 'fr'); })
    .map(function(t){ return '<option value="' + escapeHtml(t) + '">'; }).join('');

  var rows = state.checklistItems.map(function(c){
    return '<div class="checklist-row" data-checklist-id="' + c.id + '">' +
      '<input type="text" class="checklist-item-theme" list="checklistThemesList" value="' + escapeHtml(c.theme || '') + '" placeholder="Thème (ex : Freinage)">' +
      '<input type="text" class="checklist-item-label" value="' + escapeHtml(c.label) + '" placeholder="Point de vérification">' +
      '<button type="button" class="trash-btn checklist-item-remove" title="Retirer" aria-label="Retirer ce point de vérification">' + trashSvg() + '</button>' +
      '</div>';
  }).join('');

  modal.innerHTML =
    '<h3>Checklist de vérifications d\'usage <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>' +
    '<div class="field-hint" style="margin-bottom:10px;">Cette liste est partagée par tous les biens et réutilisée à chaque fiche d\'entretien. Groupe les points par thème pour une lecture plus claire (ex : Extérieur, Chauffage, Sécurité).</div>' +
    '<datalist id="checklistThemesList">' + themeOptionsHtml + '</datalist>' +
    '<div id="checklistItemsList">' + rows + '</div>' +
    '<button type="button" class="export-btn" id="addChecklistItemBtn" style="margin-top:10px;">+ Ajouter un point de vérification</button>' +
    '<div class="modal-actions" style="margin-top:16px;">' +
      '<button class="btn btn-primary" id="cancelBtn">Fermer</button>' +
    '</div>';

  document.getElementById('modalOverlay').classList.add('open');
  var closeAndReturn = function(){
    closeModal();
    if(returnToPropertyId) openMaintenanceSheetModal(returnToPropertyId);
  };
  document.getElementById('closeModalBtn').onclick = closeAndReturn;
  document.getElementById('cancelBtn').onclick = closeAndReturn;

  function bindRow(row){
    var removeBtn = row.querySelector('.checklist-item-remove');
    if(removeBtn) removeBtn.onclick = async function(){
      var id = row.getAttribute('data-checklist-id');
      state.checklistItems = state.checklistItems.filter(function(c){ return c.id !== id; });
      await warnIfSaveFailed(await persist());
      row.remove();
    };
    var labelInput = row.querySelector('.checklist-item-label');
    if(labelInput) labelInput.onchange = async function(){
      var id = row.getAttribute('data-checklist-id');
      var item = state.checklistItems.filter(function(c){ return c.id === id; })[0];
      if(!item) return;
      var newLabel = labelInput.value.trim();
      if(!newLabel){ labelInput.value = item.label; return; }
      item.label = newLabel;
      await warnIfSaveFailed(await persist());
    };
    var themeInput = row.querySelector('.checklist-item-theme');
    if(themeInput) themeInput.onchange = async function(){
      var id = row.getAttribute('data-checklist-id');
      var item = state.checklistItems.filter(function(c){ return c.id === id; })[0];
      if(!item) return;
      item.theme = themeInput.value.trim() || null;
      await warnIfSaveFailed(await persist());
    };
  }
  Array.prototype.forEach.call(modal.querySelectorAll('.checklist-row'), bindRow);

  document.getElementById('addChecklistItemBtn').onclick = async function(){
    var id = genId('chk');
    state.checklistItems.push({ id: id, label: '', theme: null });
    await warnIfSaveFailed(await persist());
    var list = document.getElementById('checklistItemsList');
    var row = document.createElement('div');
    row.className = 'checklist-row';
    row.setAttribute('data-checklist-id', id);
    row.innerHTML = '<input type="text" class="checklist-item-theme" list="checklistThemesList" value="" placeholder="Thème (ex : Freinage)">' +
      '<input type="text" class="checklist-item-label" value="" placeholder="Point de vérification">' +
      '<button type="button" class="trash-btn checklist-item-remove" title="Retirer" aria-label="Retirer ce point de vérification">' + trashSvg() + '</button>';
    list.appendChild(row);
    bindRow(row);
    row.querySelector('.checklist-item-label').focus();
  };
}

function generateMaintenanceSheet(propertyId, selectedTypeIds, selectedChecklistIds){
  var v = state.properties[propertyId];
  if(!v) return;
  var entries = state.entries[propertyId] || [];
  var now = new Date();
  var nowStr = now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
  var titre = v.name + (v.address ? ' — ' + v.address : '');

  var html = '<div id="dossier-top"></div>';
  html += '<div class="dossier-cover">';
  html += '<h1>Fiche d\'entretien — ' + escapeHtml(titre) + '</h1>';
  html += '<div class="dossier-sub">Préparée le ' + nowStr + '' + '</div>';
  html += '<a href="#dossier-bottom" class="jump-link dossier-jump">↓ Aller en bas (imprimer)</a>';
  html += '</div>';

  if(selectedTypeIds.length){
    html += '<div class="dossier-section-title">Interventions à réaliser</div>';
    selectedTypeIds.forEach(function(typeId){
      var st = computeStatus(propertyId, typeId);
      if(!st) return;
      var last = getLatestEntryFromList(entries, typeId);
      var refNote = (v.intervals && v.intervals[typeId] && v.intervals[typeId].notes) || '';

      html += '<div class="msheet-item">';
      html += '<div class="msheet-item-title">🔧 ' + escapeHtml(st.cfg.label) + '</div>';

      var deadlineParts = [];
      var hasThresholdMs = !!st.cfg.months;
      if(hasThresholdMs && st.last){
        if(st.cfg.months && st.last.date){
          var dateThresholdMs = new Date(st.last.date);
          dateThresholdMs.setMonth(dateThresholdMs.getMonth() + st.cfg.months);
          deadlineParts.push('le ' + dateThresholdMs.toLocaleDateString('fr-FR'));
        }
      }
      var deadlineLabel = st.isOverdue ? 'Échéance dépassée : ' : 'À ne pas dépasser : ';
      if(deadlineParts.length) html += '<div class="msheet-item-line">📅 ' + escapeHtml(deadlineLabel + deadlineParts.join(' ou ')) + '</div>';

      if(refNote) html += '<div class="msheet-item-line">🧰 Référence : ' + escapeHtml(refNote) + '</div>';

      if(last){
        var lastLine = 'Dernière fois le ' + fmtDate(last.date) + (last.provider ? ' — ' + last.provider : '');
        html += '<div class="msheet-item-line">🕓 ' + escapeHtml(lastLine) + '</div>';
        if(last.notes) html += '<div class="msheet-item-line msheet-item-quote">« ' + escapeHtml(last.notes) + ' »</div>';
      } else {
        html += '<div class="msheet-item-line">🕓 Aucune intervention de ce type enregistrée jusqu\'ici</div>';
      }

      html += '</div>';
    });
  }

  if(selectedChecklistIds.length){
    html += '<div class="dossier-section-title">Vérifications d\'usage</div>';
    var selectedChecklistObjs = selectedChecklistIds.map(function(id){ return state.checklistItems.filter(function(c){ return c.id === id; })[0]; }).filter(Boolean);
    groupByTheme(selectedChecklistObjs).forEach(function(grp){
      html += '<div class="checklist-theme-title" style="margin-top:10px;">' + escapeHtml(grp.theme) + '</div>';
      html += '<div class="msheet-checklist-print">';
      grp.items.forEach(function(item){
        html += '<div class="msheet-checkbox-row"><span class="msheet-checkbox">☐</span>' + escapeHtml(item.label) + '</div>';
      });
      html += '</div>';
    });
  }

  var area = document.getElementById('dossierPrintArea');
  area.innerHTML = html;
  document.body.classList.add('dossier-mode');
  window.scrollTo(0, 0);

  var actionsHtml = '<div id="dossier-bottom">' +
    '<div style="text-align:center; margin-bottom:10px;"><a href="#dossier-top" class="jump-link dossier-jump">↑ Remonter en haut</a></div>' +
    '<div class="dossier-actions">' +
      '<button class="btn btn-primary" id="dossierPrintNowBtn" style="width:auto; display:inline-block;">🖨 Imprimer / Enregistrer en PDF</button>' +
      '<button class="btn btn-ghost" id="dossierBackBtn" style="width:auto; display:inline-block;">← Retour à l\'app</button>' +
    '</div>' +
  '</div>';
  area.insertAdjacentHTML('beforeend', actionsHtml);
  document.getElementById('dossierPrintNowBtn').onclick = function(){ window.print(); };
  document.getElementById('dossierBackBtn').onclick = function(){
    document.body.classList.remove('dossier-mode');
    area.innerHTML = '';
  };
}

function getLatestEntryFromList(entries, typeId){
  var filtered = entries.filter(function(e){ return e.typeId === typeId; });
  if(!filtered.length) return null;
  filtered.sort(function(a, b){
    if(a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
  });
  return filtered[0];
}

// ---- Modale : liste des fiches d'entretien (sessions) d'un bien ----
function openSessionsListModal(propertyId){
  var v = state.properties[propertyId];
  if(!v) return;
  var modal = document.getElementById('modal');
  var sessions = (state.sessions[propertyId] || []).slice().sort(function(a, b){ return a.date < b.date ? 1 : -1; });
  var planned = sessions.filter(function(s){ return s.status === 'planned'; });
  var completed = sessions.filter(function(s){ return s.status === 'completed'; });

  function sessionRow(s){
    var typeLabels = s.plannedTypeIds.map(function(id){
      var t = state.types.filter(function(x){ return x.id === id; })[0];
      return t ? t.label : id;
    }).join(', ');
    return '<div class="history-row" data-session-id="' + s.id + '" style="cursor:pointer;">' +
      '<div class="history-main">' +
      '<div class="history-type">📋 ' + fmtDate(s.date) + '</div>' +
      (typeLabels ? '<div class="history-notes">' + escapeHtml(typeLabels) + '</div>' : '') +
      '<div class="history-notes">' + s.entryIds.length + ' / ' + s.plannedTypeIds.length + ' intervention(s) réalisée(s)' + (s.checklistItemIds.length ? ' · ' + s.checklistItemIds.length + ' vérification(s)' : '') + '</div>' +
      '</div></div>';
  }

  var html = '<h3>Fiches d\'entretien <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>';
  if(planned.length){
    html += '<div class="field-hint" style="margin-bottom:8px;">En cours</div>' + planned.map(sessionRow).join('');
  }
  if(completed.length){
    html += '<div class="field-hint" style="margin:14px 0 8px;">Terminées</div>' + completed.map(sessionRow).join('');
  }
  if(!sessions.length){
    html += '<div class="empty-state">Aucune fiche d\'entretien pour ce bien.</div>';
  }
  html += '<div class="modal-actions" style="margin-top:16px;"><button class="btn btn-primary" id="cancelBtn">Fermer</button></div>';

  modal.innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('cancelBtn').onclick = closeModal;

  Array.prototype.forEach.call(modal.querySelectorAll('[data-session-id]'), function(row){
    row.onclick = function(){ openSessionDetailModal(propertyId, row.getAttribute('data-session-id')); };
  });
}

// ---- Modale : détail d'une fiche d'entretien — checklist interactive et
// interventions à marquer réalisées (créent une vraie ligne d'historique) ----
function openSessionDetailModal(propertyId, sessionId){
  var v = state.properties[propertyId];
  var sessions = state.sessions[propertyId] || [];
  var session = sessions.filter(function(s){ return s.id === sessionId; })[0];
  if(!v || !session) return;
  var modal = document.getElementById('modal');
  var entries = state.entries[propertyId] || [];
  var readOnly = session.status === 'completed';

  var checklistObjs = session.checklistItemIds.map(function(id){ return state.checklistItems.filter(function(c){ return c.id === id; })[0]; }).filter(Boolean);
  var revoirCount = 0;
  var groupedChecklist = groupByTheme(checklistObjs).map(function(grp){
    // Trie chaque catégorie pour faire remonter en tête les points "à revoir",
    // puis les points pas encore vérifiés, puis les "OK" en dernier.
    var sortedItems = grp.items.slice().sort(function(a, b){
      var ra = session.checklistResults.filter(function(r){ return r.itemId === a.id; })[0];
      var rb = session.checklistResults.filter(function(r){ return r.itemId === b.id; })[0];
      // 'none' : aucun résultat enregistré pour ce point (ni "revoir" ni "ok").
      var rank = { revoir: 0, none: 1, ok: 2 };
      var rankA = rank[(ra && ra.status) || 'none'];
      var rankB = rank[(rb && rb.status) || 'none'];
      return rankA - rankB;
    });
    return { theme: grp.theme, items: sortedItems };
  });

  var checklistHtml = groupedChecklist.map(function(grp){
    var itemsHtml = grp.items.map(function(item){
      var res = session.checklistResults.filter(function(r){ return r.itemId === item.id; })[0] || { status: null, anomaly: null, plannedInterventionId: null };
      var status = res.status || null;
      if(status === 'revoir') revoirCount++;
      var alreadyPlanned = !!(res.plannedInterventionId && getPlannedInterventions(propertyId).some(function(p){ return p.id === res.plannedInterventionId; }));
      var addToPlannedBtn = '';
      if(!readOnly && status === 'revoir'){
        addToPlannedBtn = alreadyPlanned
          ? '<div class="field-hint" style="color:var(--green); margin-top:6px;">✓ Ajoutée aux interventions à prévoir</div>'
          : '<button type="button" class="link-btn session-add-to-planned" data-item-id="' + item.id + '" style="margin-top:6px; display:inline-block;">+ Ajouter aux interventions à prévoir</button>';
      }
      return '<div class="session-check-row" data-item-id="' + item.id + '">' +
        '<div class="session-check-top">' +
          '<span class="session-check-label">' + escapeHtml(item.label) + '</span>' +
          '<div class="chk-status-toggle">' +
            '<label class="chk-status-pill chk-status-ok"><input type="radio" name="chk-status-' + item.id + '" class="session-status-radio" value="ok"' + (status === 'ok' ? ' checked' : '') + (readOnly ? ' disabled' : '') + '>OK</label>' +
            '<label class="chk-status-pill chk-status-revoir"><input type="radio" name="chk-status-' + item.id + '" class="session-status-radio" value="revoir"' + (status === 'revoir' ? ' checked' : '') + (readOnly ? ' disabled' : '') + '>À revoir</label>' +
          '</div>' +
        '</div>' +
        '<input type="text" class="session-anomaly-input" placeholder="Remarque (optionnel)" value="' + escapeHtml(res.anomaly || '') + '"' + (readOnly ? ' disabled' : '') + '>' +
        addToPlannedBtn +
        '</div>';
    }).join('');
    return '<div class="checklist-theme-block"><div class="checklist-theme-title">' + escapeHtml(grp.theme) + '</div>' + itemsHtml + '</div>';
  }).join('');

  var typesHtml = session.plannedTypeIds.map(function(typeId){
    var t = state.types.filter(function(x){ return x.id === typeId; })[0];
    var label = t ? t.label : typeId;
    var doneEntry = entries.filter(function(e){ return e.sessionId === session.id && e.typeId === typeId; })[0];
    if(doneEntry){
      return '<div class="msheet-item" style="border-left-color:var(--green);">' +
        '<div class="msheet-item-title">✅ ' + escapeHtml(label) + ' — réalisée</div>' +
        '<div class="msheet-item-line">Le ' + fmtDate(doneEntry.date) + (doneEntry.cost != null ? ' · ' + fmtEuro(doneEntry.cost) : '') + '</div>' +
        '</div>';
    }
    if(readOnly){
      return '<div class="msheet-item"><div class="msheet-item-title">⏳ ' + escapeHtml(label) + ' — non réalisée</div></div>';
    }
    return '<div class="msheet-item">' +
      '<div class="msheet-item-title">🔧 ' + escapeHtml(label) + '</div>' +
      '<button type="button" class="export-btn session-mark-done-btn" data-type="' + typeId + '">✅ Marquer réalisée</button>' +
      '<div class="session-done-form" id="doneForm-' + typeId + '" style="display:none; margin-top:10px;">' +
        '<div class="row2">' +
          '<div class="field"><label>Date</label><input type="date" class="session-done-date" value="' + todayLocalISO() + '"></div>' +
          '<div class="field"><label>Coût (€)</label><input type="number" step="0.01" min="0" class="session-done-cost"></div>' +
        '</div>' +
        '<div class="row2">' +
          '<div class="field"><label>Prestataire / Artisan</label><input type="text" class="session-done-provider"></div>' +
        '</div>' +
        '<div class="field"><label>Notes</label><textarea class="session-done-notes"></textarea></div>' +
        '<button type="button" class="btn btn-primary session-save-done-btn" data-type="' + typeId + '" style="width:auto; display:inline-block;">Enregistrer cette intervention</button>' +
      '</div>' +
    '</div>';
  }).join('');

  modal.innerHTML =
    '<h3>Fiche du ' + fmtDate(session.date) + (readOnly ? ' (terminée)' : '') + ' <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>' +
    (session.plannedTypeIds.length ? '<div class="dossier-section-title" style="margin-top:0;">Interventions</div>' + typesHtml : '') +
    (checklistObjs.length ? '<div class="dossier-section-title">Vérifications d\'usage</div>' +
      (revoirCount ? '<div class="chk-revoir-summary">⚠️ ' + revoirCount + ' point' + (revoirCount > 1 ? 's' : '') + ' à revoir</div>' : '') +
      checklistHtml : '') +
    '<div class="modal-actions" style="margin-top:16px;">' +
      (!readOnly ? '<button class="btn btn-danger" id="deleteSessionBtn">Supprimer la fiche</button>' : '') +
      '<button class="btn btn-ghost" id="cancelBtn">Fermer</button>' +
      (!readOnly ? '<button class="btn btn-primary" id="completeSessionBtn">Terminer la session</button>' : '') +
    '</div>';

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('cancelBtn').onclick = closeModal;

  Array.prototype.forEach.call(modal.querySelectorAll('.session-check-row'), function(row){
    var itemId = row.getAttribute('data-item-id');
    var radios = row.querySelectorAll('.session-status-radio');
    var anomalyInput = row.querySelector('.session-anomaly-input');
    if(readOnly) return;
    function saveResult(){
      var res = session.checklistResults.filter(function(r){ return r.itemId === itemId; })[0];
      if(!res){ res = { itemId: itemId, status: null, anomaly: null, plannedInterventionId: null }; session.checklistResults.push(res); }
      var checkedRadio = row.querySelector('.session-status-radio:checked');
      res.status = checkedRadio ? checkedRadio.value : null;
      res.anomaly = anomalyInput.value.trim() || null;
      persist().then(warnIfSaveFailed);
    }
    Array.prototype.forEach.call(radios, function(radio){ radio.onchange = function(){ saveResult(); openSessionDetailModal(propertyId, sessionId); }; });
    anomalyInput.onchange = saveResult;
  });

  Array.prototype.forEach.call(modal.querySelectorAll('.session-add-to-planned'), function(btn){
    btn.onclick = async function(){
      var itemId = btn.getAttribute('data-item-id');
      var item = state.checklistItems.filter(function(c){ return c.id === itemId; })[0];
      var res = session.checklistResults.filter(function(r){ return r.itemId === itemId; })[0];
      var noteText = res ? (res.anomaly || '') : '';
      var plannedId = await addPlannedIntervention(propertyId, item ? item.label : 'Point à vérifier', noteText, session.id, itemId);
      if(res) res.plannedInterventionId = plannedId;
      await warnIfSaveFailed(await persist());
      openSessionDetailModal(propertyId, sessionId);
    };
  });

  Array.prototype.forEach.call(modal.querySelectorAll('.session-mark-done-btn'), function(btn){
    btn.onclick = function(){
      var typeId = btn.getAttribute('data-type');
      var form = document.getElementById('doneForm-' + typeId);
      if(form) form.style.display = (form.style.display === 'none') ? 'block' : 'none';
    };
  });

  Array.prototype.forEach.call(modal.querySelectorAll('.session-save-done-btn'), function(btn){
    btn.onclick = async function(){
      var typeId = btn.getAttribute('data-type');
      var form = document.getElementById('doneForm-' + typeId);
      var dateEl = form.querySelector('.session-done-date');
      var costInputEl = form.querySelector('.session-done-cost');
      var providerEl = form.querySelector('.session-done-provider');
      var notesEl = form.querySelector('.session-done-notes');

      var date = dateEl.value;
      if(!date){ await showAlert('Merci de renseigner une date.'); return; }
      var cost = costInputEl.value === '' ? null : parseFloat(costInputEl.value);
      if(cost !== null && (isNaN(cost) || cost < 0)){ await showAlert('Le coût doit être un nombre positif.'); return; }

      var now = new Date().toISOString();
      var newEntry = {
        id: genId('e'),
        typeId: typeId,
        date: date,
        notes: notesEl.value.trim(),
        cost: cost,
        provider: providerEl.value.trim() || null,
        sessionId: session.id,
        createdAt: now,
        updatedAt: now
      };
      var list = state.entries[propertyId] || [];
      list.push(newEntry);
      state.entries[propertyId] = list;
      session.entryIds.push(newEntry.id);

      var tObj = state.types.filter(function(t){ return t.id === typeId; })[0];
      logEvent(propertyId, 'Intervention réalisée (fiche du ' + fmtDate(session.date) + ') : ' + (tObj ? tObj.label : typeId));

      await warnIfSaveFailed(await persist());
      openSessionDetailModal(propertyId, session.id);
    };
  });

  var completeBtn = document.getElementById('completeSessionBtn');
  if(completeBtn) completeBtn.onclick = async function(){
    session.status = 'completed';
    var saved = await persist();
    closeModal();
    renderContent();
    await warnIfSaveFailed(saved);
  };

  var deleteSessionBtn = document.getElementById('deleteSessionBtn');
  if(deleteSessionBtn) deleteSessionBtn.onclick = async function(){
    var ok = await showConfirm('Supprimer cette fiche ? Les interventions déjà enregistrées à partir d\'elle resteront dans l\'historique.', 'Supprimer');
    if(!ok) return;
    state.sessions[propertyId] = state.sessions[propertyId].filter(function(s){ return s.id !== session.id; });
    var saved = await persist();
    closeModal();
    renderContent();
    await warnIfSaveFailed(saved);
  };
}

function iconSvg(){
  return '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"></path><path d="M5 10v10h5v-6h4v6h5V10"></path></svg>';
}

function gearSvg(){
  return '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
}

function trashSvg(){
  return '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
}
