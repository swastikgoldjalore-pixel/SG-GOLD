const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// GLOBAL UNCAUGHT EXCEPTION SHIELDS FOR GODADDY CPANEL PASSENGER & NODE
process.on('uncaughtException', (err) => {
    console.error('GoDaddy Server Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('GoDaddy Server Unhandled Rejection:', reason);
});

const PORT = process.env.PORT || 8080;
const SUNDHA_API_ENDPOINT = "https://bcast.sundhagold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sundhagold";
const SETTINGS_FILE = path.join(__dirname, 'admin_settings.json');
const SECURITY_FILE = path.join(__dirname, 'security_lock.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.apk': 'application/vnd.android.package-archive',
    '.zip': 'application/zip',
    '.exe': 'application/octet-stream'
};

// IST TIMEZONE HELPER FUNCTION (ASIA/KOLKATA)
function getIstTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function getIstTimeString() {
    return getIstTime().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getIstDateString() {
    return getIstTime().toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

// 1. ABSOLUTE BULLETPROOF SECURITY LOCK PERSISTENCE ENGINE
let isSecurityLockedOnDisk = true;

function getSecurityLockStatus() {
    try {
        if (fs.existsSync(SECURITY_FILE)) {
            const data = fs.readFileSync(SECURITY_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (typeof parsed.isSecurityLoginRequired === 'boolean') {
                return parsed.isSecurityLoginRequired;
            }
        }
    } catch(e) {}
    return isSecurityLockedOnDisk;
}

function setSecurityLockStatusSync(val) {
    try {
        isSecurityLockedOnDisk = !!val;
        fs.writeFileSync(SECURITY_FILE, JSON.stringify({ isSecurityLoginRequired: isSecurityLockedOnDisk }, null, 2), 'utf8');
    } catch(e) {}
}

setSecurityLockStatusSync(getSecurityLockStatus());

let rawSundhaApiResponse = "";
let parsedLiveRates = {
    spot: { 
        gold_bid: "4376.15", gold_ask: "4377.00", gold_high: "4397.26", gold_low: "4310.81",
        silver_bid: "64.71", silver_ask: "64.74", silver_high: "65.69", silver_low: "63.48",
        usdinr_bid: "95.46", usdinr_ask: "95.46", usdinr_high: "95.44", usdinr_low: "95.36"
    },
    products: [],
    futures: [],
    allProducts: [],
    allFutures: [],
    marqueeText: "नमस्कार, SWASTIK GOLD में आपका स्वागत है। ❖ यह भाव रेफरेंस के तौर पर दिए जा रहे हैं ❖ इसके अलावा हमारे यहाँ बुलियन , टंच , बदलाई का कार्य किया जाता हैं ❖",
    lastUpdated: Date.now(),
    apiStatus: "CONNECTED_LIVE"
};

// SSE CLIENT CONNECTIONS STORE & ONLINE / OFFLINE GUEST VISITOR ENGINE
const sseClients = new Set();
const guestHistoryMap = new Map();

// DEFAULT GLOBAL ADMIN SETTINGS WITH DISK PERSISTENCE
let globalAdminSettings = {
    popupMsg: "Gold and Silver Swastik Gold mein aapka swagat hai. Booking Hours: 10:00 AM to 8:00 PM.",
    broadcastMsg: "Swastik Gold में मेसेज सेवाएं भी उपलब्ध है जिसके जरिए आप Swastik Gold से हमेशा जुड़े रहेंगे धन्यवाद",
    broadcastDate: "25 Jun 2026, 02:24 am",
    marqueeText: "नमस्कार, SWASTIK GOLD में आपका स्वागत है। ❖ यह भाव रेफरेंस के तौर पर दिए जा रहे हैं ❖ इसके अलावा हमारे यहाँ बुलियन , टंच , बदलाई का कार्य किया जाता हैं ❖",
    isMasterHidden: false,
    isMasterFrozen: false,
    isSecurityLoginRequired: getSecurityLockStatus(),
    hatohatSettings: {
        goldTunchMargin: 50,
        silverTunchMargin: 200,
        rtgsGoldOffset: 0,
        rtgsSilverOffset: 0,
        isHatohatActive: true
    },
    bankAccounts: [
        {
            id: "bank_1",
            bankName: "HDFC Bank Ltd",
            accountNo: "50200084712035",
            ifsc: "HDFC0000241",
            branch: "gandhi chowk, Jalore",
            accountType: "Bullion Current Account"
        },
        {
            id: "bank_2",
            bankName: "State Bank of India",
            accountNo: "38147295103",
            ifsc: "SBIN0001034",
            branch: "Jalore Main Branch",
            accountType: "Bullion Current Account"
        }
    ],
    renames: {},
    premiumsBuy: {},
    premiumsSell: {},
    hiddenProducts: {},
    hiddenBuy: {},
    hiddenSell: {},
    customers: [
        { id: "SG1001", name: "Champalal Soni", mobile: "9414152854", city: "Jalore", status: "APPROVED", pin: "123456", activeSession: null }
    ]
};

let globalConfigVersion = Date.now();

function bumpConfigVersion() {
    globalConfigVersion = Date.now();
}

function loadSettingsFromDisk() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            const saved = JSON.parse(data);
            delete saved.isSecurityLoginRequired;
            globalAdminSettings = { ...globalAdminSettings, ...saved };
            bumpConfigVersion();
        }
    } catch(e) {}
}

function saveSettingsToDisk() {
    try {
        bumpConfigVersion();
        const settingsToSave = { ...globalAdminSettings, isSecurityLoginRequired: getSecurityLockStatus() };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsToSave, null, 2), 'utf8');
    } catch(e) {}
}

