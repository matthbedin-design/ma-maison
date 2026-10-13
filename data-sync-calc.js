// ---- Modèle & Helpers ----
function makeProperty(name, color, enabledTypes){
  return {
    name: name,
    address: '',
    propertyType: 'Maison',
    color: color,
    documents: [],
    enabledTypes: enabledTypes || DEFAULT_TYPES.map(function(t){ return t.id; }),
    intervals: {}
  };
}

function logEvent(propertyId, message){
  var propertyName = null;
  if(propertyId && state.properties[propertyId]){
    propertyName = state.properties[propertyId].name;
  }
  state.journal.push({
    id: genId('j'),
    ts: new Date().toISOString(),
    propertyId: propertyId || null,
    propertyName: propertyName,
    message: message
  });
  // Garde-fou : évite une croissance non bornée du journal sur plusieurs années
  // d'usage (le JSON reste léger même après des centaines d'actions).
  var JOURNAL_MAX = 300;
  if(state.journal.length > JOURNAL_MAX){
    state.journal = state.journal.slice(state.journal.length - JOURNAL_MAX);
  }
}

// ---- Persistance & Auth Cloud ----
function setSyncStatus(mode, detail){
  var el = document.getElementById('syncStatus');
  var label = document.getElementById('syncStatusLabel');
  if(!el || !label) return;

  if(mode === 'off'){
    el.style.display = 'none';
    return;
  }

  el.style.display = 'flex';
  el.className = 'sync-status ' + mode;
  if(mode === 'saving') label.textContent = 'Sauvegarde…';
  else if(mode === 'synced') label.textContent = 'Synchronisé';
  else if(mode === 'error') label.textContent = detail || 'Erreur de connexion';
}

// ============================================================================
// ÉTAPE 1 — MODÈLE NORMALISÉ
// ============================================================================
// L'état en mémoire (`state`) garde exactement la même forme qu'avant (objet
// `properties` par id, `entries` par propertyId, etc.) pour que tout le reste du
// code (render.js, entry-modal.js, property-modals.js, checklist-sessions.js)
// continue de fonctionner sans modification. Ce qui change : `loadState()` et
// `persist()` lisent/écrivent désormais dans des tables normalisées
// (properties, entries, sessions, planned_interventions, home_settings) au lieu
// d'un unique blob JSON — c'est ce qui permettra le partage par bien à
// l'étape 2.
//
// `home_data` (l'ancien blob JSON) continue d'être écrit en parallèle, en
// miroir, uniquement pour préserver le système de sauvegardes/versioning
// existant (table home_data_history + trigger d'archivage). Il n'est plus
// utilisé pour charger l'application.

// Dernier instantané connu comme synchronisé, pour ne pousser vers Supabase
// que ce qui a réellement changé plutôt que de tout réécrire à chaque sauvegarde.
var lastSynced = { properties: {}, entries: {}, sessions: {}, planned: {} };

function snapshotCurrent(){
  return {
    properties: JSON.parse(JSON.stringify(state.properties || {})),
    entries: JSON.parse(JSON.stringify(state.entries || {})),
    sessions: JSON.parse(JSON.stringify(state.sessions || {})),
    planned: JSON.parse(JSON.stringify(state.plannedInterventions || {}))
  };
}

function propertyRow(id, p, sortOrder){
  return {
    id: id,
    // Le propriétaire réel est conservé (chargé depuis la base via p.ownerId) ;
    // ne retombe sur l'utilisateur courant que pour un bien tout juste créé localement.
    owner_id: p.ownerId || currentUser.id,
    name: p.name, address: p.address || '', property_type: p.propertyType || 'Maison',
    color: p.color || '',
    enabled_types: p.enabledTypes || [], intervals: p.intervals || {},
    documents: p.documents || [],
    sort_order: sortOrder
  };
}

function entryRow(id, propertyId, e){
  return {
    id: id,
    property_id: propertyId,
    type_id: e.typeId,
    date: e.date || null,
    cost: (e.cost != null ? e.cost : null),
    notes: e.notes || '',
    provider: e.provider || null,
    invoice_doc: e.invoiceDoc || null,
    batch_id: e.batchId || null,
    created_at: e.createdAt || new Date().toISOString(),
    updated_at: e.updatedAt || null,
    session_id: e.sessionId || null,
    created_by: e.createdBy || currentUser.id
  };
}

