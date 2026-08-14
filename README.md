# 卐 SWASTIK GOLD JALORE (swastikgold.net)
## Universal Bullion Live Rates Portal & Mobile App Engine

This repository contains the complete codebase for **Swastik Gold Jalore**, optimized for **GoDaddy Hosting (`swastikgold.net`)**, **Vercel**, **cPanel/Apache**, and **Node.js**:

1. **Live Customer Web App (`index.html`)**: Mobile-first live rate app with startup pop-up announcement modal and live rate cards.
2. **Customer PC Live Rates Website (`website.html`)**: Full-width live rates display portal for website visitors.
3. **PC Operator Control Desk (`pc-client.html`)**: Standalone PC operator panel for product renames, buy/sell hide toggles, master hide/freeze, customer PIN approval, and broadcast announcements.
4. **GoDaddy / cPanel Native PHP Engine (`api.php` & `.htaccess`)**: High-speed proxy streaming from Sundha Gold live API (`bcast.sundhagold.com:7768`) with zero configuration required.
5. **Direct Stream Server Engine (`server.js`)**: Real-time Node.js streaming proxy.

---

## 🌐 GoDaddy Hosting (`swastikgold.net`) Deployment Instructions

1. Run `push_to_github.bat` to push latest code to your Swastik Gold GitHub repository.
2. If GitHub Auto-Deployment is enabled on GoDaddy cPanel, the files will sync automatically to `public_html`.
3. If syncing manually via cPanel File Manager:
   - Upload all files from this folder (`index.html`, `website.html`, `pc-client.html`, `app.js`, `styles.css`, `api.php`, `.htaccess`, `manifest.json`, `sw.js`) to your `public_html` directory on GoDaddy.
4. Open **https://swastikgold.net/** - Live rates will start updating immediately!

---

**Proprietor**: Champalal Soni (`champc111@gmail.com`)  
**Address**: Gandhi Chowk, Jalore (Rajasthan) 343001  
**Mobile**: 9414152854 / 9772277054
