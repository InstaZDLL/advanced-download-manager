# 🚀 Démarrage Rapide

## Installation des dépendances

```bash
npm run install:all
```

## Démarrage du projet

**Une seule commande pour tout lancer :**

```bash
npm run dev
```

Cette commande va :

- ✅ Vérifier les prérequis (Node.js, npm, Redis, aria2, etc.)
- 🚀 Démarrer Redis et aria2 automatiquement
- 🎯 Lancer backend, worker et frontend en parallèle
- 📋 Afficher les URLs d'accès

## Accès à l'application

- **Frontend** : <http://localhost:5173>
- **Backend API** : <http://localhost:3000>
- **Health Check** : <http://localhost:3000/health>

## Arrêt

Appuyez sur `Ctrl+C` pour arrêter tous les serveurs.

## Scripts alternatifs

- `npm run dev:manual` - Version manuelle avec concurrently
- `npm run check:services` - Vérifier l'état des services
- `npm run stop:services` - Arrêter Redis et aria2
- `npm run setup` - Script de setup interactif

## Prérequis

**Obligatoires :**

- Node.js 18+
- npm

**Optionnels (mais recommandés) :**

- Redis (pour la queue des jobs)
- aria2 (pour les téléchargements directs)
- yt-dlp (pour YouTube)
- ffmpeg (pour le transcodage)

### Installation des outils (Ubuntu/Debian)

```bash
sudo apt-get install redis-server aria2 ffmpeg
pip install yt-dlp
```

### Installation des outils (macOS)

```bash
brew install redis aria2 ffmpeg
pip install yt-dlp
```

## Troubleshooting

Si vous avez des problèmes :

1. Vérifiez que tous les outils sont installés
2. Consultez les logs colorés dans le terminal
3. Utilisez `npm run check:services` pour diagnostiquer
4. Utilisez `./scripts/setup.sh` pour une configuration guidée

**Have fun! 🎉**