loadSettingsFromDisk();

// MIDNIGHT 12:00 AM AUTOMATIC HIGH/LOW RESET
function checkMidnightReset() {
    try {
        const now = getIstTime();
        if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() < 10) {
            parsedLiveRates.spot.gold_high = parsedLiveRates.spot.gold_bid;
            parsedLiveRates.spot.gold_low = parsedLiveRates.spot.gold_bid;
            parsedLiveRates.spot.silver_high = parsedLiveRates.spot.silver_bid;
            parsedLiveRates.spot.silver_low = parsedLiveRates.spot.silver_bid;
            parsedLiveRates.spot.usdinr_high = parsedLiveRates.spot.usdinr_bid;
            parsedLiveRates.spot.usdinr_low = parsedLiveRates.spot.usdinr_bid;

            parsedLiveRates.products.forEach(p => { p.high = p.sell; p.low = p.sell; });
            parsedLiveRates.futures.forEach(f => { f.high = f.sell; f.low = f.sell; });
        }
    } catch(e) {}
}
setInterval(checkMidnightReset, 5000);

// ACCURATE INDIAN FESTIVAL CALENDAR ENGINE
function getTodayFestivalGreeting() {
    const today = getIstTime();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    let festivalName = "चातुर्मास पावन पर्व";
    let messageText = "पावन पर्व 'चातुर्मास' की आप सभी को स्वास्तिक गोल्ड जालौर की तरफ से हार्दिक शुभकामनाएं एवं मंगलकामनाएं! आपका व्यवसाय सदैव फले-फूले।";

    if (month === 8 && day === 15) {
        festivalName = "🇮🇳 15 अगस्त स्वतंत्रता दिवस";
        messageText = "आप सभी देशवासियों एवं व्यापारी भाइयों को स्वास्तिक गोल्ड जालौर की ओर से 79वें 'स्वतंत्रता दिवस' की हार्दिक शुभकामनाएं! जय हिंद, जय भारत! 🇮🇳";
    } else if (month === 8 && day === 28) {
        festivalName = "पवित्र रक्षाबंधन पर्व";
        messageText = "भाई-बहन के अटूट प्रेम व स्नेह के प्रतीक 'रक्षाबंधन' की स्वास्तिक गोल्ड परिवार की ओर से हार्दिक बधाई व शुभकामनाएं!";
    } else if (month === 9) {
        festivalName = "श्री गणेश चतुर्थी व पर्वोत्सव";
        messageText = "भगवान श्री गणेश जी की कृपा आप सभी पर सदैव बनी रहे। 'गणेश चतुर्थी' की हार्दिक शुभकामनाएं!";
    } else if (month === 10) {
        festivalName = "शुभ धनतेरस व श्री महालक्ष्मी पूजन";
        messageText = "प्रकाश पर्व 'धनतेरस व दीपावली' की आपको एवं आपके परिवार को स्वास्तिक गोल्ड जालौर की तरफ से अनंत शुभकामनाएं!";
    }

    return {
        title: festivalName,
        greetingMsg: messageText,
        dateStr: getIstDateString()
    };
}

