// Ma Maison — suivi d'entretien de biens immobiliers.
// SUPABASE_KEY est la clé "publishable" (publique), jamais la clé secrète/service_role.
// La sécurité repose sur les règles RLS côté base (voir SUPABASE.md), pas sur le secret de cette clé.
var SUPABASE_URL = "https://fobqmyntdlhcepszkwuw.supabase.co";
var SUPABASE_KEY = "sb_publishable_sJ03uwVNlmaB1D-L9Z-sPQ_blLApFkM";

var PALETTE = ['#F0B429', '#E12D39', '#2EC4B6', '#3A86FF', '#8338EC', '#FF006E', '#00F5D4', '#FF9F1C'];

// Intervalles exprimés uniquement en mois.
var DEFAULT_TYPES = [
  { id: 'ramonage', label: 'Ramonage', months: 12, category: 'chauffage' },
  { id: 'entretien-pac', label: 'Entretien pompe à chaleur', months: 12, category: 'chauffage' },
  { id: 'entretien-chaudiere', label: 'Entretien chaudière', months: 12, category: 'chauffage' },
  { id: 'nettoyage-toiture', label: 'Nettoyage / démoussage toiture', months: 24, category: 'exterieur' },
  { id: 'nettoyage-facades', label: 'Nettoyage / ravalement façades', months: 60, category: 'exterieur' },
  { id: 'entretien-gouttieres', label: 'Entretien des gouttières', months: 12, category: 'exterieur' },
  { id: 'vidange-fosse', label: 'Vidange fosse septique', months: 48, category: 'assainissement' }
];

var PROPERTY_TYPES = ['Maison', 'Appartement', 'Local / autre'];

var HISTORY_CATEGORIES = [
  { id: 'chauffage', label: 'Chauffage' },
  { id: 'exterieur', label: 'Extérieur' },
  { id: 'assainissement', label: 'Assainissement' },
  { id: 'securite', label: 'Sécurité' },
  { id: 'interieur', label: 'Intérieur' },
  { id: 'autre', label: 'Autre' }
];

var DEFAULT_CHECKLIST_ITEMS = [
  // Extérieur
  { id: 'chk_toiture', label: 'État de la toiture (tuiles déplacées, mousses, fissures)', theme: 'Extérieur' },
  { id: 'chk_gouttieres', label: 'Gouttières et descentes propres, sans fuite', theme: 'Extérieur' },
  { id: 'chk_facades', label: 'Façades : fissures, humidité, enduit', theme: 'Extérieur' },
  { id: 'chk_menuiseries_ext', label: 'Volets, fenêtres, portes : état et fermeture', theme: 'Extérieur' },
  { id: 'chk_clotures', label: 'Clôtures, portail, boîte aux lettres', theme: 'Extérieur' },
  // Chauffage
  { id: 'chk_chaudiere', label: 'Chaudière / PAC : fonctionnement, pression, bruits anormaux', theme: 'Chauffage' },
  { id: 'chk_radiateurs', label: 'Radiateurs : purge, fuites', theme: 'Chauffage' },
  { id: 'chk_conduit', label: 'Conduit de cheminée / poêle : état et accès au ramonage', theme: 'Chauffage' },
  // Sécurité
  { id: 'chk_detecteurs', label: 'Détecteurs de fumée : test et piles', theme: 'Sécurité' },
  { id: 'chk_extincteur', label: 'Extincteur : date de validité, pression', theme: 'Sécurité' },
  { id: 'chk_tableau', label: 'Tableau électrique : disjoncteurs, différentiels (test)', theme: 'Sécurité' },
  { id: 'chk_serrures', label: 'Serrures et verrous', theme: 'Sécurité' },
  // Intérieur
  { id: 'chk_humidite', label: 'Traces d\'humidité, moisissures, infiltrations', theme: 'Intérieur' },
  { id: 'chk_vmc', label: 'VMC : bouches propres, ventilation fonctionnelle', theme: 'Intérieur' },
  { id: 'chk_plomberie', label: 'Robinets, joints, siphons : fuites', theme: 'Intérieur' },
  { id: 'chk_chauffe_eau', label: 'Chauffe-eau : groupe de sécurité, fuite, température', theme: 'Intérieur' },
  // Assainissement
  { id: 'chk_fosse', label: 'Fosse septique / assainissement : niveau, odeurs', theme: 'Assainissement' },
  { id: 'chk_regards', label: 'Regards et canalisations : accessibles et non obstrués', theme: 'Assainissement' }
];

var sb = null;
var cloudReady = false;
var currentUser = null;
var realtimeChannel = null;
var pendingEchoes = {}; // { 'table:id': expiration Date.now() } — voir markPendingEcho()/consumePendingEcho() dans data-sync-calc.js
var lastSyncErrorMessage = null;
var hasLoadedStateOnce = false;
var lastKnownUpdatedAt = null; // jeton de concurrence optimiste du miroir home_data
var convertingPlannedIntervention = null; // { propertyId, id }

var state = {
  properties: {},
  entries: {},
  order: [],
  types: DEFAULT_TYPES.slice(),
  journal: [],
  plannedInterventions: {},
  sessions: {},
  checklistItems: DEFAULT_CHECKLIST_ITEMS.slice()
};

var activePropertyId = null;
var DASHBOARD_ID = '__dashboard__';
var editingEntryId = null;

// Filtres de l'historique (affichage uniquement, non persisté).
var historyFilters = { category: 'all', provider: '', search: '', invoiceOnly: false, dateFrom: '', dateTo: '' };
var historyFiltersPropertyId = null;
var gaugesSectionCollapsed = {};
var costChartYears = {};
var costsSectionCollapsed = {};
var historySectionCollapsed = {};

function matchesHistoryFilters(entry, typeLabel, category){
  if(historyFilters.category !== 'all' && category !== historyFilters.category) return false;
  if(historyFilters.invoiceOnly && !entry.invoiceDoc) return false;
  if(historyFilters.dateFrom && entry.date < historyFilters.dateFrom) return false;
  if(historyFilters.dateTo && entry.date > historyFilters.dateTo) return false;
  if(historyFilters.provider){
    var g = (entry.provider || '').toLowerCase();
    if(g.indexOf(historyFilters.provider.toLowerCase()) === -1) return false;
  }
  if(historyFilters.search){
    var s = historyFilters.search.toLowerCase();
    var haystack = (typeLabel + ' ' + (entry.notes || '') + ' ' + (entry.provider || '')).toLowerCase();
    if(haystack.indexOf(s) === -1) return false;
  }
  return true;
}

function hasActiveHistoryFilters(){
  return historyFilters.category !== 'all' || historyFilters.provider || historyFilters.search ||
    historyFilters.invoiceOnly || historyFilters.dateFrom || historyFilters.dateTo;
}

function initCloud(){
  if(window.supabase && SUPABASE_URL.indexOf('VOTRE_SUPABASE') === -1){
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      cloudReady = true;
    } catch(e) {
      console.error("Erreur d'initialisation Supabase", e);
    }
  }
}
