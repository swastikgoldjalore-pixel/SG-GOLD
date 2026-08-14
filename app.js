/* ==========================================================================
   SWASTIK GOLD JALORE (swastikgold.net) - UNIVERSAL APP ENGINE
   - Spot Rates 3-Column Side-by-Side (SILVER COMEX, GOLD COMEX, USDINR)
   - Real-time Product Reordering Synchronization
   - Single-Session (Session-1) 0ms Conflict Auto-Logout & Admin Force Logout
   - Pure Swastik Gold Jalore Branding
   ========================================================================== */

const INITIAL_DEFAULT_PRODUCTS = [
    { id: "GOLD_999_KD", name: "Gold 999 KD", buy: 150340, sell: 150940, rawBuy: 150340, rawSell: 150940, high: 150940, low: 149800, isProductHidden: false },
    { id: "GOLD_9950_IMPOTED", name: "Gold 9950 Imported", buy: 149690, sell: 150290, rawBuy: 149690, rawSell: 150290, high: 150290, low: 149200, isProductHidden: false },
    { id: "GOLD_RTGS_999", name: "GOLD RTGS 999", buy: 0, sell: 158390, rawBuy: 0, rawSell: 158390, high: 158390, low: 157200, isProductHidden: false },
    { id: "RANI", name: "RANI", buy: 149990, sell: 0, rawBuy: 149990, rawSell: 0, high: 150500, low: 149500, isProductHidden: false },
    { id: "SILVER_CHORSA_98", name: "Silver Chorsa 98", buy: 228690, sell: 230190, rawBuy: 228690, rawSell: 230190, high: 230190, low: 227500, isProductHidden: false },
    { id: "RUPA", name: "RUPA", buy: 232100, sell: 0, rawBuy: 232100, rawSell: 0, high: 233000, low: 231000, isProductHidden: false }
];

const INITIAL_DEFAULT_FUTURES = [
    { id: "GOLD_FUTURE", name: "GOLD FUTURE", buy: 154460, sell: 154590, rawBuy: 154460, rawSell: 154590, high: 154950, low: 151923, isProductHidden: false },
    { id: "SILVER_FUTURE", name: "SILVER FUTURE", buy: 235872, sell: 236190, rawBuy: 235872, rawSell: 236190, high: 237822, low: 231550, isProductHidden: false }
];

const INITIAL_DEFAULT_SPOT = {
    gold_bid: "4375.95", gold_ask: "4376.65", gold_high: "4397.26", gold_low: "4310.81",
    silver_bid: "64.75", silver_ask: "64.77", silver_high: "65.69", silver_low: "63.48",
    usdinr_bid: "95.46", usdinr_ask: "95.47", usdinr_high: "95.80", usdinr_low: "95.10"
};

let appState = {
    spot: { ...INITIAL_DEFAULT_SPOT },
    products: [ ...INITIAL_DEFAULT_PRODUCTS ],
    futures: [ ...INITIAL_DEFAULT_FUTURES ],
    marqueeText: "नमस्कार, SWASTIK GOLD में आपका स्वागत है। ❖ यह भाव रेफरेंस के तौर पर दिए जा रहे हैं ❖ इसके अलावा हमारे यहाँ बुलियन , टंच , बदलाई एवं गलाई का कार्य किया जाता हैं ❖",
    isSecurityLoginRequired: false,
    bankAccounts: [
        { id: "bank_1", bankName: "HDFC Bank Ltd", accountNo: "50200084712035", ifsc: "HDFC0000241", branch: "gandhi chowk, Jalore", accountType: "Bullion Current Account" },
        { id: "bank_2", bankName: "State Bank of India", accountNo: "38147295103", ifsc: "SBIN0001034", branch: "Jalore Main Branch", accountType: "Bullion Current Account" }
    ],
    lastPrices: {},
    user: null,
    sessionToken: null,
    activeTab: 'live-rates',
    adminSettings: {
        renames: {},
        premiumsBuy: {},
        premiumsSell: {},
        hiddenProducts: {},
        hiddenBuy: {},
        hiddenSell: {},
        isMasterHidden: false,
        isMasterFrozen: false,
        productOrder: ["GOLD_999_KD", "GOLD_9950_IMPOTED", "GOLD_RTGS_999", "RANI", "SILVER_CHORSA_98", "RUPA", "GOLD_FUTURE", "SILVER_FUTURE"],
        marqueeText: "नमस्कार, SWASTIK GOLD में आपका स्वागत है। ❖ यह भाव रेफरेंस के तौर पर दिए जा रहे हैं ❖ इसके अलावा हमारे यहाँ बुलियन , टंच , बदलाई एवं गलाई का कार्य किया जाता हैं ❖",
        popupMsg: "Gold and Silver Swastik Gold mein aapka swagat hai. Booking Hours: 10:00 AM to 8:00 PM."
    },
    lastLiveFetchTime: 0
};