function sessionRow(id, propertyId, s){
  return { id: id, property_id: propertyId, data: s, status: s.status || null, created_by: s.createdBy || currentUser.id };
}

function plannedRow(id, propertyId, p){
  return {
    id: id, property_id: propertyId, label: p.label || '', notes: p.notes || '',
    created_at: p.createdAt || new Date().toISOString(),
    source_session_id: p.sourceSessionId || null,
    source_item_id: p.sourceItemId || null,
    created_by: p.createdBy || currentUser.id
  };
}

// Compare l'état courant au dernier instantané synchronisé et construit la
// liste des upserts/suppressions à effectuer, table par table.
function buildSyncOps(){
  var ops = {
    propertiesUpsert: [], propertiesDelete: [],
    entriesUpsert: [], entriesDelete: [],
    sessionsUpsert: [], sessionsDelete: [],
    plannedUpsert: [], plannedDelete: []
  };

  // Biens (l'ordre d'affichage vient de state.order)
  var order = (state.order && state.order.length) ? state.order : Object.keys(state.properties || {});
  order.forEach(function(id, idx){
    var v = state.properties[id];
    if(!v) return;
    var row = propertyRow(id, v, idx);
    // On compare la ligne complète (v + position dans `order`), pas juste v,
    // pour détecter aussi un simple changement d'ordre d'affichage.
    var prevRow = lastSynced._propertyRows && lastSynced._propertyRows[id];
    if(!prevRow || JSON.stringify(prevRow) !== JSON.stringify(row)) ops.propertiesUpsert.push(row);
  });
  Object.keys(lastSynced.properties).forEach(function(id){
    if(!state.properties[id]) ops.propertiesDelete.push(id);
  });

  // Entrées
  var currentEntryIds = {};
  Object.keys(state.entries || {}).forEach(function(propertyId){
    (state.entries[propertyId] || []).forEach(function(e){
      currentEntryIds[e.id] = true;
      var row = entryRow(e.id, propertyId, e);
      var prev = lastSynced._entryRows && lastSynced._entryRows[e.id];
      if(!prev || JSON.stringify(prev) !== JSON.stringify(row)) ops.entriesUpsert.push(row);
    });
  });
  Object.keys(lastSynced.entries || {}).forEach(function(propertyId){
    (lastSynced.entries[propertyId] || []).forEach(function(e){
      if(!currentEntryIds[e.id]) ops.entriesDelete.push(e.id);
    });
  });

  // Sessions
  var currentSessionIds = {};
  Object.keys(state.sessions || {}).forEach(function(propertyId){
    (state.sessions[propertyId] || []).forEach(function(s){
      currentSessionIds[s.id] = true;
      var row = sessionRow(s.id, propertyId, s);
      var prev = lastSynced._sessionRows && lastSynced._sessionRows[s.id];
      if(!prev || JSON.stringify(prev) !== JSON.stringify(row)) ops.sessionsUpsert.push(row);
    });
  });
  Object.keys(lastSynced.sessions || {}).forEach(function(propertyId){
    (lastSynced.sessions[propertyId] || []).forEach(function(s){
      if(!currentSessionIds[s.id]) ops.sessionsDelete.push(s.id);
    });
  });

  // Interventions à prévoir
  var currentPlannedIds = {};
  Object.keys(state.plannedInterventions || {}).forEach(function(propertyId){
    (state.plannedInterventions[propertyId] || []).forEach(function(p){
      currentPlannedIds[p.id] = true;
      var row = plannedRow(p.id, propertyId, p);
      var prev = lastSynced._plannedRows && lastSynced._plannedRows[p.id];
      if(!prev || JSON.stringify(prev) !== JSON.stringify(row)) ops.plannedUpsert.push(row);
    });
  });
  Object.keys(lastSynced.planned || {}).forEach(function(propertyId){
    (lastSynced.planned[propertyId] || []).forEach(function(p){
      if(!currentPlannedIds[p.id]) ops.plannedDelete.push(p.id);
    });
  });

  return ops;
}

