<div align="center">
  <img src="assets/agentpaw-icon.png" width="112" alt="Icône du compagnon de bureau AgentPaw">
  <h1>AgentPaw · Compagnon de bureau IA — Codex / Claude Code</h1>
  <p><strong>Transformez vos GIF préférés en compagnon de bureau et gardez un œil sur vos tâches IA et vos quotas.</strong></p>
  <p>Personnages personnalisables · GIF animés · Notifications de tâches · Quotas Codex · Statistiques de tokens · Rappels de pause</p>
  <p>Compatible avec Codex, Claude Code, WorkBuddy, opencode.</p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README_ZH_HANS.md">简体中文</a> ·
    <a href="README_ZH_HANT.md">繁體中文</a> ·
    <a href="README_FR.md">Français</a>
  </p>
  <p>
    <a href="https://github.com/vista-zhangg/codex-desktop-pet/releases/latest"><strong>Télécharger pour Windows</strong></a> ·
    <a href="https://github.com/vista-zhangg/codex-desktop-pet/releases/tag/v2.0.0">Notes de version 2.0.0</a> ·
    <a href="docs/介绍.md">Guide complet (chinois simplifié)</a>
  </p>
  <p>
    <a href="https://github.com/vista-zhangg/codex-desktop-pet/actions/workflows/ci.yml"><img src="https://github.com/vista-zhangg/codex-desktop-pet/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <img src="https://img.shields.io/badge/platform-Windows%20x64-0078D4?logo=windows" alt="Windows x64 uniquement">
    <img src="https://img.shields.io/badge/version-2.0.0-F6A04A" alt="Version 2.0.0">
    <a href="LICENSE"><img src="https://img.shields.io/badge/code%20license-MIT-2EA44F" alt="Licence MIT"></a>
  </p>
</div>

> [!IMPORTANT]
> AgentPaw prend actuellement en charge **Windows x64 uniquement**. macOS, Linux et Windows sur ARM ne sont pas pris en charge. L'interface propose l'anglais, le chinois simplifié et le chinois traditionnel, avec l'anglais par défaut. L'installateur Windows ne dispose pas encore d'une signature de code commerciale : SmartScreen peut afficher un avertissement au premier lancement.

**AgentPaw · AI Desktop Companion** est un projet indépendant et open source, sans affiliation avec OpenAI ou Anthropic. Gratuit et non lucratif, il est destiné à l'accompagnement personnel sur le bureau, à l'apprentissage et au partage. Il ne propose ni personnages payants ni téléchargements payants.

## Fonctionnalités

Suivez la progression de Codex, ses quotas d'abonnement sur 5 heures et 7 jours, et votre consommation de tokens directement sur le bureau. AgentPaw regroupe aussi les sessions locales de vos autres outils de développement IA, vous signale les tâches qui demandent une réponse et vous avertit lorsqu'un travail est terminé. Les rappels pour boire, s'étirer et reposer les yeux fonctionnent même sans tâche IA en cours.

- **Un compagnon, quatre agents** : Codex, Claude Code, WorkBuddy, opencode.
- **Personnages et GIF personnalisés** : choisissez le chat au travail, Milk Tea Mouse, Mimi Bee ou Line Dog. Créez votre propre personnage à partir d'un GIF d'attente ou importez un [pack de personnages](docs/character-packs.md). Chaque personnage conserve ses propres animations, variantes et réglages.
- **États et autorisations** : travail, réflexion, tâches parallèles, attente d'autorisation ou de réponse, fin de tâche et erreurs. Pour les demandes compatibles de Claude Code, autorisez, refusez ou autorisez durablement une opération depuis le compagnon ; les autres outils fournissent des notifications en lecture seule.
- **Cartes d'autorisation** : Entrée autorise, Échap garde la demande pour plus tard ; les plans s'affichent en Markdown et peuvent être approuvés ou renvoyés avec un commentaire.
- **Vue rapide et notifications** : un clic sur le compagnon ouvre une vue unique avec ce qui vous attend (à approuver sur place), les tâches en cours avec modèle, durée et contexte, les sessions récentes et les 7 derniers jours. Les tâches terminées restent signalées sur la capsule jusqu'à ce que vous les ouvriez. Choisissez les notifications standard ou seulement celles qui demandent votre attention, mettez un outil ou un projet en sourdine et donnez un alias aux sessions. Les raccourcis globaux sont désactivés par défaut et configurables.
- **Quotas et consommation** : le menu de la zone de notification et les badges 5h / 7d de la capsule affichent les quotas restants, leurs heures de réinitialisation et une prévision d'épuisement. Le panneau détaillé propose des filtres par outil et par période, des graphiques par jour et par heure, les heures d'activité, des statistiques de cache et de modèles, et des totaux historiques.
- **Confidentialité et intégrations** : masquez les détails sensibles en un clic et vérifiez, réparez ou supprimez les intégrations gérées par AgentPaw depuis les paramètres.
- **Rythme de travail et pauses** : configurez les rappels pour boire, s'étirer ou regarder au loin, reportez-les ou ignorez-les pour la journée. Le compagnon se masque automatiquement en plein écran et peut rester silencieux temporairement. Le personnage et la capsule compacte partagent les mêmes réglages.

