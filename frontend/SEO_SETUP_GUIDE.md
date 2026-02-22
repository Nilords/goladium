# Goladium SEO Setup - Vollständige Anleitung

## ✅ Was wurde implementiert

### 1. Meta Tags (index.html)
- Title & Description optimiert
- Open Graph Tags für Facebook/Social
- Twitter Card Tags
- Canonical URL
- Robots Meta Tags

### 2. Strukturierte Daten (JSON-LD)
- WebSite Schema
- VideoGame Schema
- Bewertungs-Schema

### 3. Technische SEO-Dateien
- `/robots.txt` - Crawler-Anweisungen
- `/sitemap.xml` - Alle wichtigen URLs
- `/manifest.json` - PWA-Konfiguration

### 4. React-SEO (Helmet)
- Dynamische Meta-Tags pro Seite
- Canonical URLs pro Seite
- Noindex für private Seiten (Settings, Profile)

---

## ⚠️ MANUELLE SCHRITTE ERFORDERLICH

### 1. OG-Image erstellen (WICHTIG für Social Sharing)

**Was:** Ein Bild das bei Social Media angezeigt wird
**Größe:** 1200x630 Pixel (PNG oder JPG)
**Dateiname:** `og-image.png`

**Wo ablegen:**
```
frontend/public/og-image.png
```

**Inhalt-Vorschlag:**
- Goladium Logo groß in der Mitte
- Hintergrund: #050505 (dunkel)
- Text: "Kostenloses Casino Simulationsspiel"
- Slot/Wheel Grafik als Dekoration

---

### 2. Favicon-Set generieren

**Was:** Verschiedene Icon-Größen für Browser/Mobile

**Benötigte Dateien in `/frontend/public/`:**
- `favicon.svg` (bereits vorhanden)
- `favicon-16x16.png`
- `favicon-32x32.png`
- `favicon-192x192.png`
- `favicon-512x512.png`
- `apple-touch-icon.png` (180x180)

**Tool zum Generieren:**
1. Gehe zu https://realfavicongenerator.net/
2. Lade dein Logo hoch
3. Konfiguriere die Einstellungen
4. Downloade das Paket
5. Kopiere alle Dateien nach `/frontend/public/`

---

### 3. Google Search Console einrichten

**Schritt 1: Verifizierung**
1. Gehe zu https://search.google.com/search-console
2. Klicke auf "Property hinzufügen"
3. Wähle "URL-Präfix"
4. Gib ein: `https://goladium.de`

**Schritt 2: Verifizierungsmethode (HTML-Tag)**
Du erhältst einen Code wie:
```html
<meta name="google-site-verification" content="DEIN_CODE_HIER" />
```

**Wo einfügen:**
Datei: `/frontend/public/index.html`
Position: Im `<head>` Bereich nach den bestehenden Meta-Tags

**Schritt 3: Sitemap einreichen**
1. Nach Verifizierung: Gehe zu "Sitemaps" im linken Menü
2. Gib ein: `sitemap.xml`
3. Klicke "Senden"

---

### 4. Cloudflare Einstellungen (falls genutzt)

**A) Page Rules für SEO:**
1. Cloudflare Dashboard → Rules → Page Rules
2. Neue Rule erstellen:
   - URL: `*goladium.de/api/*`
   - Einstellung: "Cache Level: Bypass"

**B) Security Headers:**
Gehe zu Security → Settings und aktiviere:
- [x] Browser Integrity Check
- [x] Hotlink Protection

**C) Performance:**
Gehe zu Speed → Optimization:
- [x] Auto Minify (HTML, CSS, JS)
- [x] Brotli Compression
- [x] Early Hints
- [x] Rocket Loader (OFF - kann React Apps brechen)

---

### 5. Server-Konfiguration (falls eigener Server)

**Für Nginx - füge zu deiner Config hinzu:**

```nginx
# Security Headers
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Cache static assets
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Serve robots.txt and sitemap.xml
location = /robots.txt {
    allow all;
    log_not_found off;
    access_log off;
}

location = /sitemap.xml {
    allow all;
    log_not_found off;
    access_log off;
}
```

---

### 6. Bing Webmaster Tools (Optional)

1. Gehe zu https://www.bing.com/webmasters
2. Füge deine Site hinzu
3. Verifiziere mit Meta-Tag (ähnlich wie Google)
4. Reiche Sitemap ein

---

## Checkliste vor Go-Live

- [ ] OG-Image erstellt (1200x630px)
- [ ] Alle Favicon-Größen generiert
- [ ] Google Search Console verifiziert
- [ ] Sitemap in Search Console eingereicht
- [ ] Cloudflare/Server Headers konfiguriert
- [ ] robots.txt erreichbar (https://goladium.de/robots.txt)
- [ ] sitemap.xml erreichbar (https://goladium.de/sitemap.xml)

---

## Test-Tools

Nach dem Deployment, teste mit:

1. **Google Rich Results Test**
   https://search.google.com/test/rich-results
   → URL eingeben, strukturierte Daten prüfen

2. **Facebook Sharing Debugger**
   https://developers.facebook.com/tools/debug/
   → URL eingeben, OG-Tags prüfen

3. **Twitter Card Validator**
   https://cards-dev.twitter.com/validator
   → URL eingeben, Card-Preview prüfen

4. **PageSpeed Insights**
   https://pagespeed.web.dev/
   → Core Web Vitals prüfen

5. **Mobile-Friendly Test**
   https://search.google.com/test/mobile-friendly
   → Mobile-Optimierung prüfen

---

## Erwartete SEO-Ergebnisse

Nach 2-4 Wochen solltest du sehen:
- Indexierung in Google (site:goladium.de)
- Rich Results für Spiel-Schema
- Korrekte Social Media Previews
- Verbesserte Click-Through-Rate

Bei Fragen: Die SEO-Grundlage ist komplett, der Rest ist Monitoring und Content-Optimierung.
