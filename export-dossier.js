// ---- Export de l'historique (archive / vente / assurance) ----
function csvEscape(val){
  var s = (val == null) ? '' : String(val);
  // Neutralise l'injection de formule ("CSV injection") : un tableur (Excel,
  // LibreOffice...) interprète comme une formule toute cellule commençant par
  // =, +, -, @, une tabulation ou un retour chariot — un champ libre (prestataire,
  // notes) pourrait ainsi contenir une formule active (ex.
  // HYPERLINK exfiltrant des données) exécutée à la réouverture du fichier.
  // On neutralise en préfixant d'une apostrophe : invisible à l'affichage
  // dans un tableur, mais empêche l'interprétation comme formule.
  if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if(/[";\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportHistoryCSV(propertyId){
  var v = state.properties[propertyId];
  if(!v) return;
  var entries = (state.entries[propertyId] || []).slice().sort(function(a, b){
    if(a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
  });

  // Point-virgule : s'ouvre correctement dans Excel FR sans réglage supplémentaire.
  var now = new Date();
  var costStats = computeCostStats(entries);
  var exportStamp = 'Export généré le ' + now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) + ' — ' + v.name + (v.address ? ' (' + v.address + ')' : '');
  var rows = [[exportStamp]];
  if(costStats.hasAny){
    rows.push(['Total dépensé', fmtEuro(costStats.total)]);
  }
  rows.push([], ['Date', 'Type d\'intervention', 'Coût (€)', 'Prestataire', 'Facture', 'Notes']);
  entries.forEach(function(e){
    var typeObj = state.types.filter(function(t){ return t.id === e.typeId; })[0];
    var label = typeObj ? typeObj.label : e.typeId;

    var costStr = e.cost != null ? e.cost.toLocaleString('fr-FR', {minimumFractionDigits:0, maximumFractionDigits:2}) + (e.batchId ? ' (facture partagée)' : '') : '';
    var invoiceStr = e.invoiceDoc ? e.invoiceDoc.name : '';

    rows.push([fmtDate(e.date), label, costStr, e.provider || '', invoiceStr, e.notes || '']);
  });

  var csv = rows.map(function(row){ return row.map(csvEscape).join(';'); }).join('\r\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM pour un accentuation correcte dans Excel
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var safeName = (v.name || 'bien').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.download = 'historique-' + safeName + '-' + todayLocalISO() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printProperty(){
  var el = document.getElementById('printExportDate');
  if(el){
    var now = new Date();
    el.textContent = 'Document généré le ' + now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
  }
  window.print();
}

// ---- Modale : configuration et génération du dossier du bien ----
function openPropertyDossierModal(propertyId){
  var v = state.properties[propertyId];
  if(!v) return;
  var modal = document.getElementById('modal');

  var catChecks = HISTORY_CATEGORIES.map(function(c){
    return '<label class="tm-property-chip"><input type="checkbox" class="dossier-cat" value="' + c.id + '" checked>' + c.label + '</label>';
  }).join('');

  modal.innerHTML =
    '<h3>Dossier du bien <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>' +
    '<div class="field-hint" style="margin-bottom:10px;">Choisis ce qui doit apparaître dans le document (vente, assurance, archive).</div>' +
    '<div class="field"><label>Catégories d\'intervention à inclure</label><div class="tm-property-list">' + catChecks + '</div></div>' +
    '<div class="row2">' +
      '<div class="field"><label>Depuis le (optionnel)</label><input type="date" id="dossier-from"></div>' +
      '<div class="field"><label>Jusqu\'au (optionnel)</label><input type="date" id="dossier-to"></div>' +
    '</div>' +
    '<div class="type-row" style="border:none; padding:4px 0;"><input type="checkbox" id="dossier-notes" checked><span class="name">Inclure les notes des interventions</span></div>' +
    '<div class="type-row" style="border:none; padding:4px 0;"><input type="checkbox" id="dossier-garage" checked><span class="name">Inclure les prestataires</span></div>' +
    '<div class="type-row" style="border:none; padding:4px 0;"><input type="checkbox" id="dossier-costs" checked><span class="name">Inclure les coûts et le total dépensé</span></div>' +
    '<div class="type-row" style="border:none; padding:4px 0;"><input type="checkbox" id="dossier-invoices"><span class="name">Intégrer les images de factures (photos uniquement)</span></div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" id="cancelBtn">Annuler</button>' +
      '<button class="btn btn-primary" id="generateDossierBtn">Générer le dossier</button>' +
    '</div>';

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('generateDossierBtn').onclick = function(){
    var options = {
      categories: Array.prototype.filter.call(document.querySelectorAll('.dossier-cat'), function(cb){ return cb.checked; }).map(function(cb){ return cb.value; }),
      dateFrom: document.getElementById('dossier-from').value,
      dateTo: document.getElementById('dossier-to').value,
      includeNotes: document.getElementById('dossier-notes').checked,
      includeGarage: document.getElementById('dossier-garage').checked,
      includeCosts: document.getElementById('dossier-costs').checked,
      includeInvoiceImages: document.getElementById('dossier-invoices').checked
    };
    closeModal();
    generatePropertyDossier(propertyId, options);
  };
}

async function generatePropertyDossier(propertyId, options){
  var v = state.properties[propertyId];
  if(!v) return;
  var entries = (state.entries[propertyId] || []).slice().sort(function(a,b){
    if(a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
  });

  var filtered = entries.filter(function(e){
    var typeObj = state.types.filter(function(t){ return t.id === e.typeId; })[0];
    var category = typeObj ? (typeObj.category || 'autre') : 'autre';
    if(options.categories.length && options.categories.indexOf(category) === -1) return false;
    if(options.dateFrom && e.date < options.dateFrom) return false;
    if(options.dateTo && e.date > options.dateTo) return false;
    return true;
  });

  var titre = v.name;
  var now = new Date();
  var nowStr = now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});

  var html = '<div id="dossier-top"></div>';
  html += '<div class="dossier-cover">';
  html += '<h1>' + escapeHtml(titre) + '</h1>';
  html += '<div class="dossier-sub">Dossier du bien — document généré le ' + nowStr + '</div>';
  html += '<a href="#dossier-bottom" class="jump-link dossier-jump">↓ Aller en bas (imprimer)</a>';
  html += '</div>';

  // Fiche du bien
  html += '<div class="dossier-section-title">Caractéristiques</div>';
  html += '<div class="dossier-fiche-grid">';
  if(v.propertyType) html += '<div><span>Type : </span>' + escapeHtml(v.propertyType) + '</div>';
  if(v.address) html += '<div><span>Adresse : </span>' + escapeHtml(v.address) + '</div>';
  html += '</div>';

  // Coûts
  if(options.includeCosts){
    var costStats = computeCostStats(filtered);
    if(costStats.hasAny){
      html += '<div class="dossier-section-title">Bilan financier</div>';
      html += '<div class="dossier-fiche-grid">';
      html += '<div><span>Total dépensé (période sélectionnée) : </span>' + fmtEuro(costStats.total) + '</div>';
      html += '</div>';
    }
  }

  // Historique filtré
  html += '<div class="dossier-section-title">Historique d\'entretien (' + filtered.length + ' intervention' + (filtered.length > 1 ? 's' : '') + ')</div>';
  if(!filtered.length){
    html += '<div class="field-hint">Aucune intervention ne correspond aux filtres sélectionnés.</div>';
  } else {
    filtered.slice().reverse().forEach(function(e){
      var typeObj = state.types.filter(function(t){ return t.id === e.typeId; })[0];
      var label = typeObj ? typeObj.label : e.typeId;
      html += '<div class="history-row" style="cursor:default;">';
      html += '<div class="history-main">';
      html += '<div class="history-type">' + escapeHtml(label) + '</div>';
      if(options.includeNotes && e.notes) html += '<div class="history-notes">' + escapeHtml(e.notes) + '</div>';
      if(options.includeGarage && e.provider) html += '<div class="history-notes">🔧 ' + escapeHtml(e.provider) + '</div>';
      html += '</div>';
      html += '<div class="history-meta">';
      if(options.includeCosts && e.cost != null) html += '<div class="km">' + fmtEuro(e.cost) + '</div>';
      html += '<div>' + fmtDate(e.date) + '</div>';
      html += '</div>';
      html += '</div>';
    });
  }

  var area = document.getElementById('dossierPrintArea');
  area.innerHTML = html;
  document.body.classList.add('dossier-mode');
  window.scrollTo(0, 0);

  // Charge les images de factures en arrière-plan si demandé (n'attend pas
  // avant d'afficher le dossier, pour ne pas bloquer l'aperçu)
  if(options.includeInvoiceImages){
    loadDossierInvoiceImages(filtered);
  }

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

// Récupère les URLs signées des factures-images et les intègre visuellement
// dans le dossier (les PDF ne peuvent pas s'afficher en <img>, ils restent
// mentionnés par leur nom uniquement).
async function loadDossierInvoiceImages(entries){
  if(!cloudReady || !currentUser) return;
  var imagePaths = entries
    .filter(function(e){ return e.invoiceDoc && e.invoiceDoc.type && e.invoiceDoc.type.indexOf('image/') === 0; })
    .map(function(e){ return e.invoiceDoc.path; });
  if(!imagePaths.length) return;

  try {
    var res = await sb.storage.from(DOCS_BUCKET).createSignedUrls(imagePaths, 300);
    if(res.error || !res.data) return;
    var urlByPath = {};
    res.data.forEach(function(item){ if(item.signedUrl) urlByPath[item.path] = item.signedUrl; });

    var area = document.getElementById('dossierPrintArea');
    if(!area) return;
    var rows = area.querySelectorAll('.history-row');
    var idx = 0;
    entries.forEach(function(e){
      var rowEl = rows[entries.length - 1 - idx]; // la liste est affichée en ordre inversé (plus récent en premier)
      idx++;
      if(e.invoiceDoc && urlByPath[e.invoiceDoc.path] && rowEl){
        var img = document.createElement('img');
        img.className = 'dossier-invoice-img';
        img.src = urlByPath[e.invoiceDoc.path];
        img.alt = 'Facture';
        rowEl.querySelector('.history-main').appendChild(img);
      }
    });
  } catch(e){
    console.error('Erreur chargement images factures (dossier):', e);
  }
}

function groupByTheme(items){
  var groups = {};
  var order = [];
  items.forEach(function(c){
    var theme = c.theme || 'Autres vérifications';
    if(!groups[theme]){ groups[theme] = []; order.push(theme); }
    groups[theme].push(c);
  });
  return order.map(function(theme){ return { theme: theme, items: groups[theme] }; });
}

// ---- Modale : configuration et génération de la fiche d'entretien à faire ----
function openMaintenanceSheetModal(propertyId){
  var v = state.properties[propertyId];
  if(!v) return;
  var modal = document.getElementById('modal');
  var enabledTypeIds = v.enabledTypes || [];

  var typesWithStatus = enabledTypeIds.map(function(typeId){
    var st = computeStatus(propertyId, typeId);
    return { typeId: typeId, st: st };
  }).filter(function(x){ return x.st; })
    .sort(function(a, b){ return a.st.cfg.label.localeCompare(b.st.cfg.label, 'fr'); });

  function statusLabel(st){
    if(!st.last) return 'Aucun historique';
    var parts = [];
    if(st.remainingDays !== null) parts.push(st.remainingDays <= 0 ? 'dépassé de ' + Math.abs(st.remainingDays) + ' j' : 'dans ' + st.remainingDays + ' j');
    return parts.length ? parts.join(' ou ') : 'Pas d\'échéance configurée';
  }

  function typeChecks(preselectMonths){
    return typesWithStatus.map(function(x){
      var preChecked = x.st.isOverdue || x.st.isWarning;
      if(preselectMonths != null && x.st.remainingDays != null){
        preChecked = x.st.remainingDays <= preselectMonths * 30.44;
      }
      return '<label class="tm-property-chip" style="width:100%; justify-content:space-between;">' +
        '<span><input type="checkbox" class="msheet-type" value="' + x.typeId + '"' + (preChecked ? ' checked' : '') + '> ' + escapeHtml(x.st.cfg.label) + '</span>' +
        '<span class="field-hint" style="display:inline;">' + escapeHtml(statusLabel(x.st)) + '</span>' +
        '</label>';
    }).join('');
  }

  var checklistChecks = groupByTheme(state.checklistItems).map(function(grp){
    var itemsHtml = grp.items.map(function(c){
      return '<label class="tm-property-chip"><input type="checkbox" class="msheet-checklist" value="' + c.id + '" checked>' + escapeHtml(c.label) + '</label>';
    }).join('');
    return '<div class="checklist-theme-block"><div class="checklist-theme-title">' + escapeHtml(grp.theme) + '</div><div class="tm-property-list">' + itemsHtml + '</div></div>';
  }).join('');

  modal.innerHTML =
    '<h3>Fiche d\'entretien <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>' +
    '<div class="field-hint" style="margin-bottom:10px;">Choisis les interventions à préparer, ou présélectionne automatiquement celles à échéance proche.</div>' +
    '<div class="row2">' +
      '<div class="field"><label>Présélectionner les échéances à moins de</label><input type="number" id="msheetMonths" value="6" min="1" style="width:70px; display:inline-block;"> mois</div>' +
      '<div class="field" style="display:flex; align-items:flex-end;"><button type="button" class="export-btn" id="msheetPreselectBtn">Appliquer</button></div>' +
    '</div>' +
    '<div class="field"><label>Interventions à inclure</label><div class="tm-property-list" id="msheetTypesList" style="flex-direction:column; align-items:stretch;">' + typeChecks(null) + '</div></div>' +
    '<div class="field"><label>Checklist de vérifications d\'usage</label><div class="tm-property-list" id="msheetChecklistList">' + checklistChecks + '</div>' +
      '<button type="button" class="export-btn" id="manageChecklistBtn" style="margin-top:8px;">⚙️ Gérer la checklist</button>' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" id="cancelBtn">Annuler</button>' +
      '<button class="btn btn-primary" id="generateMaintenanceSheetBtn">Générer la fiche</button>' +
    '</div>';

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('cancelBtn').onclick = closeModal;

  document.getElementById('msheetPreselectBtn').onclick = function(){
    var months = parseInt(document.getElementById('msheetMonths').value || '6', 10);
    var list = document.getElementById('msheetTypesList');
    if(list) list.innerHTML = typeChecks(months);
  };

  document.getElementById('manageChecklistBtn').onclick = function(){ openChecklistManagerModal(propertyId); };

  document.getElementById('generateMaintenanceSheetBtn').onclick = async function(){
    var selectedTypeIds = Array.prototype.filter.call(document.querySelectorAll('.msheet-type'), function(cb){ return cb.checked; }).map(function(cb){ return cb.value; });
    var selectedChecklistIds = Array.prototype.filter.call(document.querySelectorAll('.msheet-checklist'), function(cb){ return cb.checked; }).map(function(cb){ return cb.value; });
    if(!selectedTypeIds.length && !selectedChecklistIds.length){
      await showAlert('Sélectionne au moins une intervention ou un point de vérification.');
      return;
    }

    // Crée une session "planifiée" pour garder trace de cette fiche : coche des
    // vérifications, anomalies, et interventions marquées réalisées viendront
    // s'y rattacher au fil de l'entretien réel.
    if(!state.sessions[propertyId]) state.sessions[propertyId] = [];
    var session = {
      id: genId('sess'),
      date: todayLocalISO(),
      status: 'planned',
      plannedTypeIds: selectedTypeIds,
      checklistItemIds: selectedChecklistIds,
      checklistResults: selectedChecklistIds.map(function(id){ return { itemId: id, status: null, anomaly: null, plannedInterventionId: null }; }),
      entryIds: [],
      sessionNotes: '',
      createdAt: new Date().toISOString()
    };
    state.sessions[propertyId].push(session);
    logEvent(propertyId, 'Fiche d\'entretien créée (' + selectedTypeIds.length + ' intervention(s), ' + selectedChecklistIds.length + ' vérification(s))');
    var saved = await persist();

    closeModal();
    generateMaintenanceSheet(propertyId, selectedTypeIds, selectedChecklistIds);
    await warnIfSaveFailed(saved);
  };
}