| Chat au travail | Milk Tea Mouse au travail | Mimi Bee vous salue | Line Dog au travail |
| --- | --- | --- | --- |
| ![Chat au travail](assets/cat/cat-working.gif) | ![Milk Tea Mouse](assets/characters/milktea-mouse/13.gif) | ![Mimi Bee](assets/characters/mimi-bee/01.gif) | ![Line Dog](assets/characters/line-dog/set2-18.gif) |

## Installation et mises à jour

Téléchargez `AgentPaw-2.0.0-Windows-x64.exe` depuis la [dernière version publiée](https://github.com/vista-zhangg/codex-desktop-pet/releases/latest), exécutez l'installateur, puis lancez AgentPaw. Pour mettre à jour une installation existante, utilisez la mise à jour intégrée ou le nouvel installateur. Vos paramètres et vos données locales de consommation sont conservés.

La distribution propose un installateur EXE pour Windows x64. Le fichier `latest.yml` est destiné au système de mise à jour : vous n'avez pas besoin de le télécharger manuellement. Aucune archive ZIP portable n'est proposée. Le lancement depuis les sources et les commandes npm sont réservés au développement ; consultez le [guide de développement et de compilation](docs/LOCAL_DEPLOYMENT.md) en chinois simplifié.

## Données et confidentialité

L'exécutable s'appelle `AgentPaw.exe`. Les paramètres, personnages et données de consommation sont stockés dans `~/.agentpaw/`. La migration des anciennes versions conserve le dossier d'origine comme sauvegarde de récupération.

Les données de session et de consommation sont lues et traitées localement. models.dev fournit uniquement une grille publique de prix. Les quotas Codex sont lus via le propre App Server de Codex, qui gère l'authentification ; AgentPaw ne lit pas le contenu de `~/.codex/auth.json`. Le mode confidentialité masque les détails à l'écran tout en maintenant la surveillance et les statistiques locales.

Les montants affichés sont des valeurs de référence enregistrées ou calculées, et ne correspondent pas à une facture d'abonnement ni à un règlement définitif. Consultez la [documentation sur les données et la confidentialité](docs/PRIVACY.md) pour les détails.

## Licence, crédits et contributions

Ce projet est dérivé de [LLMPET](https://github.com/myunwang/LLMPET) et conserve sa licence MIT ainsi que les mentions de copyright d'origine ; voir [LICENSE](LICENSE). Les illustrations des personnages tiers ne sont pas couvertes par la licence MIT du code. Leurs auteurs, sources et conditions d'utilisation sont précisés dans les [crédits généraux](assets/CREDITS.md) et les pages du [chat](assets/cat/CREDITS.md), de [Milk Tea Mouse](assets/characters/milktea-mouse/CREDITS.md), de [Mimi Bee](assets/characters/mimi-bee/CREDITS.md) et de [Line Dog](assets/characters/line-dog/CREDITS.md). Vérifiez les droits d'utilisation des images que vous importez vous-même.

Signalez les problèmes dans les [Issues](https://github.com/vista-zhangg/codex-desktop-pet/issues) ou proposez des améliorations en suivant le [guide de contribution](CONTRIBUTING.md). La matrice des intégrations et l'architecture sont détaillées dans le [README en chinois simplifié](README_ZH_HANS.md).
