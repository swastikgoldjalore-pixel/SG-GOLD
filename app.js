/* ==========================================================================
   SWASTIK GOLD JALORE - APP ENGINE SCRIPT
   - Universal Node.js & Browser Dual Compatibility Wrapper
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
    activeTab: 'live-rates'
};

let sseEventSource = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    initSilentPwaServiceWorker();
    initNetworkStatusMonitor();
    checkStoredUserSession();
    initRealtimeSseStream();
    setInterval(verifySingleSessionSecurity, 1000);
}

/* 1. SILENT PWA SERVICE WORKER REGISTRATION (NO POPUPS) */
function initSilentPwaServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}

/* 2. STRICT NETWORK DISCONNECT MONITOR (ONLY SHOWS BANNER WHEN TRULY OFFLINE) */
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

/* 3. REAL-TIME 0ms SSE STREAM LISTENER WITH 100ms FALLBACK FOR GODADDY HOSTING */
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
    if (el && el.innerText !== txt && txt.length > 5) {
        el.innerText = txt;
    }
}

/* DYNAMIC BANK ACCOUNTS RENDERER WITH EMPTY FALLBACK MESSAGE */
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
        appState.user = JSON.parse(userStr);
        appState.sessionToken = token;
        updateAvatarBadge(appState.user.id);
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

    // EVEN IF SECURITY IS OFF, TABS OTHER THAN LIVE-RATES REQUIRE LOGIN!
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

    try {
        const url = `/api/verify-session?id=${appState.user.id}&sessionToken=${appState.sessionToken}&_=${Date.now()}`;
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
        }
    } catch(e) {}
}

async function handleLogin(e) {
    e.preventDefault();
    const idInput = document.getElementById('loginIdInput').value.trim().toUpperCase();
    const pinInput = document.getElementById('loginPinInput').value.trim();

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: idInput, pin: pinInput })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            appState.user = data.customer;
            appState.sessionToken = data.sessionToken;

            localStorage.setItem('sg_user', JSON.stringify(data.customer));
            localStorage.setItem('sg_session_token', data.sessionToken);

            updateAvatarBadge(data.customer.id);
            document.getElementById('authScreen').classList.add('hidden');
            alert(`स्वागत है ${data.customer.name} जी! लॉगिन सफल।`);
        } else {
            alert(data.message || "लॉगिन असफल!");
        }
    } catch(e) {
        alert("सर्वर से कनेक्ट करने में त्रुटि!");
    }
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

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mobile, city })
        });

        const data = await res.json();
        if (res.ok && data.success) {
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
        } else {
            alert(data.message || "रजिस्ट्रेशन असफल!");
        }
    } catch(e) {
        alert("सर्वर से कनेक्ट करने में त्रुटि!");
    }
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

} // End of browser wrapper block
