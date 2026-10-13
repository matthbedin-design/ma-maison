# ma-maison — Carnet d'entretien du logement

Application web (PWA) sœur de mon-garage : suivi des entretiens récurrents d'un ou plusieurs biens
(ramonage, PAC, chaudière, toiture, façades, gouttières, fosse septique...), historique, fiche de
vérification annuelle avec conversion d'anomalie en « intervention à prévoir », coûts, exports
CSV/PDF/dossier du bien, partage par bien (lecture / contributeur / édition, expiration possible).

## Principes
- Code autonome (dépôt GitHub séparé), 100 % statique, aucun build. Scripts chargés dans l'ordre par `index.html`.
- Même projet Supabase que mon-garage, tables préfixées `home_*` (+ `properties`). Aucune donnée garage n'est touchée.
- Périodicités en **mois** uniquement. Types d'entretien et checklist partagés (`shared_settings.home_types` / `home_checklist_items`).
- Journal par utilisateur : `home_settings` (distinct de `user_settings` de mon-garage).
- Sauvegardes : miroir JSON `home_data` + historique `home_data_history`.
- Documents : bucket privé `home-documents` (à créer, mêmes règles que `vehicle-documents` : JPEG/PDF, taille limitée, chemins `userId/propertyId/...`).

## Mise en service
1. Exécuter `correctifs-schema.sql` dans Supabase (SQL Editor).
2. Vérifier que le bucket `home-documents` existe (privé) avec ses policies Storage.
3. Auth > URL Configuration : ajouter l'URL de la nouvelle appli dans « Redirect URLs ».
4. Publier le dossier sur GitHub Pages (nouveau dépôt).

## Structure
`config.js` (types, checklist, état) · `ui-common.js` · `data-sync-calc.js` (sync, rôles, échéances) · `render.js` ·
`entry-modal.js` · `property-modals.js` (réglages, partage, types, ajout/suppression de bien) ·
`checklist-sessions.js` (fiches de vérification, interventions à prévoir) · `export-dossier.js` ·
`journal-backups-init.js` (journal, sauvegardes, compte, démarrage) · `guide.html` · `sw.js` (à maintenir : `PRECACHE_URLS`).

## Limites connues (v1)
- Pas encore de rappels par e-mail (l'Edge Function `send-reminders` de mon-garage ne couvre que les véhicules) ni d'envoi de l'historique par e-mail.
- Mêmes limites que mon-garage : hors-ligne minimal, concurrence « dernier écrivain gagne » sur les tables normalisées.