// Instantané enrichi : on garde aussi les "rows" telles qu'envoyées à Supabase
// (et pas seulement les objets d'état) pour pouvoir comparer à l'identique au
// prochain appel, sort_order et champs dérivés inclus.
function refreshLastSynced(){
  var snap = snapshotCurrent();
  snap._propertyRows = {};
  var order = (state.order && state.order.length) ? state.order : Object.keys(state.properties || {});
  order.forEach(function(id, idx){
    var v = state.properties[id];
    if(v) snap._propertyRows[id] = propertyRow(id, v, idx);
  });
  snap._entryRows = {};
  Object.keys(state.entries || {}).forEach(function(propertyId){
    (state.entries[propertyId] || []).forEach(function(e){
      snap._entryRows[e.id] = entryRow(e.id, propertyId, e);
    });
  });
  snap._sessionRows = {};
  Object.keys(state.sessions || {}).forEach(function(propertyId){
    (state.sessions[propertyId] || []).forEach(function(s){
      snap._sessionRows[s.id] = sessionRow(s.id, propertyId, s);
    });
  });
  snap._plannedRows = {};
  Object.keys(state.plannedInterventions || {}).forEach(function(propertyId){
    (state.plannedInterventions[propertyId] || []).forEach(function(p){
      snap._plannedRows[p.id] = plannedRow(p.id, propertyId, p);
    });
  });
  lastSynced = snap;
}

// Écho de nos propres écritures : quand applySyncOps() envoie une ligne à
// Supabase, on l'enregistre ici (clé "table:id") avec une expiration courte.
// Quand l'événement realtime correspondant à cette même ligne revient, on le
// reconnaît comme notre propre écho et on l'ignore — sans bloquer, comme le
// faisait l'ancien flag global `isWriting`, les événements sur les *autres*
// lignes pendant ce temps, ni un deuxième événement ultérieur sur cette même
// ligne (qui, lui, correspond à un vrai changement externe et déclenche
// normalement un rechargement).
var PENDING_ECHO_TTL_MS = 8000;

function markPendingEcho(table, id){
  pendingEchoes[table + ':' + id] = Date.now() + PENDING_ECHO_TTL_MS;
  sweepExpiredEchoes();
}

// Purge occasionnelle des attentes jamais consommées (écriture qui échoue,
// événement jamais reçu...) pour ne pas accumuler indéfiniment de clés sur
// une session très longue. Coût négligeable : appelée uniquement lors d'un
// nouvel enregistrement, sur un objet qui reste petit en pratique.
function sweepExpiredEchoes(){
  var now = Date.now();
  Object.keys(pendingEchoes).forEach(function(key){
    if(pendingEchoes[key] < now) delete pendingEchoes[key];
  });
}

// Renvoie true si cet événement correspond à une écriture locale récente
// (et "consomme" l'attente : un futur événement sur la même ligne ne sera
// plus jamais traité comme un écho, y compris s'il arrive avant l'expiration).
function consumePendingEcho(table, id){
  var key = table + ':' + id;
  var expiresAt = pendingEchoes[key];
  if(expiresAt === undefined) return false;
  delete pendingEchoes[key];
  return expiresAt >= Date.now();
}

