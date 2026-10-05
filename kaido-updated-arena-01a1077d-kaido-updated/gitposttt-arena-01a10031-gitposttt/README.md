# 🐉 KAIDO-MD — WhatsApp Multi-Device Bot & Dashboard

> Bot WhatsApp multi-device ultra-rapide, modulaire et puissant avec tableau de bord web intégré, support multi-sessions, gestionnaires de médias, intelligence artificielle et système de plugins avec **rechargement à chaud automatique en temps réel**.

---

## 🚀 Fonctionnalités Principales

- **⚡ Multi-Sessions & Multi-Device :** Connexion de plusieurs numéros WhatsApp simultanément via code de pairing sans scan QR.
- **🔄 Reconnexion Automatique :** Gestion intelligente des déconnexions réseau temporaires sans perte de session.
- **🔥 Hot-Reload Automatique :** Dès que vous ajoutez, modifiez ou supprimez un fichier dans `plugins/`, il est rechargé instantanément en mémoire sans redémarrer le bot ni taper de commande !
- **🌐 Tableau de Bord Web Complet :**
  - Gestion des sessions actives et archivées (`/dashboard/sessions.html`).
  - Gestion des newsletters WhatsApp et auto-réactions (`/dashboard/newsletters.html`).
  - Gestion des administrateurs (`/dashboard/admins.html`).
  - Statut en temps réel et métriques système (`/dashboard/active.html`).
- **🛡️ Sécurité & Modération de Groupe :**
  - **Anti-Link :** Suppression automatique des liens externes indésirables.
  - **Anti-Delete :** Retransmission privée des messages et médias éphémères supprimés.
  - **Anti-Status Mention :** Avertissement et expulsion en cas de spam de mentions.
  - **Bienvenue / Au revoir :** Messages personnalisés pour les nouveaux membres.
- **📥 Téléchargeurs Multimédia :**
  - YouTube (MP3 & Vidéo MP4 HD)
  - TikTok (Sans filigrane / No Watermark)
  - Instagram (Reels, Vidéos, Carrousels)
  - Facebook (Vidéos HD/SD)
- **🧠 Intelligence Artificielle :** Assistant IA conversationnel intégré (`.ai`, `.gpt`).
- **🛠️ Outils & Utilitaires :**
  - **Sticker to Command (.setcmd) :** Associez n'importe quel sticker WhatsApp comme raccourci/alias d'une commande (ex: `.setcmd ping`, `.setcmd save`, `.setcmd menu`).
  - Création de Stickers statiques et animés (`.s`, `.sticker`).
  - Traducteur multilingue avec détection automatique (`.tr`, `.translate`).
  - Capture d'écran de pages web en direct (`.ssweb`).
  - Téléversement de fichiers vers lien direct (`.tourl`).
  - Générateur de polices stylisées (`.fancy`).
  - Jeux interactifs : Morpion rétro (`.ttt`, `.delttt`).

---

## 📁 Structure du Projet

```
├── plugins/                  # 📦 Dossier des commandes modulaires (surveillé en temps réel)
│   ├── general/              # Commandes générales (.ping, .menu, .alive, .owner)
│   ├── tools/                # Outils (.sticker, .translate, .fancy, .ssweb, .tourl)
│   ├── ai/                   # Intelligence Artificielle (.ai, .gpt)
│   ├── download/             # Téléchargeurs (.play, .tiktok, .ig, .fb)
│   ├── group/                # Gestion de groupe (.tagall, .hidetag, .kick, .antilink)
│   └── owner/                # Commandes propriétaire (.eval, .broadcast, .plugins)
├── dashboard_static/         # 🌐 Pages HTML du Dashboard Web
├── files/                    # Modules secondaires (tictactoe, translation)
├── config.js                 # ⚙️ Configuration générale du bot
├── pluginLoader.js           # 🔌 Chargeur automatique et watcher de plugins
├── pair.js                   # 🤖 Moteur Baileys & Gestion des WebSockets WhatsApp
├── index.js                  # 🚀 Serveur Express & Points d'entrée API
├── .env.example              # 🔐 Exemple de variables d'environnement
└── README.md
```

---

## ⚙️ Installation & Démarrage

### 1. Prérequis
- **Node.js** >= 18.x
- **FFmpeg** (pour la conversion audio/vidéo et stickers)
- **MongoDB** (cluster local ou MongoDB Atlas)