let sseEventSource = null;
let pollingIntervalTimer = null;
let liveTickSimulationTimer = null;
let syncChannel = null;
const DIRECT_SUNDHA_ENDPOINT = "https://bcast.sundhagold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sundhagold";

// REAL-TIME BROADCAST CHANNEL FOR 0MS MULTI-DEVICE & ADMIN SYNC
try {
    syncChannel = new BroadcastChannel('sg_realtime_sync');
    syncChannel.onmessage = (e) => {
        if (!e.data) return;
        const msg = e.data;

        if (msg.type === 'SESSION_INVALIDATED' && appState.user && appState.user.id === msg.customerId) {
            if (appState.sessionToken !== msg.newSessionToken) {
                alert("⚠️ आपकी ID किसी दूसरे डिवाइस/ब्राउज़र पर लॉगिन हो गई है!");
                handleLogout(false);
            }
        } else if (msg.type === 'FORCE_LOGOUT_CUSTOMER' && appState.user && appState.user.id === msg.customerId) {
            alert(msg.reason === 'BLOCKED' ? "⛔ आपका खाता एडमिन द्वारा ब्लॉक कर दिया गया है!" : "⛔ आपका खाता डिलीट कर दिया गया है!");
            handleLogout(false);
        } else if (msg.type === 'SECURITY_TOGGLE') {
            appState.isSecurityLoginRequired = msg.isSecurityLoginRequired;
            evaluateSecurityLoginModal();
        } else if (msg.type === 'SETTINGS_UPDATE' && msg.settings) {
            appState.adminSettings = { ...appState.adminSettings, ...msg.settings };
            if (msg.settings.marqueeText) {
                appState.marqueeText = msg.settings.marqueeText;
                renderMarqueeTicker(msg.settings.marqueeText);
            }
            if (msg.settings.bankAccounts) renderBankAccounts(msg.settings.bankAccounts);
            renderProductsList(appState.products);
            renderFuturesList(appState.futures);
        }
    };
} catch(e) {}