async function applySyncOps(ops){
  var tasks = [];
  if(ops.propertiesUpsert.length){ ops.propertiesUpsert.forEach(function(r){ markPendingEcho('properties', r.id); }); tasks.push(sb.from('properties').upsert(ops.propertiesUpsert)); }
  if(ops.propertiesDelete.length){ ops.propertiesDelete.forEach(function(id){ markPendingEcho('properties', id); }); tasks.push(sb.from('properties').delete().in('id', ops.propertiesDelete)); }
  if(ops.entriesUpsert.length){ ops.entriesUpsert.forEach(function(r){ markPendingEcho('home_entries', r.id); }); tasks.push(sb.from('home_entries').upsert(ops.entriesUpsert)); }
  if(ops.entriesDelete.length){ ops.entriesDelete.forEach(function(id){ markPendingEcho('home_entries', id); }); tasks.push(sb.from('home_entries').delete().in('id', ops.entriesDelete)); }
  if(ops.sessionsUpsert.length){ ops.sessionsUpsert.forEach(function(r){ markPendingEcho('home_sessions', r.id); }); tasks.push(sb.from('home_sessions').upsert(ops.sessionsUpsert)); }
  if(ops.sessionsDelete.length){ ops.sessionsDelete.forEach(function(id){ markPendingEcho('home_sessions', id); }); tasks.push(sb.from('home_sessions').delete().in('id', ops.sessionsDelete)); }
  if(ops.plannedUpsert.length){ ops.plannedUpsert.forEach(function(r){ markPendingEcho('home_planned_interventions', r.id); }); tasks.push(sb.from('home_planned_interventions').upsert(ops.plannedUpsert)); }
  if(ops.plannedDelete.length){ ops.plannedDelete.forEach(function(id){ markPendingEcho('home_planned_interventions', id); }); tasks.push(sb.from('home_planned_interventions').delete().in('id', ops.plannedDelete)); }

  // Journal : reste propre à chaque utilisateur, jamais partagé.
  tasks.push(sb.from('home_settings').upsert({
    user_id: currentUser.id,
    journal: state.journal || [],
    updated_at: new Date().toISOString()
  }));

  // Types d'intervention + checklist : table partagée entre tous les comptes
  // (voir shared_settings) — un type créé par un compte doit rester visible
  // par toute personne à qui un bien est partagé.
  markPendingEcho('shared_settings', 'default');
  tasks.push(sb.from('shared_settings').upsert({
    id: 'default',
    home_types: state.types || [],
    home_checklist_items: state.checklistItems || [],
    updated_at: new Date().toISOString()
  }));

  var results = await Promise.all(tasks);
  var errors = results.map(function(r){ return r.error; }).filter(Boolean);
  if(errors.length){
    // On journalise CHAQUE échec (avant, seule la première erreur du lot était
    // visible, les autres disparaissaient silencieusement) et on les combine
    // dans une seule erreur : describeSyncError() lira son .message pour le
    // cas générique, et son .code (celui de la première erreur) pour détecter
    // les cas réseau/session expirée/RLS déjà gérés.
    errors.forEach(function(err){ console.error('Erreur synchronisation (une opération du lot) :', err); });
    var combined = new Error(errors.map(function(e){ return e.message; }).join(' | '));
    combined.code = errors[0].code;
    throw combined;
  }
}

async function persist(){
  if(!cloudReady || !currentUser){
    console.error('persist() appelé sans session cloud active — sauvegarde ignorée.');
    setSyncStatus('error', 'Non connecté — sauvegarde impossible');
    return false;
  }

  setSyncStatus('saving');
  try {
    var ops = buildSyncOps();
    await applySyncOps(ops);
    refreshLastSynced();

    // Miroir de l'état complet dans home_data : sert uniquement à préserver le
    // système de sauvegardes/versioning existant (table home_data_history,
    // archivée via un trigger sur cette table). Ce n'est plus la source
    // utilisée pour charger l'application (voir loadState) — un échec ici
    // n'est donc pas bloquant, les tables normalisées ci-dessus font foi.
    var nowIso = new Date().toISOString();
    var payload = { user_id: currentUser.id, state: state, updated_at: nowIso };
    var res;
    if(lastKnownUpdatedAt === null){
      res = await sb.from('home_data').upsert(payload, { onConflict: 'user_id' }).select('updated_at').single();
    } else {
      res = await sb.from('home_data').update({ state: state, updated_at: nowIso })
        .eq('user_id', currentUser.id).eq('updated_at', lastKnownUpdatedAt)
        .select('updated_at').single();
    }
    if(res.error){
      if(res.error.code === 'PGRST116'){
        // Une autre session a écrit le miroir entre-temps : sans gravité, les
        // tables normalisées viennent d'être sauvegardées avec succès
        // ci-dessus. On rafraîchit juste le jeton de concurrence.
        var latest = await sb.from('home_data').select('updated_at').eq('user_id', currentUser.id).single();
        if(latest.data) lastKnownUpdatedAt = latest.data.updated_at;
      } else {
        console.error('Erreur miroir home_data (sauvegardes/historique) :', res.error);
      }
    } else {
      lastKnownUpdatedAt = res.data.updated_at;
    }

    setSyncStatus('synced');
    lastSyncErrorMessage = null;
    return true;
  } catch(e) {
    console.error('Exception sauvegarde cloud:', e);
    lastSyncErrorMessage = describeSyncError(e);
    setSyncStatus('error', shortSyncErrorLabel(e));
    return false;
  }
}

// ============================================================================
// ÉTAPE 2 — PARTAGE PAR VÉHICULE
// ============================================================================
// Rôle de l'utilisateur courant sur chaque bien non-possédé (chargé dans
// loadState depuis home_shares). Les biens possédés n'ont pas besoin
// d'entrée ici : isOwner() suffit.
var myPropertyRoles = {};
var myAccessExpiresAt = {};  // { propertyId: expires_at ou null } — mon propre accès, si je suis invité (pas owner)
var mySharesByProperty = {};  // { propertyId: [{role, status, expiresAt}, ...] } — les partages que j'ai créés en tant que owner

