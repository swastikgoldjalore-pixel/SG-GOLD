/* ==========================================================================
   SWASTIK GOLD JALORE - APP ENGINE SCRIPT (v3.2 REALTIME PRODUCTION FIX)
   - Universal Node.js & Browser Dual Compatibility Wrapper
   - Instant 0ms Dynamic Title, Buy, Sell, and High-Low DOM Updater
   - Automatic Customer Auto-Logout on Admin Delete / Block
   - Zero-Cache Auto Purger & Real-time SSE / High-Frequency Sync Engine
   ========================================================================== */

// GODADDY CPANEL NODE.JS APP SELECTOR ENTRY POINT WRAPPER
if (typeof window === 'undefined' && typeof module !== 'undefined' && module.exports) {
    module.exports = require('./server.js');
} else {

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
    lastConfigVersion: 0
};

let sseEventSource = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    purgeStaleBrowserCaches();
    initSilentPwaServiceWorker();
    initNetworkStatusMonitor();
    checkStoredUserSession();
    fetchInitialRatesSnapshot();
    startFallbackPolling();
    initRealtimeSseStream();
    setInterval(verifySingleSessionSecurity, 1500);
}

async function fetchInitialRatesSnapshot() {
    try {
        const res = await fetch('/api/rates-json?_=' + Date.now());
        if (res.ok) {
            const data = await res.json();
            processStreamPayload(data);
        }
    } catch(e) {}
}

/* 0. AUTOMATIC SERVICE WORKER & LOCALSTORAGE CACHE PURGER */
function purgeStaleBrowserCaches() {
    try {
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    caches.delete(name);
                });
            });
        }
        localStorage.removeItem('cached_rates');
        localStorage.removeItem('cached_admin_settings');
        localStorage.removeItem('swastik_rates_cache');
    } catch(e) {}
}

/* 1. SILENT PWA SERVICE WORKER REGISTRATION */
function initSilentPwaServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js?v=' + Date.now()).catch(() => {});
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
            reconnectSseStream();
        }
    });
}