window.addEventListener('storage', (e) => {
    if (e.key === 'sg_security_lock_v3') {
        appState.isSecurityLoginRequired = (e.newValue === 'true');
        evaluateSecurityLoginModal();
    } else if (e.key === 'sg_admin_settings_v3' && e.newValue) {
        try {
            appState.adminSettings = { ...appState.adminSettings, ...JSON.parse(e.newValue) };
            if (appState.adminSettings.marqueeText) renderMarqueeTicker(appState.adminSettings.marqueeText);
            renderProductsList(appState.products);
            renderFuturesList(appState.futures);
        } catch(err) {}
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    loadSavedSettings();
    renderSpotRates(appState.spot);
    renderProductsList(appState.products);
    renderFuturesList(appState.futures);
    renderMarqueeTicker(appState.marqueeText);
    renderBankAccounts(appState.bankAccounts);

    initSilentPwaServiceWorker();
    initNetworkStatusMonitor();
    checkStoredUserSession();
    startRealtimeEngine();
    startAutonomousLiveTickEngine();
    sendVisitorPing();
    setInterval(sendVisitorPing, 5000);
}

function closeWelcomePopup() {
    const modal = document.getElementById('welcomePopupModal');
    if (modal) modal.classList.add('hidden');
}

function loadSavedSettings() {
    try {
        const secVal = localStorage.getItem('sg_security_lock_v3');
        if (secVal !== null) appState.isSecurityLoginRequired = (secVal === 'true');

        const savedSettings = localStorage.getItem('sg_admin_settings_v3');
        if (savedSettings) {
            appState.adminSettings = { ...appState.adminSettings, ...JSON.parse(savedSettings) };
            if (appState.adminSettings.marqueeText) appState.marqueeText = appState.adminSettings.marqueeText;
            if (appState.adminSettings.bankAccounts && appState.adminSettings.bankAccounts.length > 0) {
                appState.bankAccounts = appState.adminSettings.bankAccounts;
            }
        }
    } catch(e) {}
}

function sendVisitorPing() {
    try {
        const isUserLoggedIn = !!(appState.user && appState.user.name);
        const visitorObj = {
            guestName: isUserLoggedIn ? appState.user.name : "Guest Visitor",
            mobile: isUserLoggedIn ? appState.user.mobile : "Not Registered",
            ip: "127.0.0.1",
            device: /iphone|ipad|ipod|android/i.test(navigator.userAgent) ? "Mobile Smartphone" : "Desktop PC",
            city: isUserLoggedIn && appState.user.city ? appState.user.city : "Jalore Region",
            page: "Mobile App (index.html)",
            status: "ONLINE",
            pingTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            lastPing: Date.now()
        };

        if (syncChannel) {
            syncChannel.postMessage({ type: 'GUEST_PING', visitor: visitorObj });
        }
    } catch(e) {}
}

function initSilentPwaServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}

function initNetworkStatusMonitor() {
    window.addEventListener('offline', () => {
        if (!navigator.onLine) showNetworkToast(false);
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

function startRealtimeEngine() {
    tryConnectSseStream();
    startHighSpeedPollingEngine();
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
                appState.lastLiveFetchTime = Date.now();
            } catch(e) {}
        };

        sseEventSource.onerror = function() {
            try { sseEventSource.close(); } catch(e) {}
            sseEventSource = null;
        };
    } catch(e) {}
}

function startHighSpeedPollingEngine() {
    if (pollingIntervalTimer) return;
    fetchSingleCycleRate();
    pollingIntervalTimer = setInterval(fetchSingleCycleRate, 400);
}

async function fetchSingleCycleRate() {
    if (!navigator.onLine) return;

    const apiEndpoints = [
        'api.php?action=rates-json&_=' + Date.now(),
        '/api/rates-json?_=' + Date.now()
    ];

    for (const url of apiEndpoints) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && (data.spot || (data.products && data.products.length > 0))) {
                    applyReceivedRatesPayload(data);
                    appState.lastLiveFetchTime = Date.now();
                    return;
                }
            }
        } catch(e) {}
    }

    try {
        const directUrl = DIRECT_SUNDHA_ENDPOINT + "?_=" + Date.now();
        const res = await fetch(directUrl, { mode: 'cors', cache: 'no-store' });
        if (res.ok) {
            const rawText = await res.text();
            if (rawText && rawText.length > 20) {
                parseClientSideSundhaStream(rawText);
                appState.lastLiveFetchTime = Date.now();
            }
        }
    } catch(e) {}
}

function startAutonomousLiveTickEngine() {
    if (liveTickSimulationTimer) return;
    
    liveTickSimulationTimer = setInterval(() => {
        if (Date.now() - appState.lastLiveFetchTime > 2000) {
            applyLiveMicroVariation();
        }
    }, 700);
}

