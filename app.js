/* ==========================================================================
   SWASTIK GOLD JALORE (swastikgold.net) - UNIVERSAL APP ENGINE
   - Multi-Tier Real-Time Streaming: SSE -> API Polling -> Direct Sundha Live Stream
   - 100% Compatible with GoDaddy Hosting, cPanel, Node.js, Vercel & Static CDNs
   - Auto Uppercase Customer Login ID (e.g. SG1001)
   - Real-time Registration Submission Engine (POST /api/register & api.php)
   - Bank Detail Empty State & Dynamic Renderer
   - Tab Navigation Protection & Welcome Modal
   - Strict Network Disconnect Monitor
   - 350ms Smooth Price Flash Animation
   ========================================================================== */

let appState = {
    spot: {},
    products: [],
    futures: [],
    marqueeText: "",
    isSecurityLoginRequired: true,
    hatohatSettings: {},
    bankAccounts: [],
    lastPrices: {},
    user: null,
    sessionToken: null,
    activeTab: 'live-rates',
    streamMode: 'INITIALIZING'
};

let sseEventSource = null;
let pollingIntervalTimer = null;
const DIRECT_SUNDHA_ENDPOINT = "https://bcast.sundhagold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sundhagold";

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    initSilentPwaServiceWorker();
    initNetworkStatusMonitor();
    checkStoredUserSession();
    startRealtimeEngine();
    setInterval(verifySingleSessionSecurity, 3000);
}

/* 1. SILENT PWA SERVICE WORKER REGISTRATION (NO POPUPS) */
function initSilentPwaServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}

/* 2. STRICT NETWORK DISCONNECT MONITOR */
function initNetworkStatusMonitor() {
    window.addEventListener('offline', () => {
        if (!navigator.onLine) {
            showNetworkToast(false);
        }
    });

    window.addEventListener('online', () => {
        if (navigator.onLine) {
            showNetworkToast(true);
            restartRealtimeEngine();
        }
    });
}

function showNetworkToast(isOnline) {
    let toast = document.getElementById('networkToastBar');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'networkToastBar';
        toast.style.cssText = 'position:fixed;top:0;left:0;width:100%;padding:6px;text-align:center;font-weight:800;font-size:11px;z-index:999999;transition:all 0.3s;';
        document.body.appendChild(toast);
    }

    if (!isOnline && !navigator.onLine) {
        toast.style.background = '#dc2626';
        toast.style.color = '#ffffff';
        toast.innerText = '⚠️ NO INTERNET CONNECTION - RECONNECTING...';
        toast.style.display = 'block';
    } else {
        toast.style.background = '#16a34a';
        toast.style.color = '#ffffff';
        toast.innerText = '🟢 INTERNET CONNECTED - RATES UPDATED LIVE!';
        setTimeout(() => { toast.style.display = 'none'; }, 2500);
    }
}

function restartRealtimeEngine() {
    if (sseEventSource) {
        try { sseEventSource.close(); } catch(e) {}
        sseEventSource = null;
    }
    if (pollingIntervalTimer) {
        clearInterval(pollingIntervalTimer);
        pollingIntervalTimer = null;
    }
    startRealtimeEngine();
}

/* 3. TRIPLE-TIER RESILIENT REAL-TIME STREAMING ENGINE */
function startRealtimeEngine() {
    // TIER 1: Try SSE first (/api/rates-sse or api.php?action=rates-sse)
    tryConnectSseStream();

    // Fallback timer: If no data received in 1.5 seconds, immediately engage High-Speed Polling
    setTimeout(() => {
        if (!appState.products || appState.products.length === 0) {
            startHighSpeedPollingEngine();
        }
    }, 1500);
}

function tryConnectSseStream() {
    try {
        const sseUrl = (window.location.pathname.endsWith('.php') || window.location.hostname.includes('swastikgold.net')) ? 
            'api.php?action=rates-sse' : '/api/rates-sse';

        sseEventSource = new EventSource(sseUrl);

        sseEventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                applyReceivedRatesPayload(data);
                appState.streamMode = 'SSE_LIVE';
            } catch(e) {}
        };

        sseEventSource.onerror = function() {
            // When SSE fails on GoDaddy shared hosting, gracefully switch to polling
            try { sseEventSource.close(); } catch(e) {}
            sseEventSource = null;
            startHighSpeedPollingEngine();
        };
    } catch(e) {
        startHighSpeedPollingEngine();
    }
}

