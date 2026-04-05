# Control Plane MVP — Interface d'orchestration multi-provider

> **Pour les intégrateurs :** Cette interface fournit les contrôles essentiels pour gérer plusieurs providers de facturation électronique depuis un seul endroit.
>
> **Objectif :** Valider rapidement la valeur du control plane avec un sous-ensemble minimal de fonctionnalités qui répondent aux cas d'usage réels des intégrateurs.
>
> **Stack :** React/TypeScript (réutilisant les composants existants des viewers MCP Apps)

---

## 🎯 Pourquoi un MVP ?

Au lieu de construire immédiatement l'interface complète vue dans les maquettes Stitch (qui était effectivement trop complexe pour un premier déploiement), ce MVP se concentre sur **trois scénarios réels d'intégrateur** :

1. **Basculement de provider** : Passer d'Iopole à Storecove pour un client spécifique
2. **Surveillance de fallback** : Vérifier que le provider secondaire prend le relai en cas d'échec
3. **Diagnostic d'échec** : Comprendre pourquoi une facture a été rejetée et agir

---

## 🧩 Fonctionnalités essentielles (MVP)

### 1. Sélecteur d'environnement et de provider (en-tête)
- Sélecteur d'environnement : Sandbox / Production
- Sélecteur de client (pour les intégrateurs multi-tenant)
- Sélecteur de provider principal : Iopole, Storecove, SuperPDP
- Indicateur de statut du provider (connecté, déconnecté, en erreur)
- Bouton "Tester la connexion"

### 2. Tableau de bord simplifié (vue principale)
- **Statut global** : 
  - Nombre de factures en attente de traitement
  - Taux de succès des dernières 24h
  - Provider actuellement actif
  - Dernière synchronisation

- **Liste des factures récentes** (tableau compact) :
  - ID facture
  - Provider utilisé
  - Statut (envoyée, délivrée, approuvée, rejetée)
  - Date/heure
  - Action rapide : Voir détails / Réessayer

### 3. Panneau de détails et d'actions (latéral ou modal)
Quand une facture est sélectionnée :
- Informations de base : ID, montant, date, émetteur, destinataire
- Statut détaillé avec timeline
- Boutons d'action selon le statut :
  - Réessayer l'envoi
  - Télécharger la facture source
  - Télécharger le rapport d'erreur
  - Basculer vers le provider secondaire (si configuré)
  - Voir les rapports de conformité

### 4. Configuration du fallback (paramètres simples)
- Provider principal : [sélecteur]
- Provider de fallback : [sélecteur] 
- Seuil de déclenchement : [après X échecs consécutifs]
- Notification : [email/webhook] en cas de basculement

### 5. Flux d'événements essentiels
- Facture envoyée avec succès
- Facture délivrée au destinataire
- Facture approuvée par le destinataire
- Facture rejetée (avec raison)
- Basculement de provider déclenché
- Tentative de nouvel envoi après échec

---

## 🚫 Ce qui est exclu du MVP (pour rester léger)

- Comparateur détaillé de capabilities entre providers (peut venir plus tard)
- Interface complète de gestion des webhooks
- Gestion avancée des identifiants et entités
- Tableau de bord analytique complet
- Gestion des utilisateurs et rôles
- Export/import de configuration
- Documentation intégrée

---

## 🔧 Implémentation suggérée

### Réutilisation de composants existants
- Utiliser les styles et couleurs des viewers MCP Apps actuels
- Réutiliser les composants `InfoCard`, `ActionButton`, `FeedbackBanner`
- S'appuyer sur le système de thèmes déjà en place

### Nouveau composants nécessaires
- `ProviderSelector` : sélecteur avec statut de connexion
- `InvoiceStatusBadge` : badge coloré selon le statut e-invoice
- `FallbackConfigForm` : formulaire simple de configuration
- `EssentialEventStream` : flux d'événements filtré
- `InvoiceActionPanel` : panel d'actions contextuel

### États à gérer
- Chargement initiale des providers
- État de connexion de chaque provider
- Sélection du provider actif
- Liste des factures récentes (pagination simple)
- État de sélection d'une facture
- État de basculement de provider actif

---

## 📱 Responsivité
- Mobile-first : fonctionnel sur écran réduit
- Priorité aux actions essentielles : voir facture, réessayer, basculer
- Tableau des factures en mode liste verticale sur mobile
- Panneaux latéraux convertibles en modaux sur petit écran

---

## ✅ Critères d'acceptation du MVP

Un intégrateur doit pouvoir accomplir ces tâches sans documentation :

1. **Connecter deux providers** (ex: Iopole principal, Storecove fallback)
2. **Envoyer une facture de test** et voir son suivi
3. **Simuler un échec** sur le provider principal
4. **Vérifier le basculement automatique** vers le fallback
5. **Diagnostiquer la raison de l'échec** depuis l'interface
6. **Réessayer l'envoi** après correction
7. **Retourner au provider principal** une fois le problème résolu

---

## 🔄 Évolutions post-MVP

Après validation du MVP avec de vrais intégrateurs :

1. **Phase 2** : Ajout du comparateur de capabilities et des diagnostics avancés
2. **Phase 3** : Interface complète de gestion des webhooks et des identifiants
3. **Phase 4** : Tableau de bord analytique et reporting personnalisable
4. **Phase 5** : Gestion multi-tenant complète et RBAC

---

## 📅 Timeline réaliste

- **Semaine 1** : Composants de base + sélecteur de provider
- **Semaine 2** : Liste des factures + panneau de détails
- **Semaine 3** : Configuration du fallback + flux d'événements
- **Semaine 4** : Intégration, tests utilisateurs, ajustements
- **Semaine 5** : Publication et documentation