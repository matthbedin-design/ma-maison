// ---- Modale : Nouvelle / Édition intervention ----
var pendingInvoiceFile = null;   // File sélectionné mais pas encore uploadé (upload différé à l'enregistrement)
var removeInvoiceRequested = false;

function openEntryModal(entryId){
  editingEntryId = entryId;
  pendingInvoiceFile = null;
  removeInvoiceRequested = false;
  var v = state.properties[activePropertyId];
  if(!v) return;

  var entries = state.entries[activePropertyId] || [];
  var entry = entryId ? entries.filter(function(e){ return e.id === entryId; })[0] : null;

  var enabledTypes = v.enabledTypes || [];
  var availableTypes = state.types
    .filter(function(t){ return enabledTypes.indexOf(t.id) > -1 || (entry && entry.typeId === t.id); })
    .sort(function(a, b){ return a.label.localeCompare(b.label, 'fr'); });

  var typeSelectionHtml;
  if(entry){
    // Édition d'une intervention existante : un seul type, comme avant.
    var typeOptions = availableTypes.map(function(t){
      var selected = entry.typeId === t.id ? ' selected' : '';
      return '<option value="' + t.id + '"' + selected + '>' + escapeHtml(t.label) + '</option>';
    }).join('');
    typeSelectionHtml = '<div class="field"><label>Type d\'intervention</label><select id="f-type">' + typeOptions + '</select></div>';
  } else {
    // Nouvelle intervention : sélection multiple, pour loguer en une fois
    // plusieurs opérations réalisées le même jour.
    var chips = availableTypes.map(function(t){
      return '<label class="type-select-chip"><input type="checkbox" class="f-type-multi" value="' + t.id + '">' + escapeHtml(t.label) + '</label>';
    }).join('');
    typeSelectionHtml = '<div class="field"><label>Type(s) d\'intervention</label>' +
      '<div class="type-select-list" id="typeSelectList">' + chips + '</div>' +
      '<button type="button" class="export-btn" id="quickAddTypeBtn" style="margin-top:8px;">+ Nouveau type</button>' +
      '<div class="quick-add-type-form" id="quickAddTypeForm" style="display:none;">' +
        '<input type="text" id="quickTypeName" placeholder="Nom du type (ex : Entretien portail)">' +
        '<select id="quickTypeCategory">' + HISTORY_CATEGORIES.map(function(c){ return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="btn btn-primary" id="quickTypeCreateBtn" style="width:auto;">Créer</button>' +
      '</div>' +
    '</div>';
  }

  var modal = document.getElementById('modal');
  var title = entry ? 'Modifier l\'intervention' : 'Nouvelle intervention';
  var dateVal = entry ? entry.date : todayLocalISO();
  var notesVal = entry ? (entry.notes || '') : '';

  var costVal = entry ? (entry.cost != null ? entry.cost : '') : '';
  var costLabel = entry ? 'Coût (€)' : 'Coût total (€) — optionnel, appliqué à toutes les interventions sélectionnées';
  var providerVal = entry ? (entry.provider || '') : '';

  var invoiceCurrentHtml = '';
  if(entry && entry.invoiceDoc){
    invoiceCurrentHtml = '<div class="invoice-current" id="invoiceCurrentChip">📎 ' + escapeHtml(entry.invoiceDoc.name) +
      ' <button type="button" class="link-btn" id="viewInvoiceBtn">Voir</button>' +
      ' <button type="button" class="link-btn" id="removeInvoiceBtn">Retirer</button></div>';
  }

  modal.innerHTML =
    '<h3>' + title + ' <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>' +
    typeSelectionHtml +
    '<div class="field"><label>Date</label><input type="date" id="f-date" value="' + dateVal + '"></div>' +
    '<div class="row2">' +
      '<div class="field"><label>' + costLabel + '</label><input type="number" step="0.01" min="0" id="f-cost" value="' + costVal + '" placeholder="—"></div>' +
      '<div class="field"><label>Prestataire / Artisan</label><input type="text" id="f-provider" value="' + escapeHtml(providerVal) + '" placeholder="Ex : Ramoneur Dupont, moi-même..."></div>' +
    '</div>' +
    '<div class="field"><label>Facture (PDF/photo)</label>' + invoiceCurrentHtml +
      '<button type="button" class="export-btn" id="invoiceFileBtn">📎 Joindre une facture</button>' +
      '<span id="invoiceFileName" class="field-hint" style="display:block; margin-top:4px;"></span>' +
      '<input type="file" id="invoiceFileInput" style="display:none;" accept="image/*,application/pdf">' +
    '</div>' +
    '<div class="field"><label>Notes / Observations' + (entry ? '' : ' <span class="field-hint" style="display:inline;">(appliquées à toutes les interventions sélectionnées, sinon la référence de chaque type est utilisée)</span>') + '</label><textarea id="f-notes" placeholder="Référence, garantie, remarques...">' + escapeHtml(notesVal) + '</textarea></div>' +
    '<div class="modal-actions">' +
      (entry ? '<button class="btn btn-danger" id="deleteBtn">Supprimer</button>' : '') +
      '<button class="btn btn-ghost" id="cancelBtn">Annuler</button>' +
      '<button class="btn btn-primary" id="saveBtn">Enregistrer</button>' +
    '</div>';

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = saveEntry;
  if(entry) document.getElementById('deleteBtn').onclick = function(){ deleteEntry(entry.id); };

  var invoiceFileBtn = document.getElementById('invoiceFileBtn');
  var invoiceFileInput = document.getElementById('invoiceFileInput');
  if(invoiceFileBtn && invoiceFileInput){
    invoiceFileBtn.onclick = function(){ invoiceFileInput.click(); };
    invoiceFileInput.onchange = function(){
      var file = invoiceFileInput.files[0];
      if(!file) return;
      pendingInvoiceFile = file;
      removeInvoiceRequested = false;
      var nameEl = document.getElementById('invoiceFileName');
      if(nameEl) nameEl.textContent = 'Sera jointe à l\'enregistrement : ' + file.name;
      var chip = document.getElementById('invoiceCurrentChip');
      if(chip) chip.style.display = 'none';
    };
  }
  var viewInvoiceBtn = document.getElementById('viewInvoiceBtn');
  if(viewInvoiceBtn && entry && entry.invoiceDoc) viewInvoiceBtn.onclick = function(){ openStorageDoc(entry.invoiceDoc.path); };
  var removeInvoiceBtn = document.getElementById('removeInvoiceBtn');
  if(removeInvoiceBtn){
    removeInvoiceBtn.onclick = function(){
      removeInvoiceRequested = true;
      pendingInvoiceFile = null;
      var chip = document.getElementById('invoiceCurrentChip');
      if(chip) chip.style.display = 'none';
      var nameEl = document.getElementById('invoiceFileName');
      if(nameEl) nameEl.textContent = 'La facture sera retirée à l\'enregistrement.';
    };
  }

  if(!entry){

    // "+ Nouveau type" : créer un type à la volée sans fermer la modale ni
    // perdre la saisie déjà en cours (date, autres types cochés...).
    var quickAddTypeBtn = document.getElementById('quickAddTypeBtn');
    var quickAddTypeForm = document.getElementById('quickAddTypeForm');
    if(quickAddTypeBtn && quickAddTypeForm){
      quickAddTypeBtn.onclick = function(){
        var showing = quickAddTypeForm.style.display !== 'none';
        quickAddTypeForm.style.display = showing ? 'none' : 'flex';
        if(!showing) document.getElementById('quickTypeName').focus();
      };
    }
    var quickTypeCreateBtn = document.getElementById('quickTypeCreateBtn');
    if(quickTypeCreateBtn){
      quickTypeCreateBtn.onclick = async function(){
        var nameInput = document.getElementById('quickTypeName');
        var name = nameInput.value.trim();
        if(!name){ await showAlert('Merci de nommer le nouveau type.'); return; }
        var id = slugify(name);
        if(state.types.filter(function(t){ return t.id === id; }).length){
          await showAlert('Un type avec un nom trop proche existe déjà.');
          return;
        }
        var category = document.getElementById('quickTypeCategory').value;
        state.types.push({ id: id, label: name, months: null, category: category });
        if(!v.enabledTypes) v.enabledTypes = [];
        v.enabledTypes.push(id);
        if(!v.intervals) v.intervals = {};
        v.intervals[id] = { months: null };
        logEvent(activePropertyId, 'Type d\'intervention créé : ' + name);
        await warnIfSaveFailed(await persist());

        // Ajoute la puce directement dans la liste déjà affichée, sans tout reconstruire.
        var list = document.getElementById('typeSelectList');
        if(list){
          var label = document.createElement('label');
          label.className = 'type-select-chip';
          label.innerHTML = '<input type="checkbox" class="f-type-multi" value="' + id + '" checked>' + escapeHtml(name);
          list.appendChild(label);
        }
        nameInput.value = '';
        quickAddTypeForm.style.display = 'none';
      };
    }
  }
}

async function saveEntry(){
  var date = document.getElementById('f-date').value;
  var sharedNotes = document.getElementById('f-notes').value.trim();
  var costInput = document.getElementById('f-cost').value;
  var cost = costInput === '' ? null : parseFloat(costInput);
  var provider = document.getElementById('f-provider').value.trim();

  if(!date){ await showAlert('Merci de renseigner une date.'); return; }
  if(cost !== null && (isNaN(cost) || cost < 0)){ await showAlert('Le coût doit être un nombre positif.'); return; }

  var typeIds;
  if(editingEntryId){
    typeIds = [document.getElementById('f-type').value];
  } else {
    typeIds = Array.prototype.filter.call(document.querySelectorAll('.f-type-multi'), function(cb){ return cb.checked; })
      .map(function(cb){ return cb.value; });
    if(!typeIds.length){ await showAlert('Merci de sélectionner au moins un type d\'intervention.'); return; }
  }

  var v = state.properties[activePropertyId];
  var now = new Date().toISOString();
  var list = state.entries[activePropertyId] || [];
  state.entries[activePropertyId] = list; // garantit que la liste modifiée est bien celle de `state`

  // Upload de la facture (différé jusqu'ici pour connaître l'id de l'intervention/du lot)
  var saveBtn = document.getElementById('saveBtn');
  if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = 'Enregistrement…'; }

  var invoiceDoc = null;
  var invoiceKeyId = editingEntryId || genId('batch');
  try {
    if(pendingInvoiceFile){
      var dataUrl = await prepareDocForStorage(pendingInvoiceFile);
      if(dataUrl){
        var storedType = (pendingInvoiceFile.type && pendingInvoiceFile.type.indexOf('image/') === 0) ? 'image/jpeg' : pendingInvoiceFile.type;
        var path = await uploadEntryInvoice(dataUrl, storedType, pendingInvoiceFile.name, activePropertyId, invoiceKeyId);
        invoiceDoc = { name: pendingInvoiceFile.name, type: storedType, path: path };
      }
    }
  } catch(e){
    console.error('Erreur upload facture:', e);
    await showAlert('Impossible de joindre la facture (' + describeSyncError(e) + '), l\'intervention sera quand même enregistrée.');
  }

  if(editingEntryId){
    var typeId = typeIds[0];
    var typeObj = state.types.filter(function(t){ return t.id === typeId; })[0];
    var label = typeObj ? typeObj.label : typeId;
    for(var i = 0; i < list.length; i++){
      if(list[i].id === editingEntryId){
        list[i].typeId = typeId;
        list[i].date = date;
        list[i].notes = sharedNotes;
        list[i].cost = cost;
        list[i].provider = provider || null;
        list[i].updatedAt = now;

        if(invoiceDoc){
          list[i].invoiceDoc = invoiceDoc;
        } else if(removeInvoiceRequested && list[i].invoiceDoc){
          await deleteInvoiceIfUnshared(list[i].invoiceDoc.path, activePropertyId, editingEntryId);
          delete list[i].invoiceDoc;
        }
        break;
      }
    }
    logEvent(activePropertyId, 'Intervention modifiée : ' + label + ' (' + fmtDate(date) + ')');
  } else {
    var batchId = (typeIds.length > 1) ? invoiceKeyId : null;
    var createdLabels = [];
    typeIds.forEach(function(tId){
      var tObj = state.types.filter(function(t){ return t.id === tId; })[0];
      var tLabel = tObj ? tObj.label : tId;
      // Texte partagé prioritaire s'il a été renseigné ; sinon on retombe sur la
      // référence propre à ce type pour ce bien (huile, pneus, pièce...).
      var refNote = (v.intervals && v.intervals[tId] && v.intervals[tId].notes) || '';
      var notesForThis = sharedNotes || refNote;

      var newEntry = {
        id: genId('e'),
        typeId: tId,
        date: date,
        notes: notesForThis,
        cost: cost,
        provider: provider || null,
        batchId: batchId,
        createdAt: now,
        updatedAt: now
      };
      if(invoiceDoc) newEntry.invoiceDoc = invoiceDoc;
      list.push(newEntry);
      createdLabels.push(tLabel);
    });
    logEvent(activePropertyId, 'Intervention' + (createdLabels.length > 1 ? 's' : '') + ' ajoutée' + (createdLabels.length > 1 ? 's' : '') + ' : ' + createdLabels.join(', ') + ' (' + fmtDate(date) + ')');
  }

  // Si cette intervention provient d'une "intervention à prévoir" en cours de
  // conversion, on la retire de la liste d'attente au moment où l'enregistrement
  // réussit réellement — pas à l'ouverture du formulaire, pour ne rien perdre en
  // cas d'annulation.
  if(!editingEntryId && convertingPlannedIntervention && convertingPlannedIntervention.propertyId === activePropertyId){
    var plannedList = state.plannedInterventions[activePropertyId] || [];
    state.plannedInterventions[activePropertyId] = plannedList.filter(function(p){ return p.id !== convertingPlannedIntervention.id; });
  }

  pendingInvoiceFile = null;
  removeInvoiceRequested = false;

  var saved = await persist();
  closeModal();
  renderContent();
  await warnIfSaveFailed(saved);
}

// Supprime le fichier de facture en Storage seulement si plus aucune autre
// intervention de ce bien ne le référence (cas d'une facture partagée).
async function deleteInvoiceIfUnshared(path, propertyId, excludeEntryId){
  if(!path) return;
  var list = state.entries[propertyId] || [];
  var stillUsed = list.some(function(e){ return e.id !== excludeEntryId && e.invoiceDoc && e.invoiceDoc.path === path; });
  if(!stillUsed) await deleteDocFromStorage(path);
}

async function deleteEntry(id){
  var ok = await showConfirm('Supprimer cette intervention ?', 'Supprimer');
  if(!ok) return;
  var list = state.entries[activePropertyId] || [];
  var entry = list.filter(function(e){ return e.id === id; })[0];

  if(entry){
    var typeObj = state.types.filter(function(t){ return t.id === entry.typeId; })[0];
    var label = typeObj ? typeObj.label : entry.typeId;
    logEvent(activePropertyId, 'Intervention supprimée : ' + label);
    if(entry.invoiceDoc) await deleteInvoiceIfUnshared(entry.invoiceDoc.path, activePropertyId, id);
  }

  state.entries[activePropertyId] = list.filter(function(e){ return e.id !== id; });
  var saved = await persist();
  closeModal();
  renderContent();
  await warnIfSaveFailed(saved);
}

function closeModal(){
  var overlay = document.getElementById('modalOverlay');
  if(overlay) overlay.classList.remove('open');
  editingEntryId = null;
  convertingPlannedIntervention = null;
}