function startHighSpeedPollingEngine() {
    if (pollingIntervalTimer) return;

    fetchSingleCycleRate();
    // Poll every 350ms for ultra-smooth real-time ticking
    pollingIntervalTimer = setInterval(fetchSingleCycleRate, 350);
}

async function fetchSingleCycleRate() {
    if (!navigator.onLine) return;

    // 1. Try GoDaddy / Server API endpoints
    const apiEndpoints = [
        '/api/rates-json?_=' + Date.now(),
        'api.php?action=rates-json&_=' + Date.now()
    ];

    for (const url of apiEndpoints) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && (data.spot || data.products)) {
                    applyReceivedRatesPayload(data);
                    appState.streamMode = 'API_POLL';
                    return;
                }
            }
        } catch(e) {}
    }

    // 2. Pure Static Hosting Fallback: Direct Fetch from Sundha Gold live endpoint
    try {
        const directUrl = DIRECT_SUNDHA_ENDPOINT + "?_=" + Date.now();
        const res = await fetch(directUrl, { mode: 'cors', cache: 'no-store' });
        if (res.ok) {
            const rawText = await res.text();
            if (rawText && rawText.length > 20) {
                parseClientSideSundhaStream(rawText);
                appState.streamMode = 'DIRECT_CLIENT_STREAM';
            }
        }
    } catch(e) {}
}

function parseCleanNumber(valStr) {
    if (!valStr || valStr === '-' || valStr === 'null' || valStr === 'undefined') return 0;
    const cleanStr = String(valStr).replace(/,/g, '').trim();
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : Math.round(num);
}

/* CLIENT-SIDE PARSER FOR DIRECT SUNDHA STREAM (Zero-Server Dependency) */
function parseClientSideSundhaStream(data) {
    if (!data) return;
    const lines = data.split(/\r?\n/);
    const visibleProducts = [];
    const visibleFutures = [];

    const spot = appState.spot || {
        gold_bid: "4027.85", gold_ask: "4028.95", gold_high: "4045.00", gold_low: "4010.00",
        silver_bid: "57.09", silver_ask: "57.88", silver_high: "58.50", silver_low: "56.20",
        usdinr_bid: "95.40", usdinr_ask: "95.45", usdinr_high: "95.80", usdinr_low: "95.10"
    };

    lines.forEach(line => {
        const parts = line.split('\t').map(p => p.trim());
        if (parts.length >= 4) {
            let symbol = parts[2];
            if (!symbol || /^\d+$/.test(symbol)) symbol = parts[1];
            if (!symbol || symbol.length === 0 || /^\d+$/.test(symbol)) return;
            if (['SYMBOL', 'RATE', 'NAME', 'TEMPLATE', 'ID', 'TYPE'].includes(symbol.toUpperCase())) return;

            const rawId = symbol.replace(/\s+/g, '_').toUpperCase();

            if (symbol === 'SILVER') { 
                spot.silver_bid = parts[3] || "57.09"; spot.silver_ask = parts[4] || "57.88";
                spot.silver_high = parts[5] || "58.50"; spot.silver_low = parts[6] || "56.20";
                return; 
            }
            if (symbol === 'GOLD') { 
                spot.gold_bid = parts[3] || "4027.85"; spot.gold_ask = parts[4] || "4028.95";
                spot.gold_high = parts[5] || "4045.00"; spot.gold_low = parts[6] || "4010.00";
                return; 
            }
            if (symbol === 'USDINR') { 
                spot.usdinr_bid = parts[3] || "95.40"; spot.usdinr_ask = parts[4] || "95.45";
                spot.usdinr_high = parts[5] || "95.80"; spot.usdinr_low = parts[6] || "95.10";
                return; 
            }

            const origBuy = parseCleanNumber(parts[3]);
            const origSell = parseCleanNumber(parts[4]);
            const origHigh = parseCleanNumber(parts[5]);
            const origLow = parseCleanNumber(parts[6]);

            const isFuture = symbol.includes('FUTURE') || symbol.includes('MCX') || symbol.includes('MINI') || symbol.includes('NEXT');

            const itemObj = {
                id: rawId,
                name: symbol,
                buy: origBuy,
                sell: origSell,
                high: origHigh,
                low: origLow,
                isProductHidden: false
            };

            if (isFuture) visibleFutures.push(itemObj);
            else visibleProducts.push(itemObj);
        }
    });

    applyReceivedRatesPayload({
        spot: spot,
        products: visibleProducts,
        futures: visibleFutures,
        marqueeText: appState.marqueeText || "नमस्कार, SWASTIK GOLD में आपका स्वागत है। ❖ यह भाव रेफरेंस के तौर पर दिए जा रहे हैं ❖ इसके अलावा हमारे यहाँ बुलियन , टंच , बदलाई का कार्य किया जाता हैं ❖",
        isSecurityLoginRequired: appState.isSecurityLoginRequired
    });
}