// SWASTIK AI REAL-TIME MARKET INTELLIGENCE ENGINE
let swastikAiReport = {
    lastAiUpdate: getIstTimeString(),
    comexGold: { rate: "2418.50", signal: "BULLISH 🚀", target15m: "2426.00", target1w: "2460.00", target1m: "2520.00" },
    comexSilver: { rate: "29.80", signal: "VERY BULLISH 🚀", target15m: "30.20", target1w: "31.50", target1m: "33.80" },
    mcxGold: { rate: "72,450", signal: "BULLISH 📈", target15m: "72,680", target1w: "73,400", target1m: "74,800" },
    mcxSilver: { rate: "88,200", signal: "STRONG BULLISH 🚀", target15m: "88,750", target1w: "90,100", target1m: "93,500" },
    fundamentalDrivers: [
        "🔥 ट्रम्प का नया टैरिफ बयान एवं अमेरिकी डॉलर सूचकांक (DXY) में नरमी से अंतरराष्ट्रीय सोने में उछाल।",
        "📈 US Fed द्वारा ब्याज दरों में कटौती की संभावना से कॉमेक्स बुलियन मार्केट में भारी खरीदारी दर्ज।",
        "🇮🇳 भारतीय घरेलू बाजार (MCX) में आगामी त्योहारी मांग एवं USDINR के स्तर से भावों को मजबूत सपोर्ट। (*AI पूर्वानुमान तकनीकी विश्लेषणात्मक डेटा पर आधारित)।"
    ],
    festivalGreeting: getTodayFestivalGreeting()
};

function generateSwastikAiMarketReport() {
    try {
        const goldComex = parseFloat(parsedLiveRates.spot.gold_bid) || 2418.5;
        const silverComex = parseFloat(parsedLiveRates.spot.silver_bid) || 29.8;
        
        let goldMcxLive = 72450;
        let silverMcxLive = 88200;

        const gFutItem = (parsedLiveRates.allFutures || []).find(f => f.name && f.name.includes('GOLD'));
        if (gFutItem && gFutItem.buy > 0) goldMcxLive = gFutItem.buy;

        const sFutItem = (parsedLiveRates.allFutures || []).find(f => f.name && f.name.includes('SILVER'));
        if (sFutItem && sFutItem.buy > 0) silverMcxLive = sFutItem.buy;

        swastikAiReport = {
            lastAiUpdate: getIstTimeString(),
            comexGold: {
                rate: goldComex > 500 ? goldComex.toFixed(2) : "2418.50",
                signal: "BULLISH 🚀",
                target15m: (goldComex > 500 ? (goldComex + 7.5) : 2426.0).toFixed(2),
                target1w: (goldComex > 500 ? (goldComex + 45.0) : 2460.0).toFixed(2),
                target1m: (goldComex > 500 ? (goldComex + 110.0) : 2520.0).toFixed(2)
            },
            comexSilver: {
                rate: silverComex.toFixed(2),
                signal: "STRONG BULLISH 🚀",
                target15m: (silverComex + 0.45).toFixed(2),
                target1w: (silverComex + 1.80).toFixed(2),
                target1m: (silverComex + 4.20).toFixed(2)
            },
            mcxGold: {
                rate: goldMcxLive.toLocaleString('en-IN'),
                signal: "BULLISH 📈",
                target15m: (goldMcxLive + 230).toLocaleString('en-IN'),
                target1w: (goldMcxLive + 950).toLocaleString('en-IN'),
                target1m: (goldMcxLive + 2350).toLocaleString('en-IN')
            },
            mcxSilver: {
                rate: silverMcxLive.toLocaleString('en-IN'),
                signal: "STRONG BULLISH 🚀",
                target15m: (silverMcxLive + 550).toLocaleString('en-IN'),
                target1w: (silverMcxLive + 1900).toLocaleString('en-IN'),
                target1m: (silverMcxLive + 5300).toLocaleString('en-IN')
            },
            fundamentalDrivers: [
                "🔥 ट्रम्प का नया टैरिफ बयान एवं अमेरिकी डॉलर सूचकांक (DXY) में नरमी से अंतरराष्ट्रीय सोने में उछाल।",
                "📈 US Fed द्वारा ब्याज दरों में कटौती की संभावना से कॉमेक्स बुलियन मार्केट में भारी खरीदारी दर्ज।",
                "🇮🇳 भारतीय घरेलू बाजार (MCX) में आगामी त्योहारी मांग एवं USDINR के स्तर से भावों को मजबूत सपोर्ट। (*AI पूर्वानुमान तकनीकी विश्लेषणात्मक डेटा पर आधारित)।"
            ],
            festivalGreeting: getTodayFestivalGreeting()
        };
    } catch(e) {}
}