function isOwner(propertyId){
  var v = state.properties[propertyId];
  return !!(v && v.ownerId === currentUser.id);
}

function getPropertyRole(propertyId){
  if(isOwner(propertyId)) return 'owner';
  return myPropertyRoles[propertyId] || null; // null = pas d'accès (ne devrait pas arriver si RLS a livré le bien)
}

// Éditeur ou propriétaire : peut modifier les réglages du bien, ajouter/
// modifier des interventions, gérer les fiches de vérification.
function canEditProperty(propertyId){
  var r = getPropertyRole(propertyId);
  return r === 'owner' || r === 'editor';
}

// Propriétaire, éditeur ou contributeur : peut ajouter des interventions, des
// fiches de vérification et des interventions à prévoir — mais pas modifier
// les réglages du bien ni les interventions déjà enregistrées par d'autres.
function canContribute(propertyId){
  var r = getPropertyRole(propertyId);
  return r === 'owner' || r === 'editor' || r === 'contributor';
}

// Récupère les invitations de partage en attente correspondant à l'email du
// compte connecté et les active. Autorisé par la policy RLS "shares_self_claim"
// (l'utilisateur ne peut s'attribuer que les partages dont l'email vérifié par
// Supabase correspond au sien).
async function claimPendingShares(){
  if(!currentUser || !currentUser.email) return;
  try {
    var pending = await sb.from('home_shares').select('id')
      .eq('status', 'pending').ilike('invited_email', currentUser.email);
    if(pending.error || !pending.data || !pending.data.length) return;
    for(var i = 0; i < pending.data.length; i++){
      await sb.from('home_shares')
        .update({ shared_with_user_id: currentUser.id, status: 'active' })
        .eq('id', pending.data[i].id);
    }
  } catch(e){
    console.error('Erreur lors de la réclamation des invitations en attente:', e);
  }
}

