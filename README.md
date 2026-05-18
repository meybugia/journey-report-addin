# Journey Report Add-In for MyGeotab

Generates a per-trip journey report PDF matching the SnapTrack Journey Report format, including:
- Trip summary with driver behavior exception counts
- Interactive route map (Leaflet.js) + speed/activity charts
- Full event log (exceptions, ignition, geofence events)
- Print-to-PDF export

---

## Files

| File | Purpose |
|---|---|
| `addin.json` | MyGeotab manifest — register this in your database |
| `index.html` | Add-in main page (form + report preview) |
| `addin.js` | Add-in logic: data fetching, map, charts, event log |
| `addin.css` | Zenith-aligned styles |
| `print.html` | Print layout — opened automatically when saving PDF |

---

## Partner Setup

### Step 1 — Host the files

Copy all files to any web server that supports HTTPS (required by MyGeotab):

**Windows IIS example:**
```
C:\inetpub\wwwroot\journey-report-addin\
  addin.json
  index.html
  addin.js
  addin.css
  print.html
```

**nginx example:**
```nginx
location /journey-report-addin/ {
    root /var/www/html;
    add_header Access-Control-Allow-Origin *;
}
```

### Step 2 — Update the URL in addin.json

Edit `addin.json` and change the `url` field to your server address:

```json
"url": "https://your-server.com/journey-report-addin/index.html"
```

Also update `supportEmail` to your support contact.

### Step 3 — Register in MyGeotab

1. Log in to MyGeotab as an Administrator
2. Go to **Administration → System → System Settings**
3. Click the **Add-Ins** tab
4. Click **Add** (the blue + button)
5. Paste the **entire contents** of `addin.json` into the text field
6. Click **OK** and then **Save**
7. Refresh the browser

The **Journey Report** menu item will appear under **Activity** in the left navigation.

---

## Usage

1. Navigate to **Activity → Journey Report** in MyGeotab
2. Select a **Vehicle** from the dropdown
3. Set **Date From** and **Date To**
4. Optionally enter a **Shipment Reference** number
5. Click **Generate**
6. Review the report preview
7. Click **Print / Save as PDF** → browser print dialog opens → choose **Save as PDF**

---

## How Exception Counts Work

The add-in matches exception rule names (case-insensitive) to behavior categories:

| Report Field | Matched Rule Keywords |
|---|---|
| Over Speeding | over speed, overspeed, speed violation |
| Speeding in Geofence | speeding in geofence, geofence speed |
| Harsh Braking | harsh brake, hard brake |
| Harsh Acceleration | harsh accel, hard accel |
| Harsh Turning | harsh turn, hard turn, cornering |

If your database uses different rule names, edit the `BEHAVIOR_KEYS` object in `addin.js`.

---

## Requirements

- MyGeotab database (any version supporting Page Add-Ins)
- Web server with HTTPS support (TLS 1.2+)
- Modern browser (Chrome recommended for best PDF output)
- Internet access on the client machine (for Leaflet map tiles, Chart.js, Google Fonts CDN)

> **Offline/intranet environments:** Download Leaflet and Chart.js locally and update the `<script>` tags in `index.html` and references in `print.html`.

---

## Customization

- **Company logo:** Add an `<img>` tag to the header in `print.html`
- **Report title:** Change "Journey Report" in `addin.json` → `menuName` and in the HTML files
- **Map tiles:** Replace the OpenStreetMap tile URL in `addin.js` with any Leaflet-compatible provider
- **Color scheme:** Edit CSS variables in `addin.css` (`:root` block)