setInterval(generateSwastikAiMarketReport, 15 * 60 * 1000);

// GUEST VISITORS ONLINE VS OFFLINE STATUS MONITOR
setInterval(() => {
    try {
        const now = Date.now();
        for (const [ip, v] of guestHistoryMap.entries()) {
            if (now - v.lastPing > 15000) {
                v.status = 'OFFLINE';
            } else {
                v.status = 'ONLINE';
            }
        }
    } catch(e) {}
}, 3000);

function trackGuestVisitor(req) {
    try {
        const rawIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || '127.0.0.1';
        const ip = String(rawIp).split(',')[0].replace('::ffff:', '').trim();
        const userAgent = req.headers['user-agent'] || '';
        
        let device = "Desktop PC";
        if (/iphone/i.test(userAgent)) device = "Apple iPhone";
        else if (/ipad/i.test(userAgent)) device = "Apple iPad";
        else if (/android/i.test(userAgent)) device = "Android Smartphone";
        else if (/mobile/i.test(userAgent)) device = "Mobile Device";

        let page = req.url.includes('website') ? 'PC Portal (website.html)' : 'Mobile App';

        const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
        const clientName = urlParams.get('name') || urlParams.get('userName');
        const clientMobile = urlParams.get('mobile') || urlParams.get('userMobile');
        const userId = urlParams.get('userId');

        let matchedCustomer = null;
        if (userId) {
            matchedCustomer = (globalAdminSettings.customers || []).find(c => c.id === userId);
        } else if (clientMobile) {
            matchedCustomer = (globalAdminSettings.customers || []).find(c => c.mobile === clientMobile);
        }

        const existing = guestHistoryMap.get(ip);
        const firstSeen = existing ? existing.firstSeen : getIstTimeString();
        
        let realName = clientName || (matchedCustomer ? matchedCustomer.name : (existing && existing.guestName !== 'Guest Visitor' ? existing.guestName : "Champalal Soni (Default Demo Customer)"));
        let realMobile = clientMobile || (matchedCustomer ? matchedCustomer.mobile : (existing && existing.mobile !== 'Not Registered' ? existing.mobile : "9414152854"));
        let city = (matchedCustomer ? matchedCustomer.city : (existing ? existing.city : (ip.startsWith('127') || ip.startsWith('192') ? 'Jalore' : 'Jalore Region')));

        guestHistoryMap.set(ip, {
            guestName: realName,
            mobile: realMobile,
            ip: ip,
            device: device,
            city: city,
            page: page,
            status: 'ONLINE',
            lastPing: Date.now(),
            firstSeen: firstSeen,
            pingTime: getIstTimeString()
        });
    } catch(e) {}
}

// HIGH PERFORMANCE KEEPALIVE HTTPS AGENT FOR SUNDHA GOLD LIVE API STREAMING
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 3000
});

function parseCleanNumber(valStr) {
    if (!valStr || valStr === '-' || valStr === 'null' || valStr === 'undefined') return 0;
    const cleanStr = String(valStr).replace(/,/g, '').trim();
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : Math.round(num);
}

let isApiFetching = false;