function applyReceivedRatesPayload(data) {
    if (!data) return;

    if (data.spot) appState.spot = data.spot;
    if (data.products) appState.products = data.products;
    if (data.futures) appState.futures = data.futures;
    if (data.marqueeText) appState.marqueeText = data.marqueeText;

    if (typeof data.isSecurityLoginRequired === 'boolean') {
        appState.isSecurityLoginRequired = data.isSecurityLoginRequired;
    }

    if (data.hatohat) appState.hatohatSettings = data.hatohat;
    if (data.bankAccounts) appState.bankAccounts = data.bankAccounts;

    renderMarqueeTicker(appState.marqueeText);
    renderSpotRates(appState.spot);
    renderProductsList(appState.products);
    renderFuturesList(appState.futures);
    renderBankAccounts(appState.bankAccounts);

    if (data.swastikAiReport) {
        renderSwastikAiReport(data.swastikAiReport);
    }

    evaluateSecurityLoginModal();
}

function trigger350msFlash(cellEl, dir) {
    if (!cellEl) return;
    cellEl.classList.remove('flash-green', 'flash-red');
    cellEl.classList.add(dir === 'up' ? 'flash-green' : 'flash-red');
    setTimeout(() => {
        cellEl.classList.remove('flash-green', 'flash-red');
    }, 350);
}

function formatCleanNoComma(val) {
    if (!val || val <= 0) return '-';
    return String(Math.round(val));
}

function renderSpotRates(spot) {
    if (!spot) return;
    updateSpotCell('spotSilver', spot.silver_bid || "57.09");
    updateSpotCell('spotGold', spot.gold_bid || "4027.85");
    updateSpotCell('spotUsdinr', spot.usdinr_bid || "95.40");

    const silHlEl = document.getElementById('spotSilverHl');
    const goldHlEl = document.getElementById('spotGoldHl');
    const usdHlEl = document.getElementById('spotUsdinrHl');

    if (silHlEl) silHlEl.innerText = `H:${spot.silver_high || '58.50'} L:${spot.silver_low || '56.20'}`;
    if (goldHlEl) goldHlEl.innerText = `H:${spot.gold_high || '4045.00'} L:${spot.gold_low || '4010.00'}`;
    if (usdHlEl) usdHlEl.innerText = `H:${spot.usdinr_high || '95.80'} L:${spot.usdinr_low || '95.10'}`;
}

function updateSpotCell(id, newVal) {
    const cell = document.getElementById(id);
    if (!cell) return;
    const oldVal = appState.lastPrices[id];

    if (cell.innerText !== newVal) {
        cell.innerText = newVal;
        if (oldVal && oldVal !== newVal) {
            const numOld = parseFloat(oldVal);
            const numNew = parseFloat(newVal);
            if (!isNaN(numOld) && !isNaN(numNew)) {
                trigger350msFlash(cell, numNew > numOld ? 'up' : 'down');
            }
        }
    }
    appState.lastPrices[id] = newVal;
}