async function loadState(){
  if(!cloudReady || !currentUser){
    console.error('loadState() appelé sans session cloud active.');
    setSyncStatus('error', 'Non connecté — impossible de charger les données');
    return;
  }

  try {
    // Récupère les invitations de partage en attente correspondant à l'email
    // du compte qui vient de se connecter, et les active — pour que les
    // biens partagés apparaissent dès ce chargement.
    await claimPendingShares();

    var results = await Promise.all([
      sb.from('properties').select('*').order('sort_order', { ascending: true }),
      sb.from('home_entries').select('*'),
      sb.from('home_sessions').select('*'),
      sb.from('home_planned_interventions').select('*'),
      sb.from('home_settings').select('*').eq('user_id', currentUser.id).maybeSingle(),
      sb.from('home_shares').select('property_id, role, expires_at').eq('shared_with_user_id', currentUser.id).eq('status', 'active'),
      sb.from('shared_settings').select('*').eq('id', 'default').maybeSingle(),
      sb.from('home_shares').select('property_id, role, status, expires_at').eq('owner_id', currentUser.id)
    ]);
    var vehRes = results[0], entRes = results[1], sesRes = results[2], planRes = results[3], settRes = results[4], sharesRes = results[5], sharedSettRes = results[6], myOwnedSharesRes = results[7];

    var errors = results.map(function(r){ return r.error; }).filter(Boolean);
    if(errors.length){
      errors.forEach(function(err){ console.error('Erreur chargement (une requête du lot) :', err); });
      var combinedLoadErr = new Error(errors.map(function(e){ return e.message; }).join(' | '));
      combinedLoadErr.code = errors[0].code;
      throw combinedLoadErr;
    }

    myPropertyRoles = {};
    myAccessExpiresAt = {};
    (sharesRes.data || []).forEach(function(row){
      myPropertyRoles[row.property_id] = row.role;
      myAccessExpiresAt[row.property_id] = row.expires_at || null;
    });

    mySharesByProperty = {};
    (myOwnedSharesRes.data || []).forEach(function(row){
      if(!mySharesByProperty[row.property_id]) mySharesByProperty[row.property_id] = [];
      mySharesByProperty[row.property_id].push({ role: row.role, status: row.status, expiresAt: row.expires_at || null });
    });

    var properties = {}, order = [];
    (vehRes.data || []).forEach(function(row){
      properties[row.id] = {
        ownerId: row.owner_id,
        name: row.name, address: row.address || '', propertyType: row.property_type || 'Maison',
        color: row.color, enabledTypes: row.enabled_types || [],
        intervals: row.intervals || {}, documents: row.documents || []
      };
      order.push(row.id);
    });

    var entries = {};
    (entRes.data || []).forEach(function(row){
      if(!entries[row.property_id]) entries[row.property_id] = [];
      var e = {
        id: row.id, typeId: row.type_id, date: row.date,
        cost: row.cost, notes: row.notes,
        provider: row.provider,
        invoiceDoc: row.invoice_doc, batchId: row.batch_id,
        createdAt: row.created_at, updatedAt: row.updated_at,
        sessionId: row.session_id, createdBy: row.created_by
      };
      if(!e.invoiceDoc) delete e.invoiceDoc;
      entries[row.property_id].push(e);
    });

    var sessions = {};
    (sesRes.data || []).forEach(function(row){
      if(!sessions[row.property_id]) sessions[row.property_id] = [];
      var s = Object.assign({}, row.data, { id: row.id, createdBy: row.created_by });
      sessions[row.property_id].push(s);
    });

    var planned = {};
    (planRes.data || []).forEach(function(row){
      if(!planned[row.property_id]) planned[row.property_id] = [];
      planned[row.property_id].push({
        id: row.id, label: row.label, notes: row.notes,
        createdAt: row.created_at,
        sourceSessionId: row.source_session_id,
        sourceItemId: row.source_item_id,
        createdBy: row.created_by
      });
    });

    var settings = settRes.data || {};
    var sharedSettings = sharedSettRes.data || {};

    state = {
      properties: properties,
      entries: entries,
      order: order,
      // types/checklistItems viennent maintenant de `shared_settings` (table
      // commune à tous les comptes, pas propre à l'utilisateur connecté) —
      // sinon un type créé par un compte (ex: "Liquide de frein") devient
      // invisible pour toute personne à qui un bien est partagé, alors
      // que le bien lui-même l'est bien.
      types: (sharedSettings.home_types && sharedSettings.home_types.length) ? sharedSettings.home_types : DEFAULT_TYPES.slice(),
      journal: settings.journal || [],
      plannedInterventions: planned,
      sessions: sessions,
      checklistItems: (sharedSettings.home_checklist_items && sharedSettings.home_checklist_items.length) ? sharedSettings.home_checklist_items : DEFAULT_CHECKLIST_ITEMS.slice()
    };

    refreshLastSynced();

    // Récupère le jeton de concurrence du miroir home_data (utilisé par
    // persist()/sauvegardes), sans s'en servir pour charger les données.
    var mirror = await sb.from('home_data').select('updated_at').eq('user_id', currentUser.id).maybeSingle();
    lastKnownUpdatedAt = mirror.data ? mirror.data.updated_at : null;
    if(!mirror.data){
      // Première synchro sous le nouveau schéma : initialise le miroir pour
      // que le système de sauvegardes/historique s'active dès maintenant.
      await persist();
    }

    subscribeRealtime();
    setSyncStatus('synced');
    lastSyncErrorMessage = null;
    hasLoadedStateOnce = true;
  } catch(e) {
    console.error('Erreur chargement cloud:', e);
    lastSyncErrorMessage = describeSyncError(e);
    setSyncStatus('error', shortSyncErrorLabel(e));
    // Ne réinitialise l'état à vide que si on n'a JAMAIS réussi à charger les
    // vraies données : un rechargement raté après coup (ex : déclenché par
    // Realtime suite à un blip réseau) ne doit pas effacer ce qui est déjà
    // affiché à l'écran — l'utilisateur verrait ses biens disparaître
    // comme si les données avaient été perdues, alors qu'il s'agit juste
    // d'un échec de rechargement.
    if(!hasLoadedStateOnce) initDefaultState();
  }

  normalizeState();
  render();
}