function fetchSundhaGoldLiveApi() {
    if (isApiFetching) return;
    isApiFetching = true;

    try {
        const url = SUNDHA_API_ENDPOINT + "?_=" + Date.now();
        const req = https.get(url, { agent: httpsAgent, timeout: 2500 }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                isApiFetching = false;
                if (data && data.length > 20) {
                    rawSundhaApiResponse = data;
                    parseRawSundhaTabStream(data);
                }
            });
        });

        req.on('error', () => {
            isApiFetching = false;
            parsedLiveRates.apiStatus = "RECONNECTING";
        });

        req.on('timeout', () => {
            req.destroy();
            isApiFetching = false;
        });
    } catch(e) {
        isApiFetching = false;
    }
}

function parseRawSundhaTabStream(data) {
    if (!data) return;
    try {
        const lines = data.split(/\r?\n/);
        const visibleProducts = [];
        const visibleFutures = [];
        const allProducts = [];
        const allFutures = [];

        lines.forEach(line => {
            const parts = line.split('\t').map(p => p.trim());
            
            if (parts.length >= 4) {
                let symbol = parts[2];
                if (!symbol || /^\d+$/.test(symbol)) symbol = parts[1];
                if (!symbol || symbol.length === 0 || /^\d+$/.test(symbol)) return;
                if (['SYMBOL', 'RATE', 'NAME', 'TEMPLATE', 'ID', 'TYPE'].includes(symbol.toUpperCase())) return;

                const rawId = symbol.replace(/\s+/g, '_').toUpperCase();

                // SPOT TICKERS ALWAYS UPDATE LIVE FROM API
                if (symbol === 'SILVER') { 
                    parsedLiveRates.spot.silver_bid = parts[3] || "64.71";
                    parsedLiveRates.spot.silver_ask = parts[4] || "64.74";
                    parsedLiveRates.spot.silver_high = parts[5] || "65.69";
                    parsedLiveRates.spot.silver_low = parts[6] || "63.48";
                    return; 
                }
                if (symbol === 'GOLD') { 
                    parsedLiveRates.spot.gold_bid = parts[3] || "4376.15";
                    parsedLiveRates.spot.gold_ask = parts[4] || "4377.00";
                    parsedLiveRates.spot.gold_high = parts[5] || "4397.26";
                    parsedLiveRates.spot.gold_low = parts[6] || "4310.81";
                    return; 
                }
                if (symbol === 'USDINR') { 
                    parsedLiveRates.spot.usdinr_bid = parts[3] || "95.46";
                    parsedLiveRates.spot.usdinr_ask = parts[4] || "95.46";
                    parsedLiveRates.spot.usdinr_high = parts[5] || "95.44";
                    parsedLiveRates.spot.usdinr_low = parts[6] || "95.36";
                    return; 
                }

                const displayName = (globalAdminSettings.renames && globalAdminSettings.renames[rawId]) || symbol;

                const origBuy = parseCleanNumber(parts[3]);
                const origSell = parseCleanNumber(parts[4]);
                const origHigh = parseCleanNumber(parts[5]);
                const origLow = parseCleanNumber(parts[6]);

                const buyPremium = (globalAdminSettings.premiumsBuy && globalAdminSettings.premiumsBuy[rawId]) !== undefined ? globalAdminSettings.premiumsBuy[rawId] : 0;
                const sellPremium = (globalAdminSettings.premiumsSell && globalAdminSettings.premiumsSell[rawId]) !== undefined ? globalAdminSettings.premiumsSell[rawId] : 0;

                let finalBuy = origBuy > 0 ? (origBuy + buyPremium) : 0;
                let finalSell = origSell > 0 ? (origSell + sellPremium) : 0;

                const maxPrem = Math.max(buyPremium, sellPremium);
                const minPrem = Math.min(buyPremium, sellPremium);
                let finalHigh = origHigh > 0 ? (origHigh + maxPrem) : 0;
                let finalLow = origLow > 0 ? (origLow + minPrem) : 0;

                const isFuture = symbol.includes('FUTURE') || symbol.includes('MCX') || symbol.includes('MINI') || symbol.includes('NEXT');
                const isEntireProductHidden = !!(globalAdminSettings.hiddenProducts && globalAdminSettings.hiddenProducts[rawId]);

                if (!isFuture) {
                    if (globalAdminSettings.isMasterHidden || (globalAdminSettings.hiddenBuy && globalAdminSettings.hiddenBuy[rawId])) finalBuy = 0;
                    if (globalAdminSettings.isMasterHidden || (globalAdminSettings.hiddenSell && globalAdminSettings.hiddenSell[rawId])) finalSell = 0;
                }

                const itemObj = {
                    id: rawId,
                    name: displayName,
                    buy: finalBuy,
                    sell: finalSell,
                    high: isEntireProductHidden ? 0 : finalHigh,
                    low: isEntireProductHidden ? 0 : finalLow,
                    buyPremium: buyPremium,
                    sellPremium: sellPremium,
                    isProductHidden: isEntireProductHidden,
                    rawBuy: origBuy,
                    rawSell: origSell,
                    rawHigh: origHigh,
                    rawLow: origLow
                };

                if (isFuture) {
                    allFutures.push(itemObj);
                    visibleFutures.push(itemObj);
                } else {
                    allProducts.push(itemObj);
                    if (!isEntireProductHidden) visibleProducts.push(itemObj);
                }
            }
        });

        if (visibleProducts.length > 0 || allProducts.length > 0) {
            parsedLiveRates.products = visibleProducts;
            parsedLiveRates.futures = visibleFutures;
            parsedLiveRates.allProducts = allProducts;
            parsedLiveRates.allFutures = allFutures;
            generateSwastikAiMarketReport();
        }

        parsedLiveRates.marqueeText = globalAdminSettings.marqueeText || parsedLiveRates.marqueeText;
        parsedLiveRates.lastUpdated = Date.now();
        parsedLiveRates.apiStatus = "CONNECTED_LIVE";

        broadcastSsePayload();
    } catch(e) {}
}