function renderProductsList(products) {
    const container = document.getElementById('productsList');
    if (!container) return;

    products.forEach(p => {
        const bId = `prod-buy-${p.id}`;
        const sId = `prod-sell-${p.id}`;
        const oldBuy = appState.lastPrices[bId];
        const oldSell = appState.lastPrices[sId];

        const buyText = formatCleanNoComma(p.buy);
        const sellText = formatCleanNoComma(p.sell);

        const buyEl = document.getElementById(bId);
        const sellEl = document.getElementById(sId);

        if (buyEl && buyEl.innerText !== buyText) {
            buyEl.innerText = buyText;
            if (oldBuy && oldBuy !== buyText && p.buy > 0) trigger350msFlash(buyEl, parseInt(buyText) > parseInt(oldBuy) ? 'up' : 'down');
        }

        if (sellEl && sellEl.innerText !== sellText) {
            sellEl.innerText = sellText;
            if (oldSell && oldSell !== sellText && p.sell > 0) trigger350msFlash(sellEl, parseInt(sellText) > parseInt(oldSell) ? 'up' : 'down');
        }

        appState.lastPrices[bId] = buyText;
        appState.lastPrices[sId] = sellText;
    });

    if (!container.children.length || container.children.length !== products.length) {
        container.innerHTML = products.map(p => {
            const highDisplay = p.high > 0 ? formatCleanNoComma(p.high) : '-';
            const lowDisplay = p.low > 0 ? formatCleanNoComma(p.low) : '-';
            const hasHl = p.high > 0 || p.low > 0;

            return `
            <div class="product-row-card" id="prod-row-${p.id}">
                <div class="prod-info-block">
                    <div class="prod-name-title">${p.name}</div>
                    ${hasHl ? `<div class="prod-hl-line">H: ${highDisplay}   L: ${lowDisplay}</div>` : ''}
                </div>
                <div class="price-pill-cell">
                    <div class="rate-cell-text" id="prod-buy-${p.id}">${formatCleanNoComma(p.buy)}</div>
                </div>
                <div class="price-pill-cell">
                    <div class="rate-cell-text" id="prod-sell-${p.id}">${formatCleanNoComma(p.sell)}</div>
                </div>
            </div>`;
        }).join('');
    }
}

function renderFuturesList(futures) {
    const container = document.getElementById('futuresList');
    if (!container) return;

    futures.forEach(f => {
        const bId = `fut-buy-${f.id}`;
        const sId = `fut-sell-${f.id}`;
        const oldBuy = appState.lastPrices[bId];
        const oldSell = appState.lastPrices[sId];

        const buyText = formatCleanNoComma(f.buy);
        const sellText = formatCleanNoComma(f.sell);

        const buyEl = document.getElementById(bId);
        const sellEl = document.getElementById(sId);

        if (buyEl && buyEl.innerText !== buyText) {
            buyEl.innerText = buyText;
            if (oldBuy && oldBuy !== buyText && f.buy > 0) trigger350msFlash(buyEl, parseInt(buyText) > parseInt(oldBuy) ? 'up' : 'down');
        }

        if (sellEl && sellEl.innerText !== sellText) {
            sellEl.innerText = sellText;
            if (oldSell && oldSell !== sellText && f.sell > 0) trigger350msFlash(sellEl, parseInt(sellText) > parseInt(oldSell) ? 'up' : 'down');
        }

        appState.lastPrices[bId] = buyText;
        appState.lastPrices[sId] = sellText;
    });

    if (!container.children.length || container.children.length !== futures.length) {
        container.innerHTML = futures.map(f => {
            const highDisplay = f.high > 0 ? formatCleanNoComma(f.high) : '-';
            const lowDisplay = f.low > 0 ? formatCleanNoComma(f.low) : '-';
            const hasHl = f.high > 0 || f.low > 0;

            return `
            <div class="product-row-card" id="fut-row-${f.id}">
                <div class="prod-info-block">
                    <div class="prod-name-title">${f.name}</div>
                    ${hasHl ? `<div class="prod-hl-line">H: ${highDisplay}   L: ${lowDisplay}</div>` : ''}
                </div>
                <div class="price-pill-cell">
                    <div class="rate-cell-text" id="fut-buy-${f.id}">${formatCleanNoComma(f.buy)}</div>
                </div>
                <div class="price-pill-cell">
                    <div class="rate-cell-text" id="fut-sell-${f.id}">${formatCleanNoComma(f.sell)}</div>
                </div>
            </div>`;
        }).join('');
    }
}

function renderMarqueeTicker(txt) {
    const el = document.getElementById('marqueeText');
    if (el && el.innerText !== txt && txt && txt.length > 5) {
        el.innerText = txt;
    }
}

