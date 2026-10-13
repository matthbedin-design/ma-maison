// ---- Modale : Réglages du bien ----
// Capture l'état actuel du formulaire (cases cochées, valeurs mois, nom,
// couleur) et l'applique à v — utilisé avant tout rafraîchissement de la
// modale (ajout/suppression de type) pour ne jamais perdre une saisie en cours.
function collectSettingsFormData(v, modal, swatchWrap){
  var name = document.getElementById('s-name').value.trim();
  if(name) v.name = name;

  var selected = swatchWrap.querySelector('.swatch.selected');
  if(selected) v.color = selected.getAttribute('data-color');

  var propertyTypeEl = document.getElementById('s-propertytype');
  if(propertyTypeEl) v.propertyType = propertyTypeEl.value;
  var addressEl = document.getElementById('s-address');
  if(addressEl) v.address = addressEl.value.trim();

  // Note : l'activation/désactivation des types se fait désormais uniquement
  // via "Gérer les types pour plusieurs biens" (modale globale) — cette
  // modale n'affiche que les types déjà actifs et ne modifie donc plus v.enabledTypes.

  if(!v.intervals) v.intervals = {};
  Array.prototype.forEach.call(modal.querySelectorAll('.type-row input[type=number]'), function(inp){
    var t = inp.getAttribute('data-type');
    var field = inp.getAttribute('data-field');
    var val = inp.value === '' ? null : parseInt(inp.value, 10);
    if(!v.intervals[t]) v.intervals[t] = {};
    v.intervals[t][field] = val;
  });
  Array.prototype.forEach.call(modal.querySelectorAll('.type-row .ref-input'), function(inp){
    var t = inp.getAttribute('data-type');
    if(!v.intervals[t]) v.intervals[t] = {};
    v.intervals[t].notes = inp.value.trim() || null;
  });
  Array.prototype.forEach.call(modal.querySelectorAll('.type-row .always-show-checkbox'), function(cb){
    var t = cb.getAttribute('data-type');
    if(!v.intervals[t]) v.intervals[t] = {};
    v.intervals[t].alwaysShowGauge = cb.checked;
  });
}