function showNetworkToast(isOnline) {
    let toast = document.getElementById('networkStatusToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'networkStatusToast';
        toast.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:20px;font-size:11px;font-weight:800;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:none;';
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

function reconnectSseStream() {
    if (sseEventSource) {
        sseEventSource.close();
    }
    initRealtimeSseStream();
}

let fallbackPollTimer = null;

function processStreamPayload(data) {
    if (!data) return;
    if (data.spot) appState.spot = data.spot;
    appState.products = data.products || [];
    appState.futures = data.futures || [];
    appState.marqueeText = data.marqueeText || "";
    
    if (typeof data.isSecurityLoginRequired === 'boolean') {
        appState.isSecurityLoginRequired = data.isSecurityLoginRequired;
    }
    
    appState.hatohatSettings = data.hatohat || {};
    appState.bankAccounts = data.bankAccounts || [];

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

function startFallbackPolling() {
    if (fallbackPollTimer) return;
    fallbackPollTimer = setInterval(async () => {
        try {
            const res = await fetch('/api/rates-json?_=' + Date.now());
            if (res.ok) {
                const data = await res.json();
                processStreamPayload(data);
            }
        } catch(e) {}
    }, 150);
}

/* 3. REAL-TIME 0ms SSE STREAM LISTENER */
function initRealtimeSseStream() {
    try {
        sseEventSource = new EventSource('/api/rates-sse');

        sseEventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                processStreamPayload(data);
            } catch(e) {}
        };

        sseEventSource.onerror = function() {
            if (!navigator.onLine) {
                showNetworkToast(false);
            } else {
                startFallbackPolling();
            }
        };
    } catch(e) {
        startFallbackPolling();
    }
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

/* 4. GUARANTEED 0ms DYNAMIC PRODUCTS LIST RENDERER (TITLE, PRICES, HIGH-LOWS) */
function renderProductsList(products) {
    const container = document.getElementById('productsList');
    if (!container) return;

    // Check if DOM structure needs full reconstruction
    const currentDomIds = Array.from(container.children).map(c => c.id.replace('prod-row-', ''));
    const serverIds = products.map(p => p.id);
    const isStructureDifferent = currentDomIds.join(',') !== serverIds.join(',');

    if (isStructureDifferent || container.children.length === 0) {
        container.innerHTML = products.map(p => {
            const highDisplay = p.high > 0 ? formatCleanNoComma(p.high) : '-';
            const lowDisplay = p.low > 0 ? formatCleanNoComma(p.low) : '-';
            const hasHl = p.high > 0 || p.low > 0;

            return `
            <div class="product-row-card" id="prod-row-${p.id}">
                <div class="prod-info-block">
                    <div class="prod-name-title" id="prod-name-${p.id}">${p.name}</div>
                    <div class="prod-hl-line" id="prod-hl-${p.id}" style="${hasHl ? '' : 'display:none;'}">H: ${highDisplay}   L: ${lowDisplay}</div>
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

    // Dynamic per-frame property updater (Title, Buy, Sell, High-Low)
    products.forEach(p => {
        const bId = `prod-buy-${p.id}`;
        const sId = `prod-sell-${p.id}`;
        const nameId = `prod-name-${p.id}`;
        const hlId = `prod-hl-${p.id}`;

        const oldBuy = appState.lastPrices[bId];
        const oldSell = appState.lastPrices[sId];

        const buyText = formatCleanNoComma(p.buy);
        const sellText = formatCleanNoComma(p.sell);

        const nameEl = document.getElementById(nameId);
        const buyEl = document.getElementById(bId);
        const sellEl = document.getElementById(sId);
        const hlEl = document.getElementById(hlId);

        if (nameEl && nameEl.innerText !== p.name) {
            nameEl.innerText = p.name;
        }

        if (hlEl) {
            const highDisplay = p.high > 0 ? formatCleanNoComma(p.high) : '-';
            const lowDisplay = p.low > 0 ? formatCleanNoComma(p.low) : '-';
            const hasHl = p.high > 0 || p.low > 0;
            hlEl.style.display = hasHl ? 'block' : 'none';
            hlEl.innerText = `H: ${highDisplay}   L: ${lowDisplay}`;
        }

        if (buyEl) {
            if (buyEl.innerText !== buyText) {
                buyEl.innerText = buyText;
                if (oldBuy && oldBuy !== buyText && p.buy > 0) {
                    trigger350msFlash(buyEl, parseInt(buyText) > parseInt(oldBuy) ? 'up' : 'down');
                }
            }
        }

        if (sellEl) {
            if (sellEl.innerText !== sellText) {
                sellEl.innerText = sellText;
                if (oldSell && oldSell !== sellText && p.sell > 0) {
                    trigger350msFlash(sellEl, parseInt(sellText) > parseInt(oldSell) ? 'up' : 'down');
                }
            }
        }

        appState.lastPrices[bId] = buyText;
        appState.lastPrices[sId] = sellText;
    });
}

/* 5. GUARANTEED 0ms DYNAMIC FUTURES LIST RENDERER */
function renderFuturesList(futures) {
    const container = document.getElementById('futuresList');
    if (!container) return;

    const currentDomIds = Array.from(container.children).map(c => c.id.replace('fut-row-', ''));
    const serverIds = futures.map(f => f.id);
    const isStructureDifferent = currentDomIds.join(',') !== serverIds.join(',');

    if (isStructureDifferent || container.children.length === 0) {
        container.innerHTML = futures.map(f => {
            const highDisplay = f.high > 0 ? formatCleanNoComma(f.high) : '-';
            const lowDisplay = f.low > 0 ? formatCleanNoComma(f.low) : '-';
            const hasHl = f.high > 0 || f.low > 0;

            return `
            <div class="product-row-card" id="fut-row-${f.id}">
                <div class="prod-info-block">
                    <div class="prod-name-title" id="fut-name-${f.id}">${f.name}</div>
                    <div class="prod-hl-line" id="fut-hl-${f.id}" style="${hasHl ? '' : 'display:none;'}">H: ${highDisplay}   L: ${lowDisplay}</div>
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

    futures.forEach(f => {
        const bId = `fut-buy-${f.id}`;
        const sId = `fut-sell-${f.id}`;
        const nameId = `fut-name-${f.id}`;
        const hlId = `fut-hl-${f.id}`;

        const oldBuy = appState.lastPrices[bId];
        const oldSell = appState.lastPrices[sId];

        const buyText = formatCleanNoComma(f.buy);
        const sellText = formatCleanNoComma(f.sell);

        const nameEl = document.getElementById(nameId);
        const buyEl = document.getElementById(bId);
        const sellEl = document.getElementById(sId);
        const hlEl = document.getElementById(hlId);

        if (nameEl && nameEl.innerText !== f.name) {
            nameEl.innerText = f.name;
        }

        if (hlEl) {
            const highDisplay = f.high > 0 ? formatCleanNoComma(f.high) : '-';
            const lowDisplay = f.low > 0 ? formatCleanNoComma(f.low) : '-';
            const hasHl = f.high > 0 || f.low > 0;
            hlEl.style.display = hasHl ? 'block' : 'none';
            hlEl.innerText = `H: ${highDisplay}   L: ${lowDisplay}`;
        }

        if (buyEl) {
            if (buyEl.innerText !== buyText) {
                buyEl.innerText = buyText;
                if (oldBuy && oldBuy !== buyText && f.buy > 0) {
                    trigger350msFlash(buyEl, parseInt(buyText) > parseInt(oldBuy) ? 'up' : 'down');
                }
            }
        }

        if (sellEl) {
            if (sellEl.innerText !== sellText) {
                sellEl.innerText = sellText;
                if (oldSell && oldSell !== sellText && f.sell > 0) {
                    trigger350msFlash(sellEl, parseInt(sellText) > parseInt(oldSell) ? 'up' : 'down');
                }
            }
        }

        appState.lastPrices[bId] = buyText;
        appState.lastPrices[sId] = sellText;
    });
}

function renderMarqueeTicker(text) {
    const el = document.getElementById('marqueeText');
    if (el && text && el.innerText !== text) {
        el.innerText = text;
    }
}

function renderBankAccounts(banks) {
    const container = document.querySelector('#tab-contact-bank .contact-white-card:last-child');
    if (!container) return;

    if (!banks || banks.length === 0) {
        container.innerHTML = `
            <div style="font-size:13px;font-weight:800;color:#003a80;margin-bottom:6px;">SWASTIK BULLION OFFICIAL ACCOUNTS</div>
            <div style="padding:14px;background:#fff1f2;border:1px dashed #f43f5e;border-radius:8px;color:#be123c;font-weight:800;text-align:center;">
                ⚠️ Bank Detail Is Not Available (वर्तमान में कोई बैंक विवरण उपलब्ध नहीं है)
            </div>`;
        return;
    }

    container.innerHTML = `
        <div style="font-size:13px;font-weight:800;color:#003a80;margin-bottom:6px;">SWASTIK BULLION OFFICIAL ACCOUNTS</div>
        <p style="font-size:10px;color:#475569;margin-bottom:12px;font-weight:700;">To settle physical deliveries or deposit margin funds for booking locks, transfer payment to following accounts:</p>
        ${banks.map(b => `
            <div style="border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:10px;">
                <div class="contact-row-item"><span class="contact-row-label">BANK NAME:</span><span class="contact-row-val">${b.bankName || ''}</span></div>
                <div class="contact-row-item"><span class="contact-row-label">ACCOUNT NO:</span><span class="contact-row-val">${b.accountNo || ''}</span></div>
                <div class="contact-row-item"><span class="contact-row-label">IFSC CODE:</span><span class="contact-row-val">${b.ifsc || ''}</span></div>
                ${b.branch ? `<div class="contact-row-item"><span class="contact-row-label">BRANCH:</span><span class="contact-row-val">${b.branch}</span></div>` : ''}
            </div>
        `).join('')}
    `;
}

function renderSwastikAiReport(report) {
    if (!report) return;
    const updEl = document.getElementById('aiUpdateText');
    if (updEl) updEl.innerText = report.lastAiUpdate || 'Auto-Updated';

    if (report.comexGold) {
        const rEl = document.getElementById('aiGoldComexRate');
        const t15El = document.getElementById('aiGoldComexT15');
        const t1wEl = document.getElementById('aiGoldComexT1w');
        const t1mEl = document.getElementById('aiGoldComexT1m');

        if (rEl) rEl.innerText = '$' + report.comexGold.rate;
        if (t15El) t15El.innerText = '$' + report.comexGold.target15m;
        if (t1wEl) t1wEl.innerText = '$' + report.comexGold.target1w;
        if (t1mEl) t1mEl.innerText = '$' + report.comexGold.target1m;
    }

    if (report.comexSilver) {
        const rEl = document.getElementById('aiSilverComexRate');
        const t15El = document.getElementById('aiSilverComexT15');
        const t1wEl = document.getElementById('aiSilverComexT1w');
        const t1mEl = document.getElementById('aiSilverComexT1m');

        if (rEl) rEl.innerText = '$' + report.comexSilver.rate;
        if (t15El) t15El.innerText = '$' + report.comexSilver.target15m;
        if (t1wEl) t1wEl.innerText = '$' + report.comexSilver.target1w;
        if (t1mEl) t1mEl.innerText = '$' + report.comexSilver.target1m;
    }

    if (report.mcxGold) {
        const rEl = document.getElementById('aiGoldMcxRate');
        const t15El = document.getElementById('aiGoldMcxT15');
        const t1wEl = document.getElementById('aiGoldMcxT1w');
        const t1mEl = document.getElementById('aiGoldMcxT1m');

        if (rEl) rEl.innerText = '₹' + report.mcxGold.rate;
        if (t15El) t15El.innerText = '₹' + report.mcxGold.target15m;
        if (t1wEl) t1wEl.innerText = '₹' + report.mcxGold.target1w;
        if (t1mEl) t1mEl.innerText = '₹' + report.mcxGold.target1m;
    }

    if (report.mcxSilver) {
        const rEl = document.getElementById('aiSilverMcxRate');
        const t15El = document.getElementById('aiSilverMcxT15');
        const t1wEl = document.getElementById('aiSilverMcxT1w');
        const t1mEl = document.getElementById('aiSilverMcxT1m');

        if (rEl) rEl.innerText = '₹' + report.mcxSilver.rate;
        if (t15El) t15El.innerText = '₹' + report.mcxSilver.target15m;
        if (t1wEl) t1wEl.innerText = '₹' + report.mcxSilver.target1w;
        if (t1mEl) t1mEl.innerText = '₹' + report.mcxSilver.target1m;
    }

    if (report.festivalGreeting) {
        const titleEl = document.getElementById('festTitle');
        const dateEl = document.getElementById('festDateStr');
        const msgEl = document.getElementById('festMsgBody');

        if (titleEl) titleEl.innerText = report.festivalGreeting.title || 'चातुर्मास पावन पर्व';
        if (dateEl) dateEl.innerText = report.festivalGreeting.dateStr || 'आज की मंगलकामनाएं';
        if (msgEl) msgEl.innerText = report.festivalGreeting.greetingMsg || 'पावन पर्व की हार्दिक शुभकामनाएं!';
    }
}

/* 6. AUTOMATIC CUSTOMER AUTO-LOGOUT ON ADMIN DELETE OR BLOCK ACCOUNT */
async function verifySingleSessionSecurity() {
    if (!appState.user || !appState.user.id) return;

    try {
        const res = await fetch(`/api/verify-session?id=${encodeURIComponent(appState.user.id)}&sessionToken=${encodeURIComponent(appState.sessionToken || '')}&_=${Date.now()}`);
        if (res.ok) {
            const data = await res.json();
            if (data.valid === false) {
                // Customer deleted or blocked by admin - Force immediate auto-logout!
                handleForceAutoLogout(data.reason);
            }
        }
    } catch(e) {}
}

function handleForceAutoLogout(reason) {
    sessionStorage.removeItem('sg_user');
    sessionStorage.removeItem('sg_token');
    appState.user = null;
    appState.sessionToken = null;

    const topBadge = document.getElementById('topAvatarBadge');
    if (topBadge) topBadge.innerText = 'GUEST';

    evaluateSecurityLoginModal();

    let alertMsg = "आपका सत्र समाप्त हो गया है।";
    if (reason === 'DELETED') alertMsg = "आपका खाता एडमिन द्वारा हटा दिया गया है।";
    else if (reason === 'BLOCKED') alertMsg = "आपका खाता एडमिन द्वारा ब्लॉक कर दिया गया है।";
    else if (reason === 'MULTI_DEVICE') alertMsg = "आपका खाता दूसरी डिवाइस पर लॉगिन हुआ है। आप इस डिवाइस से लॉगआउट हो गए हैं।";

    alert(alertMsg);
}

function checkStoredUserSession() {
    const rawUser = sessionStorage.getItem('sg_user');
    const token = sessionStorage.getItem('sg_token');

    if (rawUser && token) {
        try {
            appState.user = JSON.parse(rawUser);
            appState.sessionToken = token;
            const topBadge = document.getElementById('topAvatarBadge');
            if (topBadge) topBadge.innerText = appState.user.id;
        } catch(e) {}
    }
}

function evaluateSecurityLoginModal() {
    const modal = document.getElementById('authScreen');
    if (!modal) return;

    if (appState.isSecurityLoginRequired && !appState.user) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

function handleLogin(e) {
    e.preventDefault();
    const id = document.getElementById('loginIdInput').value.trim().toUpperCase();
    const pin = document.getElementById('loginPinInput').value.trim();

    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, pin })
    }).then(res => res.json()).then(data => {
        if (data.success) {
            appState.user = data.customer;
            appState.sessionToken = data.sessionToken;
            sessionStorage.setItem('sg_user', JSON.stringify(data.customer));
            sessionStorage.setItem('sg_token', data.sessionToken);

            const topBadge = document.getElementById('topAvatarBadge');
            if (topBadge) topBadge.innerText = data.customer.id;

            evaluateSecurityLoginModal();
            alert(`नमस्कार ${data.customer.name} जी! स्वास्तिक गोल्ड में आपका स्वागत है।`);
        } else {
            alert(data.message || "लॉगिन असफल!");
        }
    }).catch(() => {
        alert("सर्वर से कनेक्ट करने में त्रुटि!");
    });
}

function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const mobile = document.getElementById('regMobile').value.trim();
    const city = document.getElementById('regCity').value.trim();

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mobile, city })
    }).then(res => res.json()).then(data => {
        if (data.success) {
            alert(`रजिस्ट्रेशन सबमिट हो गया!\nआपकी पेंडिंग यूजर आईडी: ${data.customer.id}\nएडमिन द्वारा अप्रूव होते ही आप लॉगिन कर पाएंगे।`);
            toggleAuthView('login');
            document.getElementById('loginIdInput').value = data.customer.id;
        } else {
            alert(data.message || "रजिस्ट्रेशन सबमिट नहीं हो सका!");
        }
    }).catch(() => {
        alert("सर्वर से कनेक्ट करने में त्रुटि!");
    });
}

function handleLogout() {
    sessionStorage.removeItem('sg_user');
    sessionStorage.removeItem('sg_token');
    appState.user = null;
    appState.sessionToken = null;
    const topBadge = document.getElementById('topAvatarBadge');
    if (topBadge) topBadge.innerText = 'GUEST';
    evaluateSecurityLoginModal();
    alert("आप सफलतापूर्वक लॉगआउट हो गए हैं।");
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

} // End of browser wrapper block