### 2. Cloner le dépôt et installer les dépendances
```bash
git clone https://github.com/Plag-509-5/gitposttt.git
cd gitposttt
npm install --legacy-peer-deps
```

### 3. Configuration de l'environnement
Copiez le fichier `.env.example` en `.env` :
```bash
cp .env.example .env
```
Modifiez les variables dans `.env` :
```env
PORT=3000
BOT_NAME=KAIDO-MD
OWNER_NUMBER=50947440869
PREFIX=.
ADMIN_PASS=adminplag
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net

# Requis uniquement pour importer un pack avec .tgs
# Créez gratuitement un bot avec @BotFather puis collez son token ici.
TELEGRAM_BOT_TOKEN=

# Facultatif : APIs de téléchargement personnalisées
FACEBOOK_DOWNLOADER_API=https://fdown.isuru.eu.org
COBALT_API_URLS=https://rue-cobalt.xenon.zone,https://cobaltapi.cjs.nz
COBALT_API_KEY=
```

> La page publique `t.me/addstickers/...` ne contient plus les fichiers `.tgs`. La commande `.tgs` utilise donc l’API officielle Telegram (`getStickerSet` puis `getFile`), ce qui nécessite `TELEGRAM_BOT_TOKEN`. Le token reste côté serveur et n’est jamais envoyé dans les messages ou les logs d’erreur.

### 4. Lancer le Bot
```bash
npm start
```

Le serveur démarrera sur `http://localhost:3000` :
- **Page de pairing :** `http://localhost:3000/pair`
- **Dashboard :** `http://localhost:3000/dashboard`

---

## 📴 Présence et mode sans préfixe

Chaque session peut être configurée directement dans WhatsApp par le propriétaire :

```text
.config alwaysonline on
.config alwaysonline off
.config setprefix !
.config setprefix off
```

- `alwaysonline on` garde la présence du compte disponible.
- `alwaysonline off` applique la présence `unavailable`. Un message ordinaire est ignoré sans appel à `readMessages`; une commande reconnue est marquée comme lue, réveille temporairement le bot, puis celui-ci repasse hors ligne.
- `setprefix off` enregistre un préfixe vide. Dans ce mode, le bot examine uniquement le premier mot : `menu` est exécuté, tandis que `bonjour menu` ou un mot inconnu sont ignorés silencieusement.
- Pour réactiver le point depuis le mode sans préfixe : `config setprefix .`.
- `.config show` affiche les valeurs actives de la session.

> **Limite WhatsApp :** un seul coche signifie que le message n’a pas encore été livré au compte/appareil connecté. Le bot doit recevoir le message pour savoir si son premier mot est une commande; il ne peut donc pas garantir un seul coche tout en effectuant cette détection. En mode OFF, il évite l’accusé de **lecture** des textes ordinaires, mais WhatsApp peut tout de même afficher deux coches grises de livraison. Les coches bleues dépendent aussi des réglages de confidentialité WhatsApp.

---

## 🔌 Ajouter un Plugin (Rechargement 100% Automatique)

Pour ajouter une nouvelle commande, créez simplement un fichier `.js` dans `plugins/` (ou un sous-dossier) :

```javascript
// plugins/general/bonjour.js
module.exports = {
  name: 'bonjour',
  alias: ['salut', 'hello'],
  category: 'general',
  description: 'Répond avec un message de bienvenue',
  usage: '.bonjour',
  isGroup: false,      // true si réservé aux groupes
  isAdmin: false,      // true si réservé aux admins du groupe
  isOwner: false,      // true si réservé au propriétaire
  async execute({ socket, msg, from, senderNumber, args, prefix }) {
    await socket.sendMessage(from, {
      text: `👋 Bonjour @${senderNumber} ! Comment puis-je vous aider aujourd'hui ?`,
      mentions: [msg.key.participant || from]
    }, { quoted: msg });
  }
};
```

Dès l'enregistrement du fichier, le bot **détecte automatiquement la modification et applique les changements instantanément sans avoir besoin de taper `.reload` ni de redémarrer le serveur !**

---

## 📜 Licence & Crédits
- **Auteur :** Mugiwara no plag & Tech Mondial Dev Team
- **Licence :** MIT