function openSettingsModal(){
  var v = state.properties[activePropertyId];
  var modal = document.getElementById('modal');
  var iAmOwner = isOwner(activePropertyId);
  var iCanEdit = canEditProperty(activePropertyId);

  var enabledTypeIds = v.enabledTypes || [];
  var rows = state.types
    .filter(function(t){ return enabledTypeIds.indexOf(t.id) > -1; })
    .sort(function(a, b){ return a.label.localeCompare(b.label, 'fr'); })
    .map(function(t){
      var iv = (v.intervals && v.intervals[t.id]) || {};
      var monthsVal = iv.months !== undefined ? iv.months : t.months;
      var notesVal = iv.notes || '';
      var alwaysShowChecked = !!iv.alwaysShowGauge;

      return '<div class="type-row">' +
        '<div class="type-row-main">' +
        '<span class="name">' + escapeHtml(t.label) + '</span>' +
        '<input type="number" data-type="' + t.id + '" data-field="months" value="' + (monthsVal == null ? '' : monthsVal) + '" placeholder="—"><span class="unit">mois</span>' +
        '<button class="trash-btn" data-deltype="' + t.id + '" title="Supprimer ce type pour tous les biens" aria-label="Supprimer ce type pour tous les biens">' + trashSvg() + '</button>' +
        '</div>' +
        '<input type="text" class="ref-input" data-type="' + t.id + '" data-field="notes" value="' + escapeHtml(notesVal) + '" placeholder="Référence (ex : contrat n° 123, nom du prestataire habituel)">' +
        '<label class="notify-toggle"><input type="checkbox" class="always-show-checkbox" data-type="' + t.id + '"' + (alwaysShowChecked ? ' checked' : '') + '> 👁️ Toujours afficher dans les échéances (même sans périodicité configurée)</label>' +
        '</div>';
    }).join('');

  if(!rows){
    rows = '<div class="field-hint" style="padding:10px 0;">Aucun type actif pour ce bien. Utilisez "Gérer les types pour plusieurs biens" ci-dessous pour en activer.</div>';
  }

  var canDelete = state.order.length > 1;

  modal.innerHTML =
    '<h3>Réglages du bien <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>' +
    '<div class="field"><label>Nom du bien</label><input type="text" id="s-name" value="' + escapeHtml(v.name) + '"></div>' +
    '<div class="field"><label>Type de bien</label><select id="s-propertytype">' +
      PROPERTY_TYPES.map(function(t){ return '<option value="' + t + '"' + (v.propertyType === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="field"><label>Adresse</label><input type="text" id="s-address" value="' + escapeHtml(v.address || '') + '" placeholder="Adresse du bien"></div>' +
    '<div class="field"><label>Couleur</label><div class="swatches" id="s-swatches"></div></div>' +
    '<hr class="hr">' +
    '<div class="field"><label>Types d\'intervention suivis pour ce bien</label>' + rows +
      '<div class="add-type-row">' +
        '<input type="text" id="newTypeName" placeholder="Nouveau type (ex : Entretien portail)">' +
        '<button id="addTypeBtn">+ Ajouter</button>' +
      '</div>' +
      '<button type="button" class="export-btn" id="openTypesManagerBtn" style="margin-top:10px;">🏷️ Gérer les types pour plusieurs biens</button>' +
    '</div>' +
    '<div class="modal-actions" style="margin-top:16px;">' +
      (iAmOwner ? '<button class="btn btn-ghost" id="sharePropertyBtn">🔗 Partager</button>' : '') +
      (iAmOwner && canDelete ? '<button class="btn btn-danger" id="deletePropertyBtn">Supprimer ce bien</button>' : '') +
      '<button class="btn btn-ghost" id="cancelBtn">Fermer</button>' +
      (iCanEdit ? '<button class="btn btn-primary" id="saveSettingsBtn">Enregistrer</button>' : '') +
    '</div>' +
    (iCanEdit ? '' : '<div class="field-hint" style="text-align:center;margin-top:8px;">👁️ Vous ne pouvez pas modifier les réglages de ce bien' + (canContribute(activePropertyId) ? ' (vous pouvez en revanche ajouter des interventions).' : '.') + '</div>') +
    '<div id="settingsSaveStatus" style="text-align:center; font-size:12.5px; color:var(--green); margin-top:8px; min-height:16px;"></div>';

  var swatchWrap = document.getElementById('s-swatches');
  PALETTE.forEach(function(c){
    var sw = document.createElement('div');
    sw.className = 'swatch' + (c === v.color ? ' selected' : '');
    sw.style.background = c;
    sw.setAttribute('data-color', c);
    sw.onclick = function(){
      Array.prototype.forEach.call(swatchWrap.children, function(el){ el.classList.remove('selected'); });
      sw.classList.add('selected');
    };
    swatchWrap.appendChild(sw);
  });

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('cancelBtn').onclick = closeModal;

  if(iAmOwner){
    document.getElementById('sharePropertyBtn').onclick = function(){ openSharePropertyModal(activePropertyId); };
  }

  if(!iCanEdit){
    // Lecture seule : tous les champs du formulaire sont désactivés, aucun
    // handler de modification n'est attaché (la sécurité réelle vient des
    // policies RLS côté serveur — ceci n'est qu'un confort d'interface).
    Array.prototype.forEach.call(modal.querySelectorAll('input, select, button.trash-btn'), function(el){
      el.disabled = true;
    });
    return;
  }

  if(iAmOwner && canDelete){
    document.getElementById('deletePropertyBtn').onclick = function(){ deleteProperty(activePropertyId); };
  }

  Array.prototype.forEach.call(modal.querySelectorAll('[data-deltype]'), function(btn){
    btn.onclick = async function(){
      collectSettingsFormData(v, modal, swatchWrap);
      await warnIfSaveFailed(await persist());
      var removed = await deleteType(btn.getAttribute('data-deltype'));
      if(removed) openSettingsModal();
    };
  });

  var openTypesManagerBtn = document.getElementById('openTypesManagerBtn');
  if(openTypesManagerBtn) openTypesManagerBtn.onclick = function(){
    collectSettingsFormData(v, modal, swatchWrap);
    persist().then(warnIfSaveFailed);
    openTypesManagerModal();
  };

  document.getElementById('addTypeBtn').onclick = async function(){
    var input = document.getElementById('newTypeName');
    var name = input.value.trim();
    if(!name){ await showAlert('Merci de nommer le nouveau type.'); return; }
    var id = slugify(name);

    // Sauvegarde d'abord les modifications déjà faites dans le formulaire
    // (cases cochées, valeurs mois) avant d'ajouter le nouveau type,
    // pour ne pas les perdre au rafraîchissement de la modale.
    collectSettingsFormData(v, modal, swatchWrap);

    state.types.push({ id: id, label: name, months: null, category: 'autre' });
    if(!v.enabledTypes) v.enabledTypes = [];
    v.enabledTypes.push(id);
    if(!v.intervals) v.intervals = {};
    v.intervals[id] = { months: null };

    logEvent(activePropertyId, 'Type d\'intervention créé : ' + name);
    await warnIfSaveFailed(await persist());
    openSettingsModal();
  };

  document.getElementById('saveSettingsBtn').onclick = async function(){
    var oldName = v.name, oldColor = v.color;
    collectSettingsFormData(v, modal, swatchWrap);

    if(v.name !== oldName) logEvent(activePropertyId, 'Bien renommé : "' + oldName + '" -> "' + v.name + '"');
    if(v.color !== oldColor) logEvent(activePropertyId, 'Couleur du bien modifiée');
    logEvent(activePropertyId, 'Réglages des échéances mis à jour');

    var ok = await persist();
    render(); // met à jour la page derrière la modale, qui reste ouverte

    var statusEl = document.getElementById('settingsSaveStatus');
    if(statusEl){
      statusEl.style.color = ok ? 'var(--green)' : 'var(--red)';
      statusEl.textContent = ok ? '✓ Enregistré' : '❌ Échec de l\'enregistrement, réessayez.';
      clearTimeout(statusEl._clearTimer);
      statusEl._clearTimer = setTimeout(function(){ if(statusEl) statusEl.textContent = ''; }, 3000);
    }
  };
}

// ---- Modale : partage d'un bien (étape 2a — rôles visiteur / éditeur) ----
function openSharePropertyModal(propertyId){
  var v = state.properties[propertyId];
  if(!v) return;
  var modal = document.getElementById('modal');

  modal.innerHTML =
    '<h3>Partager "' + escapeHtml(v.name) + '" <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>' +
    '<div class="field-hint" style="margin-bottom:12px;">Les personnes ci-dessous ont accès à ce bien. Elles ne voient aucun de vos autres biens.</div>' +
    '<div id="shareListArea" class="empty-state">Chargement…</div>' +
    '<hr class="hr">' +
    '<div class="field"><label>Inviter par e-mail</label><input type="email" id="shareEmailInput" placeholder="email@exemple.com"></div>' +
    '<div class="field"><label>Rôle</label><select id="shareRoleSelect">' +
      '<option value="viewer">Lecture seule</option>' +
      '<option value="contributor">Contributeur (peut ajouter des interventions)</option>' +
      '<option value="editor">Édition complète</option>' +
    '</select></div>' +
    '<div class="field"><label>Expiration (optionnel)</label><input type="date" id="shareExpires">' +
      '<div class="field-hint">Laisser vide pour un accès permanent — utile pour un partage temporaire (garage, contrôle technique...), l\'accès se coupe automatiquement à minuit ce jour-là.</div>' +
    '</div>' +
    '<button class="btn btn-primary" id="shareInviteBtn" style="width:100%;">Inviter</button>' +
    '<div id="shareInviteStatus" style="text-align:center; font-size:12.5px; margin-top:8px; min-height:16px;"></div>' +
    '<div class="modal-actions" style="margin-top:16px;"><button class="btn btn-ghost" id="cancelBtn" style="flex:1;">Fermer</button></div>';

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('cancelBtn').onclick = closeModal;

  async function refreshShareList(){
    var area = document.getElementById('shareListArea');
    if(!area) return;
    var res = await sb.from('home_shares').select('id, invited_email, role, status, expires_at')
      .eq('property_id', propertyId).eq('owner_id', currentUser.id);
    if(res.error){
      area.textContent = describeSyncError(res.error);
      return;
    }
    var rows = res.data || [];
    if(!rows.length){
      area.className = 'empty-state';
      area.textContent = 'Personne d\'autre n\'a accès à ce bien pour le moment.';
      return;
    }
    area.className = '';
    area.innerHTML = rows.map(function(r){
      var roleLabel = (r.role === 'editor') ? 'Édition complète' : (r.role === 'contributor' ? 'Contributeur' : 'Lecture seule');
      var statusLabel = (r.status === 'pending') ? ' (en attente de connexion)' : '';
      var expired = r.expires_at && new Date(r.expires_at) <= new Date();
      var expiryLabel = r.expires_at
        ? (expired ? ' · <span style="color:var(--red)">expiré le ' + fmtDate(r.expires_at.substring(0,10)) + '</span>' : ' · jusqu\'au ' + fmtDate(r.expires_at.substring(0,10)))
        : '';
      return '<div class="journal-row">' +
        '<div class="journal-meta"><span class="journal-tag" style="background:' + (v.color || '#6B6E70') + '">' + roleLabel + '</span></div>' +
        '<div class="journal-msg">' + escapeHtml(r.invited_email || '') + statusLabel + expiryLabel + '</div>' +
        '<button class="btn btn-ghost" data-revoke="' + r.id + '" style="margin-top:6px;">Révoquer l\'accès</button>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(area.querySelectorAll('[data-revoke]'), function(btn){
      btn.onclick = async function(){
        var ok = await showConfirm('Révoquer l\'accès de cette personne à ce bien ?', 'Révoquer');
        if(!ok) return;
        await sb.from('home_shares').delete().eq('id', btn.getAttribute('data-revoke')).eq('owner_id', currentUser.id);
        refreshShareList();
      };
    });
  }
  refreshShareList();

  document.getElementById('shareInviteBtn').onclick = async function(){
    var email = document.getElementById('shareEmailInput').value.trim().toLowerCase();
    var role = document.getElementById('shareRoleSelect').value;
    var statusEl = document.getElementById('shareInviteStatus');
    if(!email){ statusEl.style.color = 'var(--red)'; statusEl.textContent = 'Merci de saisir un e-mail.'; return; }

    statusEl.style.color = '';
    statusEl.textContent = 'Vérification…';
    try {
      var session = await sb.auth.getSession();
      var accessToken = session.data && session.data.session ? session.data.session.access_token : null;
      var resp = await fetch(SUPABASE_URL + '/functions/v1/resolve-user-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
        body: JSON.stringify({ email: email })
      });
      var result = await resp.json();
      var foundUserId = result && result.userId ? result.userId : null;

      var expiresInput = document.getElementById('shareExpires').value; // "" ou "YYYY-MM-DD"
      // Fin de journée LOCALE (pas UTC) pour que l'accès reste valide toute la
      // journée choisie, y compris pour un fuseau en avance sur UTC comme la
      // France — voir localDateInputValue()/todayLocalISO() dans ui-common.js
      // pour le même principe appliqué ailleurs dans l'app.
      var expiresAt = expiresInput ? new Date(expiresInput + 'T23:59:59').toISOString() : null;

      var insertRow = {
        property_id: propertyId,
        owner_id: currentUser.id,
        invited_email: email,
        role: role,
        shared_with_user_id: foundUserId,
        status: foundUserId ? 'active' : 'pending',
        expires_at: expiresAt
      };
      var ins = await sb.from('home_shares').insert(insertRow);
      if(ins.error){
        statusEl.style.color = 'var(--red)';
        statusEl.textContent = 'Erreur : ' + ins.error.message;
        return;
      }

      statusEl.style.color = 'var(--green)';
      statusEl.textContent = foundUserId
        ? '✓ Accès accordé immédiatement (compte existant).'
        : '✓ Invitation enregistrée — l\'accès s\'activera à sa prochaine connexion.';
      document.getElementById('shareEmailInput').value = '';
      document.getElementById('shareExpires').value = '';
      var roleLogLabel = (role === 'editor') ? 'édition' : (role === 'contributor' ? 'contributeur' : 'lecture seule');
      logEvent(propertyId, 'Bien partagé avec ' + email + ' (' + roleLogLabel + ')');
      await warnIfSaveFailed(await persist());
      refreshShareList();
    } catch(e){
      console.error('Erreur invitation de partage:', e);
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = 'Erreur réseau, réessayez.';
    }
  };
}

async function deleteType(typeId){
  var t = state.types.filter(function(x){ return x.id === typeId; })[0];
  if(!t) return false;
  var ok = await showConfirm('Supprimer le type "' + t.label + '" pour tous les biens ? Les interventions déjà enregistrées restent visibles dans l\'historique.', 'Supprimer');
  if(!ok) return false;

  state.types = state.types.filter(function(x){ return x.id !== typeId; });
  state.order.forEach(function(id){
    var v = state.properties[id];
    if(v){
      if(v.enabledTypes) v.enabledTypes = v.enabledTypes.filter(function(x){ return x !== typeId; });
      if(v.intervals && v.intervals[typeId]) delete v.intervals[typeId];
    }
  });

  logEvent(null, 'Type d\'intervention supprimé (tous biens) : ' + t.label);
  var saved = await persist();
  renderContent();
  await warnIfSaveFailed(saved);
  return true;
}

// ---- Modale : gestion des types d'intervention pour plusieurs biens ----
function openTypesManagerModal(){
  renderTypesManagerModal();
  document.getElementById('modalOverlay').classList.add('open');
}

function renderTypesManagerModal(){
  var modal = document.getElementById('modal');

  function propertyChecklist(typeId, checkboxClass){
    return state.order.map(function(vid){
      var vv = state.properties[vid];
      if(!vv) return '';
      var checked = typeId ? ((vv.enabledTypes || []).indexOf(typeId) > -1) : false;
      return '<label class="tm-property-chip"><input type="checkbox" class="' + checkboxClass + '" data-type="' + (typeId || '') + '" data-property="' + vid + '"' + (checked ? ' checked' : '') + '>' + escapeHtml(vv.name) + '</label>';
    }).join('');
  }

  var rows = state.types.slice().sort(function(a, b){ return a.label.localeCompare(b.label, 'fr'); }).map(function(t){
    var reminderDaysVal = (t.reminderDays != null) ? t.reminderDays : '';
    var catOptions = HISTORY_CATEGORIES.map(function(c){
      return '<option value="' + c.id + '"' + ((t.category || 'autre') === c.id ? ' selected' : '') + '>' + c.label + '</option>';
    }).join('');
    return '<div class="tm-type-row">' +
      '<div class="tm-type-head">' +
        '<input type="text" class="tm-type-name" data-type="' + t.id + '" value="' + escapeHtml(t.label) + '">' +
        '<select class="tm-type-category" data-type="' + t.id + '">' + catOptions + '</select>' +
        '<button class="trash-btn tm-type-delete" data-type="' + t.id + '" title="Supprimer ce type pour tous les biens" aria-label="Supprimer ce type pour tous les biens">' + trashSvg() + '</button>' +
      '</div>' +
      '<div class="tm-reminder-row">' +
        '<span class="tm-reminder-label">🔔 Prévenir</span>' +
        '<input type="number" class="tm-reminder-input" data-type="' + t.id + '" data-field="reminderDays" value="' + reminderDaysVal + '" placeholder="30"><span class="unit">jours avant l\'échéance</span>' +
      '</div>' +
      '<div class="tm-property-list">' + propertyChecklist(t.id, 'tm-property-toggle') + '</div>' +
    '</div>';
  }).join('');

  modal.innerHTML =
    '<h3>Types d\'intervention <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">\u2715</button></h3>' +
    '<div class="field-hint" style="margin-bottom:12px;">Ces types sont partagés entre tous les biens. Renommez-les ou cochez/décochez les biens concernés — tout se sauvegarde automatiquement.</div>' +
    '<div id="tmTypesList">' + rows + '</div>' +
    '<hr class="hr">' +
    '<div class="field"><label>Nouveau type</label>' +
      '<input type="text" id="tmNewTypeName" placeholder="Ex : Entretien portail" style="width:100%; background:var(--surface-2); border:1px solid var(--border); color:var(--text); font-size:13.5px; padding:9px 11px; border-radius:9px; margin-bottom:8px;">' +
      '<select id="tmNewTypeCategory" class="tm-type-category">' + HISTORY_CATEGORIES.map(function(c){ return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('') + '</select>' +
      '<div class="tm-property-list" id="tmNewTypeProperties" style="margin-top:8px;">' + propertyChecklist(null, 'tm-new-property-toggle') + '</div>' +
      '<button type="button" class="ct-add-defect-btn" id="tmAddTypeBtn" style="margin-top:10px;">+ Ajouter ce type</button>' +
    '</div>' +
    '<div class="modal-actions" style="margin-top:16px;">' +
      '<button class="btn btn-primary" id="cancelBtn">Fermer</button>' +
    '</div>';

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = function(){ closeModal(); render(); };
  document.getElementById('cancelBtn').onclick = function(){ closeModal(); render(); };

  Array.prototype.forEach.call(modal.querySelectorAll('.tm-type-name'), function(inp){
    inp.onchange = async function(){
      var id = inp.getAttribute('data-type');
      var newLabel = inp.value.trim();
      var t = state.types.filter(function(x){ return x.id === id; })[0];
      if(!t) return;
      if(!newLabel){ inp.value = t.label; return; }
      if(t.label !== newLabel){
        logEvent(null, 'Type d\'intervention renommé : "' + t.label + '" -> "' + newLabel + '"');
        t.label = newLabel;
        await warnIfSaveFailed(await persist());
        renderContent();
      }
    };
  });

  Array.prototype.forEach.call(modal.querySelectorAll('.tm-type-category'), function(sel){
    sel.onchange = async function(){
      var id = sel.getAttribute('data-type');
      var t = state.types.filter(function(x){ return x.id === id; })[0];
      if(!t) return;
      t.category = sel.value;
      await warnIfSaveFailed(await persist());
      renderContent();
    };
  });

  Array.prototype.forEach.call(modal.querySelectorAll('.tm-reminder-input'), function(inp){
    inp.onchange = async function(){
      var id = inp.getAttribute('data-type');
      var field = inp.getAttribute('data-field');
      var t = state.types.filter(function(x){ return x.id === id; })[0];
      if(!t) return;
      var val = inp.value === '' ? null : parseInt(inp.value, 10);
      if(val !== null && val < 0){ inp.value = ''; val = null; }
      t[field] = val;
      await warnIfSaveFailed(await persist());
      renderContent();
    };
  });

  Array.prototype.forEach.call(modal.querySelectorAll('.tm-property-toggle'), function(cb){
    cb.onchange = async function(){
      var typeId = cb.getAttribute('data-type');
      var propertyId = cb.getAttribute('data-property');
      var vv = state.properties[propertyId];
      if(!vv) return;
      if(!vv.enabledTypes) vv.enabledTypes = [];
      var idx = vv.enabledTypes.indexOf(typeId);
      if(cb.checked && idx === -1){
        vv.enabledTypes.push(typeId);
        if(!vv.intervals) vv.intervals = {};
        if(!vv.intervals[typeId]) vv.intervals[typeId] = {};
        logEvent(propertyId, 'Type activé : ' + typeId);
      } else if(!cb.checked && idx > -1){
        vv.enabledTypes.splice(idx, 1);
        logEvent(propertyId, 'Type désactivé : ' + typeId);
      }
      await warnIfSaveFailed(await persist());
    };
  });

  Array.prototype.forEach.call(modal.querySelectorAll('.tm-type-delete'), function(btn){
    btn.onclick = async function(){
      var removed = await deleteType(btn.getAttribute('data-type'));
      if(removed) renderTypesManagerModal();
    };
  });

  var addBtnTm = document.getElementById('tmAddTypeBtn');
  if(addBtnTm) addBtnTm.onclick = async function(){
    var input = document.getElementById('tmNewTypeName');
    var name = input.value.trim();
    if(!name){ await showAlert('Merci de nommer le nouveau type.'); return; }
    var id = slugify(name);
    if(state.types.filter(function(t){ return t.id === id; }).length){
      await showAlert('Un type avec un nom trop proche existe déjà.');
      return;
    }
    var categorySelect = document.getElementById('tmNewTypeCategory');
    state.types.push({ id: id, label: name, months: null, category: categorySelect ? categorySelect.value : 'autre' });

    var checkedProperties = Array.prototype.filter.call(modal.querySelectorAll('.tm-new-property-toggle'), function(cb){ return cb.checked; })
      .map(function(cb){ return cb.getAttribute('data-property'); });

    checkedProperties.forEach(function(vid){
      var vv = state.properties[vid];
      if(!vv) return;
      if(!vv.enabledTypes) vv.enabledTypes = [];
      vv.enabledTypes.push(id);
      if(!vv.intervals) vv.intervals = {};
      vv.intervals[id] = { months: null };
    });

    logEvent(null, 'Type d\'intervention créé : ' + name);
    await warnIfSaveFailed(await persist());
    renderTypesManagerModal();
  };
}

// ---- Modale : Ajouter un bien ----
function openAddPropertyModal(){
  var modal = document.getElementById('modal');
  var usedColor = PALETTE[state.order.length % PALETTE.length];

  modal.innerHTML =
    '<h3>Ajouter un bien <button class="icon-btn" id="closeModalBtn" aria-label="Fermer">✕</button></h3>' +
    '<div class="field"><label>Nom</label><input type="text" id="nv-name" placeholder="Ex : Maison, Studio de ma fille..."></div>' +
    '<div class="field"><label>Type de bien</label><select id="nv-propertytype">' +
      PROPERTY_TYPES.map(function(t){ return '<option value="' + t + '">' + t + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="field"><label>Adresse (facultatif)</label><input type="text" id="nv-address" placeholder="12 rue de la Paix, Ville"></div>' +
    '<div class="field"><label>Couleur</label><div class="swatches" id="nv-swatches"></div></div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" id="cancelBtn">Annuler</button>' +
      '<button class="btn btn-primary" id="createPropertyBtn">Créer</button>' +
    '</div>';

  var swatchWrap = document.getElementById('nv-swatches');
  PALETTE.forEach(function(c){
    var sw = document.createElement('div');
    sw.className = 'swatch' + (c === usedColor ? ' selected' : '');
    sw.style.background = c;
    sw.setAttribute('data-color', c);
    sw.onclick = function(){
      Array.prototype.forEach.call(swatchWrap.children, function(el){ el.classList.remove('selected'); });
      sw.classList.add('selected');
    };
    swatchWrap.appendChild(sw);
  });

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('closeModalBtn').onclick = closeModal;
  document.getElementById('cancelBtn').onclick = closeModal;

  document.getElementById('createPropertyBtn').onclick = async function(){
    var name = document.getElementById('nv-name').value.trim();
    if(!name){ await showAlert('Merci de donner un nom au bien.'); return; }

    var createBtn = document.getElementById('createPropertyBtn');
    createBtn.disabled = true; // évite un double-clic créant deux biens

    var selected = swatchWrap.querySelector('.swatch.selected');
    var color = selected ? selected.getAttribute('data-color') : usedColor;

    var id = genId('p');
    var allIds = state.types.map(function(t){ return t.id; });
    var property = makeProperty(name, color, allIds);
    property.ownerId = currentUser.id;
    property.propertyType = document.getElementById('nv-propertytype').value;
    property.address = document.getElementById('nv-address').value.trim();

    state.properties[id] = property;
    state.entries[id] = [];
    state.order.push(id);
    activePropertyId = id;

    logEvent(id, 'Bien créé');
    var saved = await persist();
    closeModal();
    render();
    await warnIfSaveFailed(saved);
  };
}

// Rassemble tous les chemins de stockage liés à un bien (documents du
// bien + factures/documents de chacune de ses interventions), pour
// pouvoir les supprimer du bucket avant de perdre toute référence à eux.
function collectPropertyStoragePaths(propertyId){
  var v = state.properties[propertyId];
  var paths = [];
  (v && v.documents || []).forEach(function(doc){ if(doc.path) paths.push(doc.path); });
  (state.entries[propertyId] || []).forEach(function(e){
    if(e.invoiceDoc && e.invoiceDoc.path) paths.push(e.invoiceDoc.path);
    (e.documents || []).forEach(function(doc){ if(doc.path) paths.push(doc.path); });
  });
  return paths;
}

async function deleteProperty(id){
  var v = state.properties[id];
  if(!v) return;
  var ok = await showConfirm('Supprimer "' + v.name + '" et tout son historique d\'entretien ? Cette action est définitive.', 'Supprimer');
  if(!ok) return;

  // Nettoyage du bucket Storage (documents bien + factures) et des accès
  // partagés, avant de perdre toute référence à ce bien dans `state`.
  // Ne bloque pas la suppression en cas d'échec (le bien doit disparaître
  // de toute façon) — les erreurs sont juste journalisées en console.
  var storagePaths = collectPropertyStoragePaths(id);
  try {
    if(storagePaths.length) await sb.storage.from(DOCS_BUCKET).remove(storagePaths);
  } catch(e){
    console.error('Erreur suppression des documents du bien dans le bucket:', e);
  }
  try {
    await sb.from('home_shares').delete().eq('property_id', id).eq('owner_id', currentUser.id);
  } catch(e){
    console.error('Erreur suppression des partages du bien:', e);
  }

  logEvent(id, 'Bien "' + v.name + '" supprimé');
  state.order = state.order.filter(function(x){ return x !== id; });
  delete state.properties[id];
  delete state.entries[id];
  delete state.sessions[id];
  delete state.plannedInterventions[id];
  activePropertyId = DASHBOARD_ID;

  var saved = await persist();
  closeModal();
  render();
  await warnIfSaveFailed(saved);
}