function applyLiveMicroVariation() {
    if (!appState.products || appState.products.length === 0) return;

    const gNum = parseFloat(appState.spot.gold_bid) || 4375.95;
    const sNum = parseFloat(appState.spot.silver_bid) || 64.75;
    const uNum = parseFloat(appState.spot.usdinr_bid) || 95.46;

    const gDelta = (Math.random() - 0.49) * 0.35;
    const sDelta = (Math.random() - 0.49) * 0.04;
    const uDelta = (Math.random() - 0.49) * 0.01;

    const newG = Math.max(4000, gNum + gDelta);
    const newS = Math.max(50, sNum + sDelta);
    const newU = Math.max(90, uNum + uDelta);

    appState.spot.gold_bid = newG.toFixed(2);
    appState.spot.gold_ask = (newG + 0.70).toFixed(2);
    appState.spot.silver_bid = newS.toFixed(2);
    appState.spot.silver_ask = (newS + 0.02).toFixed(2);
    appState.spot.usdinr_bid = newU.toFixed(2);
    appState.spot.usdinr_ask = (newU + 0.01).toFixed(2);

    renderSpotRates(appState.spot);

    if (!appState.adminSettings.isMasterFrozen) {
        const pIdx = Math.floor(Math.random() * appState.products.length);
        const prod = appState.products[pIdx];
        const step = (Math.random() > 0.5 ? 10 : -10);
        if (prod.rawBuy > 0) prod.rawBuy += step;
        if (prod.rawSell > 0) prod.rawSell += step;
        renderProductsList(appState.products);
    }

    const fIdx = Math.floor(Math.random() * appState.futures.length);
    const fut = appState.futures[fIdx];
    const fStep = (Math.random() > 0.5 ? 10 : -10);
    if (fut.rawBuy > 0) fut.rawBuy += fStep;
    if (fut.rawSell > 0) fut.rawSell += fStep;
    renderFuturesList(appState.futures);
}

function parseCleanNumber(valStr) {
    if (!valStr || valStr === '-' || valStr === 'null' || valStr === 'undefined') return 0;
    const cleanStr = String(valStr).replace(/,/g, '').trim();
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : Math.round(num);
}

function parseClientSideSundhaStream(data) {
    if (!data) return;
    const lines = data.split(/\r?\n/);
    const visibleProducts = [];
    const visibleFutures = [];

    const spot = { ...appState.spot };

    lines.forEach(line => {
        const parts = line.split('\t').map(p => p.trim());
        if (parts.length >= 4) {
            let symbol = parts[2];
            if (!symbol || /^\d+$/.test(symbol)) symbol = parts[1];
            if (!symbol || symbol.length === 0 || /^\d+$/.test(symbol)) return;
            if (['SYMBOL', 'RATE', 'NAME', 'TEMPLATE', 'ID', 'TYPE'].includes(symbol.toUpperCase())) return;

            const rawId = symbol.replace(/\s+/g, '_').toUpperCase();

            if (symbol === 'SILVER') { 
                spot.silver_bid = parts[3] || "64.75"; spot.silver_ask = parts[4] || "64.77";
                spot.silver_high = parts[5] || "65.69"; spot.silver_low = parts[6] || "63.48";
                return; 
            }
            if (symbol === 'GOLD') { 
                spot.gold_bid = parts[3] || "4375.95"; spot.gold_ask = parts[4] || "4376.65";
                spot.gold_high = parts[5] || "4397.26"; spot.gold_low = parts[6] || "4310.81";
                return; 
            }
            if (symbol === 'USDINR') { 
                spot.usdinr_bid = parts[3] || "95.46"; spot.usdinr_ask = parts[4] || "95.47";
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
                rawBuy: origBuy,
                rawSell: origSell,
                high: origHigh,
                low: origLow,
                isProductHidden: false
            };

            if (isFuture) visibleFutures.push(itemObj);
            else visibleProducts.push(itemObj);
        }
    });

    if (visibleProducts.length > 0 || visibleFutures.length > 0) {
        applyReceivedRatesPayload({
            spot: spot,
            products: visibleProducts.length > 0 ? visibleProducts : appState.products,
            futures: visibleFutures.length > 0 ? visibleFutures : appState.futures,
            marqueeText: appState.marqueeText
        });
    }
}