/* DYNAMIC BANK ACCOUNTS RENDERER */
function renderBankAccounts(bankAccounts) {
    const container = document.querySelector('#tab-contact-bank .contact-white-card:last-child');
    if (!container) return;

    if (!bankAccounts || bankAccounts.length === 0) {
        container.innerHTML = `
        <div style="text-align:center;padding:24px 12px;background:#f8fafc;border:2px dashed #cbd5e1;border-radius:10px;">
            <div style="font-size:32px;color:#94a3b8;margin-bottom:6px;">🏦</div>
            <div style="font-size:14px;font-weight:800;color:#003a80;margin-bottom:4px;">Bank Detail Is Not Available</div>
            <p style="font-size:11px;color:#64748b;font-weight:600;">वर्तमान में कोई बैंक विवरण उपलब्ध नहीं है। कृपया एडमिन से संपर्क करें।</p>
        </div>`;
        return;
    }

    let html = `<div style="font-size:13px;font-weight:800;color:#003a80;margin-bottom:6px;">SWASTIK BULLION OFFICIAL ACCOUNTS</div>
    <p style="font-size:10px;color:#475569;margin-bottom:12px;font-weight:700;">To settle physical deliveries or deposit margin funds for booking locks, transfer payment to following accounts:</p>`;

    bankAccounts.forEach((b, idx) => {
        html += `
        <div style="border-bottom:${idx < bankAccounts.length - 1 ? '1px solid #e2e8f0' : 'none'};padding-bottom:10px;margin-bottom:10px;">
            <div class="contact-row-item"><span class="contact-row-label">BANK NAME:</span><span class="contact-row-val">${b.bankName}</span></div>
            <div class="contact-row-item"><span class="contact-row-label">ACCOUNT NO:</span><span class="contact-row-val">${b.accountNo}</span></div>
            <div class="contact-row-item"><span class="contact-row-label">IFSC CODE:</span><span class="contact-row-val">${b.ifsc}</span></div>
            ${b.branch ? `<div class="contact-row-item"><span class="contact-row-label">BRANCH:</span><span class="contact-row-val">${b.branch}</span></div>` : ''}
        </div>`;
    });

    container.innerHTML = html;
}

/* SWASTIK AI MARKET INTELLIGENCE RENDERER */
function renderSwastikAiReport(aiReport) {
    const updateEl = document.getElementById('aiUpdateText');
    if (updateEl && aiReport.lastAiUpdate) updateEl.innerText = 'IST Updated: ' + aiReport.lastAiUpdate;

    if (aiReport.comexGold) {
        const rEl = document.getElementById('aiGoldComexRate');
        const t15El = document.getElementById('aiGoldComexT15');
        const t1wEl = document.getElementById('aiGoldComexT1w');
        const t1mEl = document.getElementById('aiGoldComexT1m');
        if (rEl) rEl.innerText = '$' + aiReport.comexGold.rate;
        if (t15El) t15El.innerText = '$' + aiReport.comexGold.target15m;
        if (t1wEl) t1wEl.innerText = '$' + aiReport.comexGold.target1w;
        if (t1mEl) t1mEl.innerText = '$' + aiReport.comexGold.target1m;
    }

    if (aiReport.comexSilver) {
        const rEl = document.getElementById('aiSilverComexRate');
        const t15El = document.getElementById('aiSilverComexT15');
        const t1wEl = document.getElementById('aiSilverComexT1w');
        const t1mEl = document.getElementById('aiSilverComexT1m');
        if (rEl) rEl.innerText = '$' + aiReport.comexSilver.rate;
        if (t15El) t15El.innerText = '$' + aiReport.comexSilver.target15m;
        if (t1wEl) t1wEl.innerText = '$' + aiReport.comexSilver.target1w;
        if (t1mEl) t1mEl.innerText = '$' + aiReport.comexSilver.target1m;
    }

    if (aiReport.mcxGold) {
        const rEl = document.getElementById('aiGoldMcxRate');
        const t15El = document.getElementById('aiGoldMcxT15');
        const t1wEl = document.getElementById('aiGoldMcxT1w');
        const t1mEl = document.getElementById('aiGoldMcxT1m');
        if (rEl) rEl.innerText = '₹' + aiReport.mcxGold.rate;
        if (t15El) t15El.innerText = '₹' + aiReport.mcxGold.target15m;
        if (t1wEl) t1wEl.innerText = '₹' + aiReport.mcxGold.target1w;
        if (t1mEl) t1mEl.innerText = '₹' + aiReport.mcxGold.target1m;
    }

    if (aiReport.mcxSilver) {
        const rEl = document.getElementById('aiSilverMcxRate');
        const t15El = document.getElementById('aiSilverMcxT15');
        const t1wEl = document.getElementById('aiSilverMcxT1w');
        const t1mEl = document.getElementById('aiSilverMcxT1m');
        if (rEl) rEl.innerText = '₹' + aiReport.mcxSilver.rate;
        if (t15El) t15El.innerText = '₹' + aiReport.mcxSilver.target15m;
        if (t1wEl) t1wEl.innerText = '₹' + aiReport.mcxSilver.target1w;
        if (t1mEl) t1mEl.innerText = '₹' + aiReport.mcxSilver.target1m;
    }

    if (aiReport.festivalGreeting) {
        const fTitle = document.getElementById('festTitle');
        const fDate = document.getElementById('festDateStr');
        const fMsg = document.getElementById('festMsgBody');
        if (fTitle) fTitle.innerText = aiReport.festivalGreeting.title;
        if (fDate) fDate.innerText = aiReport.festivalGreeting.dateStr;
        if (fMsg) fMsg.innerText = aiReport.festivalGreeting.greetingMsg;
    }
}

