# Cubicle Camera Web App

This version runs as a phone-friendly web app.

## Files
- index.html
- styles.css
- app.js
- manifest.json

## What it does
- Opens the camera in the browser
- Detects motion by comparing frames
- Shows a red full-screen alert when motion crosses the threshold
- Supports sound and vibration
- Saves threshold/cooldown settings in the browser

## How to use on iPhone
1. Host these files on an HTTPS website.
2. Open the site in Safari.
3. Tap **Start Camera** and allow camera access.
4. Tap **Start Monitoring**.
5. Optional: use Safari Share > **Add to Home Screen**.

## Important
- Camera access on phones normally requires **HTTPS**.
- Motion detection works best if the phone is sitting still.
- This version intentionally does **not** include face recognition or snapshot logging.