// Comble les champs manquants sur `state` avec des valeurs par défaut sûres.
// À appeler après tout chargement d'un état venant de l'extérieur — chargement
// cloud normal, mais aussi restauration d'une sauvegarde (restoreBackup) :
// une sauvegarde archivée avant l'ajout d'une fonctionnalité (checklist,
// sessions, interventions à prévoir...) peut ne pas contenir ces champs, et
// le reste du code (render.js, checklist-sessions.js) suppose qu'ils
// existent toujours.
function normalizeState(){
  if(!state.types || !state.types.length) state.types = DEFAULT_TYPES.slice();
  if(!state.journal) state.journal = [];
  if(!state.order) state.order = [];
  if(!state.properties) state.properties = {};
  if(!state.entries) state.entries = {};
  if(!state.checklistItems || !state.checklistItems.length){
    state.checklistItems = DEFAULT_CHECKLIST_ITEMS.slice();
  } else {
    // Fusionne les nouveaux points de vérification par défaut ajoutés depuis la
    // dernière visite, sans écraser ni supprimer ceux déjà personnalisés.
    var existingChecklistIds = {};
    state.checklistItems.forEach(function(c){ existingChecklistIds[c.id] = true; });
    DEFAULT_CHECKLIST_ITEMS.forEach(function(c){
      if(!existingChecklistIds[c.id]) state.checklistItems.push(c);
    });
  }
  if(!state.sessions) state.sessions = {};
  if(!state.plannedInterventions) state.plannedInterventions = {};

  if(!activePropertyId){
    activePropertyId = DASHBOARD_ID;
  }
}

function initDefaultState(){
  // L'app démarre vide : aucune donnée de démo n'est pré-remplie.
  // L'utilisateur ajoute ses propres biens via le bouton "+ Nouveau bien".
  state = {
    properties: {},
    entries: {},
    order: [],
    types: DEFAULT_TYPES.slice(),
    journal: [],
    plannedInterventions: {},
    sessions: {},
    checklistItems: DEFAULT_CHECKLIST_ITEMS.slice()
  };
}

async function signInEmail(){
  var email = document.getElementById('emailInput').value.trim();
  var statusEl = document.getElementById('authStatus');
  if(!email){ if(statusEl) statusEl.innerText = 'Merci de saisir un e-mail.'; return; }
  
  if(statusEl) statusEl.innerText = 'Envoi du lien...';
  // On force explicitement l'URL de redirection vers la page actuelle (plutôt que de
  // dépendre uniquement de la "Site URL" configurée dans le dashboard Supabase), pour
  // éviter tout mauvais aiguillage si ce réglage est absent ou incorrect.
  var redirectTo = window.location.origin + window.location.pathname;
  var res = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectTo } });
  if(res.error){
    if(statusEl) statusEl.innerText = 'Erreur : ' + res.error.message;
  } else {
    if(statusEl) statusEl.innerText = 'Lien magique envoyé ! Vérifiez vos e-mails.';
  }
}

// ---- Bascule entre connexion par lien magique et par mot de passe ----
var authMode = 'magiclink'; // 'magiclink' ou 'password'

function setAuthMode(mode){
  authMode = mode;
  var passwordField = document.getElementById('passwordField');
  var toggle = document.getElementById('authModeToggle');
  var loginBtn = document.getElementById('emailLoginBtn');
  var statusEl = document.getElementById('authStatus');
  if(!passwordField || !toggle || !loginBtn) return;

  if(mode === 'password'){
    passwordField.style.display = 'block';
    toggle.textContent = 'Se connecter avec un lien magique';
    loginBtn.textContent = 'Se connecter';
  } else {
    passwordField.style.display = 'none';
    loginBtn.textContent = 'Se connecter';
    toggle.textContent = 'Se connecter avec un mot de passe';
  }
  if(statusEl) statusEl.innerText = '';
}

async function signInWithPassword(){
  var email = document.getElementById('emailInput').value.trim();
  var password = document.getElementById('passwordInput').value;
  var statusEl = document.getElementById('authStatus');
  if(!email || !password){
    if(statusEl) statusEl.innerText = 'Merci de saisir l\'e-mail et le mot de passe.';
    return;
  }
  if(statusEl) statusEl.innerText = 'Connexion...';
  var res = await sb.auth.signInWithPassword({ email: email, password: password });
  if(res.error){
    if(statusEl) statusEl.innerText = 'Erreur : ' + res.error.message;
  }
  // Si succès, onAuthStateChange (dans journal-backups-init.js) prend le relais
  // et masque l'overlay automatiquement — rien d'autre à faire ici.
}