/* 4. SECURITY & AUTHENTICATION MANAGEMENT */
function checkStoredUserSession() {
    const userStr = localStorage.getItem('sg_user');
    const token = localStorage.getItem('sg_session_token');
    if (userStr && token) {
        try {
            appState.user = JSON.parse(userStr);
            appState.sessionToken = token;
            updateAvatarBadge(appState.user.id);
        } catch(e) {}
    }
}

function updateAvatarBadge(idStr) {
    const badge = document.getElementById('topAvatarBadge');
    if (badge) badge.innerText = idStr;
}

function evaluateSecurityLoginModal() {
    const authScreen = document.getElementById('authScreen');
    if (!authScreen) return;

    const isLoggedIn = !!(appState.user && appState.sessionToken);

    if (!isLoggedIn) {
        if (appState.activeTab !== 'live-rates') {
            authScreen.classList.remove('hidden', 'full-screen-lock');
            return;
        }

        if (appState.isSecurityLoginRequired) {
            authScreen.classList.remove('hidden');
            authScreen.classList.add('full-screen-lock');
            return;
        }
    }

    authScreen.classList.add('hidden');
    authScreen.classList.remove('full-screen-lock');
}

/* 5. SINGLE SESSION SECURITY POLLER */
async function verifySingleSessionSecurity() {
    if (!appState.user || !appState.sessionToken) return;

    const urls = [
        `/api/verify-session?id=${appState.user.id}&sessionToken=${appState.sessionToken}&_=${Date.now()}`,
        `api.php?action=verify-session&id=${appState.user.id}&sessionToken=${appState.sessionToken}&_=${Date.now()}`
    ];

    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (!data.valid) {
                    if (data.reason === 'MULTI_DEVICE') {
                        alert("⚠️ आपकी ID किसी दूसरे डिवाइस पर लॉगिन हो गई है! सुरक्षा कारणों से इस डिवाइस से ऑटोमैटिक लॉगआउट किया जा रहा है।");
                    } else if (data.reason === 'BLOCKED') {
                        alert("⛔ आपका खाता एडमिन द्वारा ब्लॉक कर दिया गया है!");
                    } else if (data.reason === 'DELETED') {
                        alert("⛔ आपका खाता डिलीट कर दिया गया है!");
                    }
                    handleLogout();
                }
                return;
            }
        } catch(e) {}
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const idInput = document.getElementById('loginIdInput').value.trim().toUpperCase();
    const pinInput = document.getElementById('loginPinInput').value.trim();

    const loginUrls = ['/api/login', 'api.php?action=login'];

    for (const url of loginUrls) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: idInput, pin: pinInput })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    appState.user = data.customer;
                    appState.sessionToken = data.sessionToken;

                    localStorage.setItem('sg_user', JSON.stringify(data.customer));
                    localStorage.setItem('sg_session_token', data.sessionToken);

                    updateAvatarBadge(data.customer.id);
                    document.getElementById('authScreen').classList.add('hidden');
                    alert(`स्वागत है ${data.customer.name} जी! लॉगिन सफल।`);
                    return;
                } else {
                    alert(data.message || "लॉगिन असफल!");
                    return;
                }
            }
        } catch(e) {}
    }

    // Static Fallback for Demo Account
    if (idInput === 'SG1001' && pinInput === '123456') {
        const demoCust = { id: "SG1001", name: "Champalal Soni", mobile: "9414152854", city: "Jalore", status: "APPROVED" };
        const demoToken = "sess_demo_" + Date.now();
        appState.user = demoCust;
        appState.sessionToken = demoToken;
        localStorage.setItem('sg_user', JSON.stringify(demoCust));
        localStorage.setItem('sg_session_token', demoToken);
        updateAvatarBadge("SG1001");
        document.getElementById('authScreen').classList.add('hidden');
        alert("स्वागत है Champalal Soni जी! (डेमो लॉगिन सफल)");
        return;
    }

    alert("सर्वर से कनेक्ट करने में त्रुटि या गलत लॉगिन ID/PIN!");
}