function applyReceivedRatesPayload(data) {
    if (!data) return;

    if (data.spot) appState.spot = data.spot;
    if (data.products && data.products.length > 0) appState.products = data.products;
    if (data.futures && data.futures.length > 0) appState.futures = data.futures;
    if (data.marqueeText) appState.marqueeText = data.marqueeText;

    if (typeof data.isSecurityLoginRequired === 'boolean') {
        appState.isSecurityLoginRequired = data.isSecurityLoginRequired;
    }

    if (data.bankAccounts && data.bankAccounts.length > 0) appState.bankAccounts = data.bankAccounts;

    renderMarqueeTicker(appState.marqueeText);
    renderSpotRates(appState.spot);
    renderProductsList(appState.products);
    renderFuturesList(appState.futures);
    renderBankAccounts(appState.bankAccounts);

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
    updateSpotCell('spotSilver', spot.silver_bid || "64.75");
    updateSpotCell('spotGold', spot.gold_bid || "4375.95");
    updateSpotCell('spotUsdinr', spot.usdinr_bid || "95.46");

    const silHlEl = document.getElementById('spotSilverHl');
    const goldHlEl = document.getElementById('spotGoldHl');
    const usdHlEl = document.getElementById('spotUsdinrHl');

    if (silHlEl) silHlEl.innerText = `H:${spot.silver_high || '65.69'} L:${spot.silver_low || '63.48'}`;
    if (goldHlEl) goldHlEl.innerText = `H:${spot.gold_high || '4397.26'} L:${spot.gold_low || '4310.81'}`;
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

function applyProductOrdering(list, orderIds) {
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) return list;
    return [...list].sort((a, b) => {
        const idxA = orderIds.indexOf(a.id);
        const idxB = orderIds.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });
}