// ---- Synchro en temps réel ----
// Écoute les changements sur les tables normalisées : quand une saisie est
// faite depuis un autre appareil, on recharge l'état et on redessine
// automatiquement, sans avoir besoin de recharger la page. Le filtrage des
// lignes visibles est assuré par les policies RLS de chaque table (un
// utilisateur ne reçoit que les événements sur ses propres biens, et à
// l'étape 2, ceux qui lui sont partagés).
//
// Chaque événement est d'abord comparé à `pendingEchoes` (voir plus haut) :
// s'il correspond à une écriture qu'on vient d'envoyer nous-mêmes sur cette
// ligne précise, on l'ignore ; sinon, c'est un changement externe réel et on
// recharge. Contrairement à l'ancien flag global `isWriting`, ça ne bloque
// jamais les changements sur d'autres lignes pendant qu'on écrit, et ça ne
// rate jamais un deuxième changement sur la même ligne survenant juste après
// notre propre écriture.
function makeRealtimeHandler(table, reload){
  return function(payload){
    var row = (payload.new && Object.keys(payload.new).length) ? payload.new : payload.old;
    var id = row && row.id;
    if(id && consumePendingEcho(table, id)) return;
    reload();
  };
}

function subscribeRealtime(){
  if(!cloudReady || !currentUser || !sb) return;

  // Évite les abonnements en doublon si onAuthStateChange se déclenche plusieurs fois
  if(realtimeChannel){
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  var reload = debounce(function(){ loadState(); }, 400);

  realtimeChannel = sb
    .channel('maison_changes_' + currentUser.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, makeRealtimeHandler('properties', reload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'home_entries' }, makeRealtimeHandler('home_entries', reload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'home_sessions' }, makeRealtimeHandler('home_sessions', reload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'home_planned_interventions' }, makeRealtimeHandler('home_planned_interventions', reload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_settings' }, makeRealtimeHandler('shared_settings', reload))
    // home_shares : pas de suivi d'écho dédié (les écritures s'y font
    // directement depuis property-modals.js, hors persist()/applySyncOps) —
    // une action de partage qu'on fait soi-même déclenche donc un
    // rechargement complet redondant mais inoffensif, plutôt qu'un vrai bug.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'home_shares' }, reload)
    .subscribe();
}

function unsubscribeRealtime(){
  if(realtimeChannel && sb){
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

async function signOutCloud(){
  unsubscribeRealtime();
  if(sb) await sb.auth.signOut();
  currentUser = null;
  lastKnownUpdatedAt = null;
  var authEl = document.getElementById('authOverlay');
  if(authEl) authEl.style.display = 'flex';
}

// ---- Calculs des échéances ----
function getTypeConfig(property, typeId){
  var globalType = state.types.filter(function(t){ return t.id === typeId; })[0];
  if(!globalType) return null;
  var custom = (property.intervals && property.intervals[typeId]) || {};
  return {
    id: globalType.id,
    label: globalType.label,
    category: globalType.category,
    months: custom.months !== undefined ? custom.months : globalType.months,
    // Seuil de rappel personnalisable par type (nombre de jours avant l'échéance)
    reminderDays: (globalType.reminderDays != null) ? globalType.reminderDays : 30
  };
}

function getLatestEntry(propertyId, typeId){
  var list = state.entries[propertyId] || [];
  var filtered = list.filter(function(e){ return e.typeId === typeId; });
  if(!filtered.length) return null;
  filtered.sort(function(a,b){
    if(a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
  });
  return filtered[0];
}

function computeStatus(propertyId, typeId){
  var p = state.properties[propertyId];
  if(!p) return null;
  var cfg = getTypeConfig(p, typeId);
  if(!cfg) return null;

  var last = getLatestEntry(propertyId, typeId);

  var result = {
    cfg: cfg,
    last: last,
    pct: 0,
    nextDueIso: null,
    remainingDays: null,
    isOverdue: false,
    isWarning: false
  };

  if(!last) return result;

  if(cfg.months && cfg.months > 0 && last.date){
    var lastDate = new Date(last.date);
    var nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + cfg.months);
    result.nextDueIso = nextDate.toISOString().slice(0, 10);

    var now = new Date();
    var diffMs = nextDate - now;
    result.remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    var totalDays = cfg.months * 30.4375;
    var doneDays = totalDays - result.remainingDays;
    result.pct = Math.min(100, Math.max(0, (doneDays / totalDays) * 100));

    if(result.remainingDays <= 0) result.isOverdue = true;
    else if(result.remainingDays <= cfg.reminderDays) result.isWarning = true;
  }

  return result;
}