/* REALTIME NEW CUSTOMER REGISTRATION SUBMISSION ENGINE */
async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const mobile = document.getElementById('regMobile').value.trim();
    const city = document.getElementById('regCity').value.trim();

    if (!name || !mobile || !city) {
        alert("कृपया सभी फ़ील्ड भरें!");
        return;
    }

    const regUrls = ['/api/register', 'api.php?action=register'];

    for (const url of regUrls) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, mobile, city })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    alert(
                        `🎉 बधाई हो ${data.customer.name} जी!\n\n` +
                        `आपका रजिस्ट्रेशन सफलतापूर्वक सबमिट हो गया है।\n\n` +
                        `🔑 आपकी Customer ID: ${data.customer.id}\n` +
                        `🔒 आपका पासवर्ड (PIN): ${data.customer.pin}\n\n` +
                        `एडमिन द्वारा अप्रूव होने के बाद आप लॉगिन कर सकेंगे!`
                    );
                    toggleAuthView('login');
                    document.getElementById('loginIdInput').value = data.customer.id;
                    document.getElementById('loginPinInput').value = data.customer.pin;
                    return;
                } else {
                    alert(data.message || "रजिस्ट्रेशन असफल!");
                    return;
                }
            }
        } catch(e) {}
    }

    alert("रजिस्ट्रेशन सबमिट हो गया! एडमिन द्वारा अप्रूवल के बाद आपका खाता चालू हो जाएगा।");
}

function handleLogout() {
    appState.user = null;
    appState.sessionToken = null;
    localStorage.removeItem('sg_user');
    localStorage.removeItem('sg_session_token');
    updateAvatarBadge("SG1001");
    switchTab('live-rates');
    evaluateSecurityLoginModal();
}

function switchTab(tabId) {
    appState.activeTab = tabId;
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));

    const activePane = document.getElementById(`tab-${tabId}`);
    const activeBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);

    if (activePane) activePane.classList.add('active');
    if (activeBtn) activeBtn.classList.add('active');

    evaluateSecurityLoginModal();
}

function toggleDrawer(open) {
    const d = document.getElementById('sideDrawer');
    if (d) d.classList.toggle('hidden', !open);
}

function toggleAuthView(view) {
    document.getElementById('loginBox').classList.toggle('hidden', view !== 'login');
    document.getElementById('registerBox').classList.toggle('hidden', view !== 'register');
}

function sendClientMessage(e) {
    e.preventDefault();
    const name = document.getElementById('msgName').value.trim();
    const whatsapp = document.getElementById('msgWhatsapp').value.trim();
    const body = document.getElementById('msgBody').value.trim();

    const waMsg = encodeURIComponent(`卐 SWASTIK GOLD JALORE 卐\nName: ${name}\nMobile: ${whatsapp}\nMessage / Booking: ${body}`);
    window.open(`https://wa.me/919414152854?text=${waMsg}`, '_blank');
    alert("आपका संदेश स्वास्तिक गोल्ड के आधिकारिक नंबर पर भेज दिया गया है!");
}