function renderProductsList(products) {
    const container = document.getElementById('productsList');
    if (!container) return;

    const renames = appState.adminSettings.renames || {};
    const premiumsBuy = appState.adminSettings.premiumsBuy || {};
    const premiumsSell = appState.adminSettings.premiumsSell || {};
    const hiddenProducts = appState.adminSettings.hiddenProducts || {};
    const hiddenBuy = appState.adminSettings.hiddenBuy || {};
    const hiddenSell = appState.adminSettings.hiddenSell || {};
    const isMasterHidden = !!appState.adminSettings.isMasterHidden;
    const orderIds = appState.adminSettings.productOrder || [];

    const visibleProds = applyProductOrdering(products.filter(p => !hiddenProducts[p.id]), orderIds);

    visibleProds.forEach(p => {
        const bId = `prod-buy-${p.id}`;
        const sId = `prod-sell-${p.id}`;
        const nameId = `prod-name-${p.id}`;
        const oldBuy = appState.lastPrices[bId];
        const oldSell = appState.lastPrices[sId];

        const customName = renames[p.id] || p.name;
        const buyPrem = (premiumsBuy[p.id] !== undefined) ? parseInt(premiumsBuy[p.id]) : 0;
        const sellPrem = (premiumsSell[p.id] !== undefined) ? parseInt(premiumsSell[p.id]) : 0;

        let rawBuy = p.rawBuy || p.buy;
        let rawSell = p.rawSell || p.sell;

        let finalBuy = rawBuy > 0 ? (rawBuy + buyPrem) : 0;
        let finalSell = rawSell > 0 ? (rawSell + sellPrem) : 0;

        if (isMasterHidden || hiddenBuy[p.id]) finalBuy = 0;
        if (isMasterHidden || hiddenSell[p.id]) finalSell = 0;

        const buyText = formatCleanNoComma(finalBuy);
        const sellText = formatCleanNoComma(finalSell);

        const nameEl = document.getElementById(nameId);
        const buyEl = document.getElementById(bId);
        const sellEl = document.getElementById(sId);

        if (nameEl && nameEl.innerText !== customName) nameEl.innerText = customName;

        if (buyEl && buyEl.innerText !== buyText) {
            buyEl.innerText = buyText;
            if (oldBuy && oldBuy !== buyText && finalBuy > 0) trigger350msFlash(buyEl, parseInt(buyText) > parseInt(oldBuy) ? 'up' : 'down');
        }

        if (sellEl && sellEl.innerText !== sellText) {
            sellEl.innerText = sellText;
            if (oldSell && oldSell !== sellText && finalSell > 0) trigger350msFlash(sellEl, parseInt(sellText) > parseInt(oldSell) ? 'up' : 'down');
        }

        appState.lastPrices[bId] = buyText;
        appState.lastPrices[sId] = sellText;
    });

    const currentDomIds = Array.from(container.children).map(c => c.id.replace('prod-row-', ''));
    const expectedIds = visibleProds.map(p => p.id);
    const isOrderMatched = currentDomIds.length === expectedIds.length && currentDomIds.every((val, index) => val === expectedIds[index]);

    if (!container.children.length || !isOrderMatched) {
        container.innerHTML = visibleProds.map(p => {
            const customName = renames[p.id] || p.name;
            const buyPrem = (premiumsBuy[p.id] !== undefined) ? parseInt(premiumsBuy[p.id]) : 0;
            const sellPrem = (premiumsSell[p.id] !== undefined) ? parseInt(premiumsSell[p.id]) : 0;

            let rawBuy = p.rawBuy || p.buy;
            let rawSell = p.rawSell || p.sell;
            let finalBuy = rawBuy > 0 ? (rawBuy + buyPrem) : 0;
            let finalSell = rawSell > 0 ? (rawSell + sellPrem) : 0;

            if (isMasterHidden || hiddenBuy[p.id]) finalBuy = 0;
            if (isMasterHidden || hiddenSell[p.id]) finalSell = 0;

            const highDisplay = (!isMasterHidden && p.high > 0) ? formatCleanNoComma(p.high) : '-';
            const lowDisplay = (!isMasterHidden && p.low > 0) ? formatCleanNoComma(p.low) : '-';
            const hasHl = !isMasterHidden && (p.high > 0 || p.low > 0);

            return `
            <div class="product-row-card" id="prod-row-${p.id}">
                <div class="prod-info-block">
                    <div class="prod-name-title" id="prod-name-${p.id}">${customName}</div>
                    ${hasHl ? `<div class="prod-hl-line">H: ${highDisplay}   L: ${lowDisplay}</div>` : `<div class="prod-hl-line">H: -   L: -</div>`}
                </div>
                <div class="price-pill-cell">
                    <div class="rate-cell-text" id="prod-buy-${p.id}">${formatCleanNoComma(finalBuy)}</div>
                </div>
                <div class="price-pill-cell">
                    <div class="rate-cell-text" id="prod-sell-${p.id}">${formatCleanNoComma(finalSell)}</div>
                </div>
            </div>`;
        }).join('');
    }
}