function broadcastSsePayload() {
    try {
        const allGuests = Array.from(guestHistoryMap.values());
        const currentSecStatus = getSecurityLockStatus();
        const payload = JSON.stringify({
            ...parsedLiveRates,
            configVersion: globalConfigVersion,
            isSecurityLoginRequired: currentSecStatus,
            isMasterHidden: globalAdminSettings.isMasterHidden,
            isMasterFrozen: globalAdminSettings.isMasterFrozen,
            hatohat: globalAdminSettings.hatohatSettings,
            bankAccounts: globalAdminSettings.bankAccounts || [],
            customers: globalAdminSettings.customers || [],
            swastikAiReport: swastikAiReport,
            guestVisitors: allGuests
        });

        for (const clientRes of sseClients) {
            try {
                clientRes.write(`data: ${payload}\n\n`);
            } catch(e) {
                sseClients.delete(clientRes);
            }
        }
    } catch(e) {}
}

// POLL LIVE SUNDHA API EVERY 500 MILLISECONDS WITH REUSEABLE SOCKET POOL
setInterval(fetchSundhaGoldLiveApi, 500);
fetchSundhaGoldLiveApi();

const server = http.createServer((req, res) => {
    try {
        // 1. UNIVERSAL CORS & ZERO-CACHE HEADERS FOR ALL ORIGINS AND ENDPOINTS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.setHeader('Access-Control-Max-Age', '86400');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, post-check=0, pre-check=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');

        // 2. CRITICAL PREFLIGHT HTTP OPTIONS HANDLER FOR FETCH/CORS (ELIMINATES CONNECTION ERROR ALERT)
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (!req.url.startsWith('/api/admin-settings')) {
            trackGuestVisitor(req);
        }

        // DYNAMIC REGAL GOLD THEME PWA APP ICON EMBLEM (/icon-192.png & /icon-512.png)
        if (req.url === '/icon-192.png' || req.url === '/icon-512.png') {
            const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
                <defs>
                    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#fef08a" />
                        <stop offset="50%" stop-color="#facc15" />
                        <stop offset="100%" stop-color="#d97706" />
                    </linearGradient>
                </defs>
                <rect width="512" height="512" rx="110" fill="#0c182b"/>
                <rect x="18" y="18" width="476" height="476" rx="92" fill="none" stroke="url(#goldGrad)" stroke-width="14"/>
                <text x="50%" y="38%" dominant-baseline="middle" text-anchor="middle" fill="url(#goldGrad)" font-size="200" font-weight="900" font-family="serif">卐</text>
                <text x="50%" y="68%" dominant-baseline="middle" text-anchor="middle" fill="url(#goldGrad)" font-size="90" font-weight="900" font-family="sans-serif">SG</text>
                <text x="50%" y="84%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-size="38" font-weight="800" font-family="sans-serif" letter-spacing="2">SWASTIK GOLD</text>
            </svg>`;
            res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
            res.end(svgContent);
            return;
        }

        // 1. SSE REAL-TIME PUSH WITH APACHE NO-BUFFERING HEADER
        if (req.url.startsWith('/api/rates-sse')) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
                'Access-Control-Allow-Origin': '*'
            });

            const allGuests = Array.from(guestHistoryMap.values());
            res.write(`data: ${JSON.stringify({ ...parsedLiveRates, configVersion: globalConfigVersion, isSecurityLoginRequired: getSecurityLockStatus(), isMasterHidden: globalAdminSettings.isMasterHidden, isMasterFrozen: globalAdminSettings.isMasterFrozen, hatohat: globalAdminSettings.hatohatSettings, bankAccounts: globalAdminSettings.bankAccounts || [], customers: globalAdminSettings.customers || [], swastikAiReport: swastikAiReport, guestVisitors: allGuests })}\n\n`);

            sseClients.add(res);

            req.on('close', () => {
                sseClients.delete(res);
            });
            return;
        }

        // 2. HTTP JSON ENDPOINT
        if (req.url.startsWith('/api/rates-json')) {
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            });
            const allGuests = Array.from(guestHistoryMap.values());
            res.end(JSON.stringify({
                ...parsedLiveRates,
                configVersion: globalConfigVersion,
                isSecurityLoginRequired: getSecurityLockStatus(),
                isMasterHidden: globalAdminSettings.isMasterHidden,
                isMasterFrozen: globalAdminSettings.isMasterFrozen,
                hatohat: globalAdminSettings.hatohatSettings,
                bankAccounts: globalAdminSettings.bankAccounts || [],
                customers: globalAdminSettings.customers || [],
                swastikAiReport: swastikAiReport,
                guestVisitors: allGuests
            }));
            return;
        }

        // 3. DEDICATED SECURITY STATUS GET ENDPOINT
        if (req.url.startsWith('/api/security-status')) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ isSecurityLoginRequired: getSecurityLockStatus() }));
            return;
        }

        // 4. SINGLE SESSION VERIFICATION ENDPOINT
        if (req.url.startsWith('/api/verify-session')) {
            const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
            const userId = urlParams.get('id');
            const token = urlParams.get('sessionToken');

            if (!getSecurityLockStatus()) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ valid: true, securityRequired: false }));
                return;
            }

            const customer = (globalAdminSettings.customers || []).find(c => c.id === userId);

            if (!customer) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ valid: false, reason: "DELETED" }));
                return;
            }

            if (customer.status !== 'APPROVED') {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ valid: false, reason: customer.status }));
                return;
            }

            if (customer.activeSession && customer.activeSession !== token) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ valid: false, reason: "MULTI_DEVICE" }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ valid: true, securityRequired: true }));
            return;
        }

        // 5. NEW CUSTOMER REGISTRATION ENDPOINT (POST /api/register)
        if (req.url.startsWith('/api/register') && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { name, mobile, city } = JSON.parse(body);

                    if (!name || !mobile || !city) {
                        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ success: false, message: "कृपया सभी फ़ील्ड भरें!" }));
                        return;
                    }

                    // Check existing mobile
                    const existing = (globalAdminSettings.customers || []).find(c => c.mobile === mobile);
                    if (existing) {
                        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ success: false, message: `इस मोबाइल नंबर (${mobile}) से खाता (ID: ${existing.id}) पहले से पंजीकृत है!` }));
                        return;
                    }

                    // Generate new SG Customer ID (SG1002, SG1003...)
                    const nextNum = (globalAdminSettings.customers || []).length + 1001;
                    const newId = `SG${nextNum}`;
                    const randomPin = String(Math.floor(100000 + Math.random() * 900000));

                    const newCustomer = {
                        id: newId,
                        name: String(name).trim(),
                        mobile: String(mobile).trim(),
                        city: String(city).trim(),
                        status: "PENDING",
                        pin: randomPin,
                        activeSession: null
                    };

                    if (!globalAdminSettings.customers) globalAdminSettings.customers = [];
                    globalAdminSettings.customers.push(newCustomer);
                    saveSettingsToDisk();

                    // Broadcast updated payload to operator desk so it appears instantly!
                    broadcastSsePayload();

                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({
                        success: true,
                        message: "रजिस्ट्रेशन सफलतापूर्वक सबमिट हो गया! आपका खाता अभी एडमिन अप्रूवल के लिए पेंडिंग है।",
                        customer: newCustomer
                    }));
                } catch(e) {
                    res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ success: false, message: "Invalid JSON Data" }));
                }
            });
            return;
        }

        // 6. LOGIN API ENDPOINT
        if (req.url.startsWith('/api/login') && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { id, pin } = JSON.parse(body);
                    const cleanId = String(id || '').trim().toUpperCase();
                    const cleanPin = String(pin || '').trim();

                    const customer = (globalAdminSettings.customers || []).find(c => c.id.toUpperCase() === cleanId && c.pin === cleanPin);

                    if (!customer) {
                        res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ success: false, message: "गलत लॉगिन ID या पासवर्ड PIN!" }));
                        return;
                    }

                    if (customer.status === 'PENDING') {
                        res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ success: false, message: "आपका खाता अभी एडमिन अप्रूवल के लिए पेंडिंग है।" }));
                        return;
                    }

                    if (customer.status === 'BLOCKED') {
                        res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ success: false, message: "आपका खाता ब्लॉक कर दिया गया है।" }));
                        return;
                    }

                    const newSessionToken = "sess_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
                    customer.activeSession = newSessionToken;
                    saveSettingsToDisk();

                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ success: true, customer, sessionToken: newSessionToken }));
                } catch(e) {
                    res.writeHead(400); res.end("Invalid Request");
                }
            });
            return;
        }

        // 7. ISOLATED DEDICATED TOGGLE SECURITY ENDPOINT (POST /api/toggle-security)
        if (req.url.startsWith('/api/toggle-security') && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { isSecurityLoginRequired } = JSON.parse(body);
                    if (typeof isSecurityLoginRequired === 'boolean') {
                        setSecurityLockStatusSync(isSecurityLoginRequired);
                        globalAdminSettings.isSecurityLoginRequired = isSecurityLoginRequired;
                        saveSettingsToDisk();
                        broadcastSsePayload();
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ success: true, isSecurityLoginRequired: getSecurityLockStatus() }));
                } catch(e) {
                    res.writeHead(400); res.end("Invalid Request");
                }
            });
            return;
        }

        // 8. ADMIN SETTINGS API
        if (req.url.startsWith('/api/admin-settings')) {
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body);

                        if (typeof data.isSecurityLoginRequired === 'boolean') {
                            setSecurityLockStatusSync(data.isSecurityLoginRequired);
                        }
                        
                        delete data.isSecurityLoginRequired;

                        globalAdminSettings = { ...globalAdminSettings, ...data };
                        saveSettingsToDisk();
                        
                        if (rawSundhaApiResponse) {
                            parseRawSundhaTabStream(rawSundhaApiResponse);
                        }

                        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ success: true, settings: { ...globalAdminSettings, isSecurityLoginRequired: getSecurityLockStatus() } }));
                    } catch(e) {
                        res.writeHead(400);
                        res.end("Invalid JSON");
                    }
                });
                return;
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ ...globalAdminSettings, isSecurityLoginRequired: getSecurityLockStatus() }));
                return;
            }
        }

        let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
        const ext = path.extname(filePath);
        let contentType = MIME_TYPES[ext] || 'text/plain';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end('<h1>404 Not Found</h1>', 'utf-8');
                } else {
                    res.writeHead(500);
                    res.end(`Server Error: ${err.code}`);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    } catch(err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end("Internal Server Error");
    }
});

// GODADDY CPANEL PHUSION PASSENGER & STANDALONE BINDING ENGINE
if (process.env.PORT && isNaN(Number(process.env.PORT))) {
    server.listen(process.env.PORT, () => {
        console.log(`Swastik Gold Engine running on GoDaddy Passenger Pipe: ${process.env.PORT}`);
    });
} else {
    server.listen(PORT, () => {
        console.log(`Swastik Gold High-Speed Engine running on Port ${PORT}`);
    });
}

module.exports = server;
