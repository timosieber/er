# French -ER Verbs Learning App

Eine interaktive Lernapp für regelmäßige französische -ER Verben im Präsens.

## Features

- 🎯 Fokussierter Übungsmodus mit verschiedenen Schwierigkeitsstufen
- 📚 Leitner-System für optimale Wiederholung
- 🎨 Minimalistisches UI im Dark Mode
- 💾 Lokale Speicherung des Lernfortschritts
- 📱 Responsive Design für alle Geräte

## Deployment auf Netlify

### 1. Repository auf GitHub erstellen

1. Gehe zu [github.com](https://github.com) und erstelle ein neues Repository
2. Nenne es z.B. "french-er-verbs-app"
3. Kopiere die Remote-URL (z.B. `https://github.com/username/french-er-verbs-app.git`)

### 2. Code zu GitHub pushen

```bash
# Im Projektordner:
git remote add origin https://github.com/username/french-er-verbs-app.git
git branch -M main
git push -u origin main
```

### 3. Netlify Deployment

1. Gehe zu [netlify.com](https://netlify.com) und melde dich an
2. Klicke auf "New site from Git"
3. Wähle GitHub als Provider
4. Wähle dein Repository aus
5. Deployment-Einstellungen:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
6. Klicke auf "Deploy site"

### 4. Automatische Updates

Nach dem ersten Deployment wird die App automatisch aktualisiert, wenn du Änderungen zu GitHub pushst.

## Lokale Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# Development Server starten
npm run dev

# Production Build erstellen
npm run build

# Build-Vorschau
npm run preview
```

## Projektstruktur

```
er/
├── src/
│   ├── App.jsx          # Hauptkomponente
│   └── main.jsx         # React Entry Point
├── index.html           # HTML Template
├── package.json         # Dependencies & Scripts
├── vite.config.js       # Vite Konfiguration
├── netlify.toml         # Netlify Deployment Config
└── README.md           # Diese Datei
```

## Technologie Stack

- **React 18** - UI Framework
- **Vite** - Build Tool & Dev Server
- **Tailwind CSS** - Styling (via CDN)
- **Netlify** - Hosting & Deployment