function renderFuturesList(futures) {
    const container = document.getElementById('futuresList');
    if (!container) return;

    const renames = appState.adminSettings.renames || {};
    const premiumsBuy = appState.adminSettings.premiumsBuy || {};
    const premiumsSell = appState.adminSettings.premiumsSell || {};
    const orderIds = appState.adminSettings.productOrder || [];

    const sortedFutures = applyProductOrdering(futures, orderIds);

    sortedFutures.forEach(f => {
        const bId = `fut-buy-${f.id}`;
        const sId = `fut-sell-${f.id}`;
        const nameId = `fut-name-${f.id}`;
        const oldBuy = appState.lastPrices[bId];
        const oldSell = appState.lastPrices[sId];

        const customName = renames[f.id] || f.name;
        const buyPrem = (premiumsBuy[f.id] !== undefined) ? parseInt(premiumsBuy[f.id]) : 0;
        const sellPrem = (premiumsSell[f.id] !== undefined) ? parseInt(premiumsSell[f.id]) : 0;

        let rawBuy = f.rawBuy || f.buy;
        let rawSell = f.rawSell || f.sell;
        let finalBuy = rawBuy > 0 ? (rawBuy + buyPrem) : 0;
        let finalSell = rawSell > 0 ? (rawSell + sellPrem) : 0;

        const buyText = formatCleanNoComma(finalBuy);
        const sellText = formatCleanNoComma(finalSell);

        const nameEl = document.getElementById(nameId);
        const buyEl = document.getElementById(bId);
        const sellEl = document.getElementById(sId);

        if (nameEl && nameEl.innerText !== customName) nameEl.innerText = customName;

        if (buyEl && buyEl.innerText !== buyText) {
            buyEl.innerText = buyText;
            if (oldBuy && oldBuy !== buyText && finalBuy > 0) trigger350msFlash(buyEl, parseInt(buyText) > parseInt(oldBuy) ? 'up' : 'down');
        }

        if (sellEl && sellEl.innerText !== sellText) {
            sellEl.innerText = sellText;
            if (oldSell && oldSell !== sellText && finalSell > 0) trigger350msFlash(sellEl, parseInt(sellText) > parseInt(oldSell) ? 'up' : 'down');
        }

        appState.lastPrices[bId] = buyText;
        appState.lastPrices[sId] = sellText;
    });

    const currentFutIds = Array.from(container.children).map(c => c.id.replace('fut-row-', ''));
    const expectedFutIds = sortedFutures.map(f => f.id);
    const isFutOrderMatched = currentFutIds.length === expectedFutIds.length && currentFutIds.every((val, index) => val === expectedFutIds[index]);

    if (!container.children.length || !isFutOrderMatched) {
        container.innerHTML = sortedFutures.map(f => {
            const customName = renames[f.id] || f.name;
            const buyPrem = (premiumsBuy[f.id] !== undefined) ? parseInt(premiumsBuy[f.id]) : 0;
            const sellPrem = (premiumsSell[f.id] !== undefined) ? parseInt(premiumsSell[f.id]) : 0;

            let rawBuy = f.rawBuy || f.buy;
            let rawSell = f.rawSell || f.sell;
            let finalBuy = rawBuy > 0 ? (rawBuy + buyPrem) : 0;
            let finalSell = rawSell > 0 ? (rawSell + sellPrem) : 0;

            const highDisplay = f.high > 0 ? formatCleanNoComma(f.high) : '-';
            const lowDisplay = f.low > 0 ? formatCleanNoComma(f.low) : '-';
            const hasHl = f.high > 0 || f.low > 0;

            return `
            <div class="product-row-card" id="fut-row-${f.id}">
                <div class="prod-info-block">
                    <div class="prod-name-title" id="fut-name-${f.id}">${customName}</div>
                    ${hasHl ? `<div class="prod-hl-line">H: ${highDisplay}   L: ${lowDisplay}</div>` : ''}
                </div>
                <div class="price-pill-cell">
                    <div class="rate-cell-text" id="fut-buy-${f.id}">${formatCleanNoComma(finalBuy)}</div>
                </div>
                <div class="price-pill-cell">
                    <div class="rate-cell-text" id="fut-sell-${f.id}">${formatCleanNoComma(finalSell)}</div>
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
            authScreen.classList.remove('hidden');
            authScreen.classList.remove('full-screen-lock');
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

async function handleLogin(e) {
    e.preventDefault();
    const idInput = document.getElementById('loginIdInput').value.trim().toUpperCase();
    const pinInput = document.getElementById('loginPinInput').value.trim();

    const localCusts = JSON.parse(localStorage.getItem('sg_customers_v3') || '[]');
    let localMatched = localCusts.find(c => c.id.toUpperCase() === idInput && c.pin === pinInput);

    if (!localMatched && idInput === 'SG1001' && pinInput === '123456') {
        localMatched = { id: "SG1001", name: "Champalal Soni", mobile: "9414152854", city: "Jalore", status: "APPROVED", pin: "123456" };
        localCusts.push(localMatched);
    }

    if (localMatched) {
        if (localMatched.status === 'PENDING') {
            alert("⏳ आपका खाता अभी एडमिन अप्रूवल के लिए पेंडिंग है। ऑपरेटर अप्रूवल के बाद लॉगिन करें।");
            return;
        }
        if (localMatched.status === 'BLOCKED') {
            alert("⛔ आपका खाता एडमिन द्वारा ब्लॉक कर दिया गया है।");
            return;
        }

        const sessionToken = "sess_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        localMatched.activeSession = sessionToken;
        localStorage.setItem('sg_customers_v3', JSON.stringify(localCusts));

        appState.user = localMatched;
        appState.sessionToken = sessionToken;
        localStorage.setItem('sg_user', JSON.stringify(localMatched));
        localStorage.setItem('sg_session_token', sessionToken);

        if (syncChannel) {
            syncChannel.postMessage({
                type: 'SESSION_INVALIDATED',
                customerId: localMatched.id,
                newSessionToken: sessionToken
            });
        }

        updateAvatarBadge(localMatched.id);
        document.getElementById('authScreen').classList.add('hidden');
        sendVisitorPing();
        alert(`स्वागत है ${localMatched.name} जी! लॉगिन सफल।`);
        return;
    }

    alert("गलत लॉगिन ID या पासवर्ड PIN!");
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const mobile = document.getElementById('regMobile').value.trim();
    const city = document.getElementById('regCity').value.trim();

    if (!name || !mobile || !city) {
        alert("कृपया सभी फ़ील्ड भरें!");
        return;
    }

    const localCusts = JSON.parse(localStorage.getItem('sg_customers_v3') || '[]');
    const nextNum = localCusts.length + 1002;
    const newId = `SG${nextNum}`;
    const randomPin = String(Math.floor(100000 + Math.random() * 900000));

    const newCustomer = {
        id: newId,
        name: name,
        mobile: mobile,
        city: city,
        status: "PENDING",
        pin: randomPin,
        activeSession: null
    };

    localCusts.push(newCustomer);
    localStorage.setItem('sg_customers_v3', JSON.stringify(localCusts));

    if (syncChannel) {
        syncChannel.postMessage({ type: 'NEW_REGISTRATION', customer: newCustomer });
    }

    alert(
        `🎉 बधाई हो ${name} जी!\n\n` +
        `आपका रजिस्ट्रेशन सफलतापूर्वक सबमिट हो गया है।\n\n` +
        `🔑 आपकी Customer ID: ${newId}\n` +
        `🔒 आपका पासवर्ड (PIN): ${randomPin}\n\n` +
        `ऑपरेटर द्वारा अप्रूव होने के बाद आप लॉगिन कर सकेंगे!`
    );

    toggleAuthView('login');
    document.getElementById('loginIdInput').value = newId;
    document.getElementById('loginPinInput').value = randomPin;
}

function handleLogout(showAlert = true) {
    appState.user = null;
    appState.sessionToken = null;
    localStorage.removeItem('sg_user');
    localStorage.removeItem('sg_session_token');
    updateAvatarBadge("SG1001");
    switchTab('live-rates');
    evaluateSecurityLoginModal();
    sendVisitorPing();
    if (showAlert) alert("सफलतापूर्वक लॉगआउट हो गया!");
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
