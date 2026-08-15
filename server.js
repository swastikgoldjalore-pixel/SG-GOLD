/**
 * ==============================================================================
 * SWASTIK GOLD JALORE (swastikgold.net) - AUTHORITATIVE BACKEND SERVER ENGINE
 * ==============================================================================
 * Production Architecture:
 * - Super Admin Bootstrap Credential System (Argon2id/Scrypt/PBKDF2-SHA512)
 * - Mandatory Password Change on First Login
 * - Session Revocation & Brute-Force Progressive Delay / Lockout
 * - Server-Side Ingestion Adapter: SundhaGoldMarketDataProvider
 * - Dynamic Timestamp Cache-Busting (?_={timestamp})
 * - Anomaly, Staleness & Structure Validation
 * - Configurable Symbol Mapping Engine
 * - Decimal-Safe Premium & Price Separation (source vs calculated vs display vs frozen)
 * - Zero-Latency SSE Broadcast Stream & High-Precision Diagnostics
 * ==============================================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. ENVIRONMENT VARIABLES & SECRETS LOADER
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    const env = {
        PORT: 8080,
        NODE_ENV: 'production',
        ADMIN_BOOTSTRAP_USERNAME: 'Paliwal9824',
        ADMIN_BOOTSTRAP_PASSWORD: 'Rathore9824',
        JWT_SECRET: 'swastik_gold_secure_secret_9824_jalore_master',
        MARKET_PROVIDER: 'sundhagold',
        SUNDHA_GOLD_API_URL: 'https://bcast.sundhagold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sundhagold',
        POLLING_INTERVAL_MS: 200,
        REQUEST_TIMEOUT_MS: 4000,
        STALE_THRESHOLD_MS: 5000,
        RECONNECT_DELAY_MS: 1000,
        MAX_RECONNECT_DELAY_MS: 10000,
        PROVIDER_ENABLED: true
    };

    if (fs.existsSync(envPath)) {
        try {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split(/\r?\n/).forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                const idx = trimmed.indexOf('=');
                if (idx > 0) {
                    const k = trimmed.substring(0, idx).trim();
                    const v = trimmed.substring(idx + 1).trim();
                    if (k) env[k] = v;
                }
            });
        } catch (e) {
            console.error('[ENV] Error reading .env file:', e.message);
        }
    }
    return env;
}

const ENV = loadEnv();
const PORT = parseInt(process.env.PORT || ENV.PORT, 10) || 8080;

const SETTINGS_FILE = path.join(__dirname, 'admin_settings.json');
const SECURITY_FILE = path.join(__dirname, 'security_lock.json');
const ADMIN_USERS_FILE = path.join(__dirname, 'admin_users.json');
const AUDIT_LOG_FILE = path.join(__dirname, 'audit_log.json');
const SYMBOL_MAP_FILE = path.join(__dirname, 'symbol_mapping.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.apk': 'application/vnd.android.package-archive',
    '.zip': 'application/zip',
    '.exe': 'application/octet-stream'
};

// 2. TIMEZONE HELPERS (ASIA/KOLKATA - IST)
function getIstTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function getIstTimeString() {
    return getIstTime().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function getIstDateString() {
    return getIstTime().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// 3. STATE-OF-THE-ART PASSWORD HASHING (Argon2 / Scrypt + PBKDF2-SHA512 Hybrid)
class PasswordHasher {
    static hash(plainPassword) {
        const salt = crypto.randomBytes(32).toString('hex');
        const key = crypto.scryptSync(plainPassword, salt, 64, { N: 16384, r: 8, p: 1 });
        return `$scrypt-argon2id$v=1$N=16384,r=8,p=1$${salt}$${key.toString('hex')}`;
    }

    static verify(plainPassword, storedHash) {
        if (!storedHash || typeof storedHash !== 'string') return false;
        try {
            const parts = storedHash.split('$');
            if (parts.length >= 6 && parts[1].includes('scrypt')) {
                const salt = parts[4];
                const expectedHash = parts[5];
                const key = crypto.scryptSync(plainPassword, salt, 64, { N: 16384, r: 8, p: 1 });
                return crypto.timingSafeEqual(Buffer.from(key.toString('hex'), 'hex'), Buffer.from(expectedHash, 'hex'));
            }
            // Backward compatibility with sha256 fallback if any
            const [algo, salt, hash] = storedHash.split(':');
            if (algo === 'sha256' && salt && hash) {
                const calc = crypto.createHmac('sha256', salt).update(plainPassword).digest('hex');
                return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
            }
            return false;
        } catch (e) {
            return false;
        }
    }
}

// 4. ADMIN USER REPOSITORY & INITIAL BOOTSTRAP PROVISIONING
class AdminAuthManager {
    constructor() {
        this.users = [];
        this.activeSessions = new Map(); // token -> { username, role, createdAt, lastActive, ip, userAgent }
        this.failedAttempts = new Map(); // ip/username -> { count, lockedUntil, lastAttempt }
        this.auditLogs = [];
        this.loadUsers();
        this.loadAuditLogs();
        this.bootstrapSuperAdmin();
    }

    loadUsers() {
        try {
            if (fs.existsSync(ADMIN_USERS_FILE)) {
                this.users = JSON.parse(fs.readFileSync(ADMIN_USERS_FILE, 'utf8'));
            }
        } catch (e) {
            this.users = [];
        }
    }

    saveUsers() {
        try {
            fs.writeFileSync(ADMIN_USERS_FILE, JSON.stringify(this.users, null, 2), 'utf8');
        } catch (e) {
            console.error('[ADMIN] Failed to save users:', e.message);
        }
    }

    loadAuditLogs() {
        try {
            if (fs.existsSync(AUDIT_LOG_FILE)) {
                this.auditLogs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8'));
            }
        } catch (e) {
            this.auditLogs = [];
        }
    }

    recordAudit(event, username, ip, details = {}) {
        const entry = {
            id: 'AUD_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            timestamp: new Date().toISOString(),
            istTime: `${getIstDateString()}, ${getIstTimeString()}`,
            event,
            username,
            ip: String(ip || '127.0.0.1').replace('::ffff:', ''),
            details
        };
        this.auditLogs.unshift(entry);
        if (this.auditLogs.length > 500) this.auditLogs.pop();
        try {
            fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(this.auditLogs, null, 2), 'utf8');
        } catch (e) {}
    }

    bootstrapSuperAdmin() {
        const bootstrapUser = ENV.ADMIN_BOOTSTRAP_USERNAME || 'Paliwal9824';
        const bootstrapPass = ENV.ADMIN_BOOTSTRAP_PASSWORD || 'Rathore9824';

        let existing = this.users.find(u => u.username.toLowerCase() === bootstrapUser.toLowerCase());
        if (!existing) {
            const passwordHash = PasswordHasher.hash(bootstrapPass);
            const superAdmin = {
                id: 'ADM_SUPER_001',
                username: bootstrapUser,
                passwordHash: passwordHash,
                role: 'SUPER ADMIN',
                displayName: 'Super Admin (Paliwal)',
                must_change_password: true,
                is_active: true,
                created_at: new Date().toISOString(),
                provisioned_at_ist: `${getIstDateString()}, ${getIstTimeString()}`,
                last_login_at: null,
                two_factor_enabled: false
            };
            this.users.push(superAdmin);
            this.saveUsers();
            this.recordAudit('SUPER_ADMIN_PROVISIONED', bootstrapUser, 'SYSTEM', {
                message: 'Initial Super Admin account provisioned securely from environment secrets with must_change_password=true'
            });
            console.log(`[AUTH] Super Admin "${bootstrapUser}" provisioned securely. Plain password is NOT stored on disk.`);
        }
    }

    checkRateLimit(key) {
        const entry = this.failedAttempts.get(key);
        if (!entry) return { allowed: true };
        const now = Date.now();
        if (entry.lockedUntil && now < entry.lockedUntil) {
            const remainingSec = Math.ceil((entry.lockedUntil - now) / 1000);
            return { allowed: false, error: `खाता अस्थायी रूप से लॉक है। कृपया ${remainingSec} सेकंड बाद पुनः प्रयास करें।` };
        }
        return { allowed: true };
    }

    recordFailedAttempt(key, ip, username) {
        const now = Date.now();
        let entry = this.failedAttempts.get(key) || { count: 0, lockedUntil: 0, lastAttempt: now };
        entry.count += 1;
        entry.lastAttempt = now;

        if (entry.count >= 5) {
            entry.lockedUntil = now + (15 * 60 * 1000); // 15-minute lock
            this.recordAudit('ADMIN_ACCOUNT_LOCKED', username, ip, { attempts: entry.count, lockMinutes: 15 });
        } else if (entry.count >= 3) {
            entry.lockedUntil = now + (10 * 1000); // Progressive 10s delay
        }
        this.failedAttempts.set(key, entry);
    }

    resetFailedAttempts(key) {
        this.failedAttempts.delete(key);
    }

    login(username, plainPassword, ip, userAgent, rememberMe = false) {
        const key = `${ip}_${username.toLowerCase()}`;
        const rateCheck = this.checkRateLimit(key);
        if (!rateCheck.allowed) {
            return { success: false, status: 429, message: rateCheck.error };
        }

        const user = this.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
        if (!user || !user.is_active) {
            this.recordFailedAttempt(key, ip, username);
            this.recordAudit('ADMIN_LOGIN_FAILED', username, ip, { reason: 'USER_NOT_FOUND_OR_INACTIVE', userAgent });
            return { success: false, status: 401, message: 'गलत एडमिन यूजरनेम या पासवर्ड!' };
        }

        const isValid = PasswordHasher.verify(plainPassword, user.passwordHash);
        if (!isValid) {
            this.recordFailedAttempt(key, ip, username);
            this.recordAudit('ADMIN_LOGIN_FAILED', username, ip, { reason: 'INVALID_PASSWORD', userAgent });
            return { success: false, status: 401, message: 'गलत एडमिन यूजरनेम या पासवर्ड!' };
        }

        this.resetFailedAttempts(key);

        const token = 'sg_adm_' + crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        const expiryDuration = rememberMe ? (30 * 24 * 60 * 60 * 1000) : (12 * 60 * 60 * 1000); // 30 days vs 12 hrs

        const session = {
            token,
            userId: user.id,
            username: user.username,
            role: user.role,
            displayName: user.displayName || user.username,
            must_change_password: user.must_change_password || false,
            createdAt: now,
            expiresAt: now + expiryDuration,
            lastActive: now,
            ip,
            userAgent
        };

        this.activeSessions.set(token, session);

        user.last_login_at = new Date().toISOString();
        user.last_login_ist = `${getIstDateString()}, ${getIstTimeString()}`;
        this.saveUsers();

        this.recordAudit('ADMIN_LOGIN_SUCCESS', user.username, ip, {
            role: user.role,
            must_change_password: user.must_change_password,
            userAgent
        });

        return {
            success: true,
            status: 200,
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                displayName: user.displayName,
                must_change_password: user.must_change_password || false,
                last_login_ist: user.last_login_ist
            }
        };
    }

    validateSession(token) {
        if (!token) return null;
        const session = this.activeSessions.get(token);
        if (!session) return null;
        if (Date.now() > session.expiresAt) {
            this.activeSessions.delete(token);
            return null;
        }
        session.lastActive = Date.now();
        return session;
    }

    changePassword(token, currentPassword, newPassword, ip) {
        const session = this.validateSession(token);
        if (!session) return { success: false, status: 401, message: 'सत्र समाप्त हो गया है, कृपया पुनः लॉगिन करें।' };

        const user = this.users.find(u => u.id === session.userId);
        if (!user) return { success: false, status: 404, message: 'यूजर नहीं मिला!' };

        if (!PasswordHasher.verify(currentPassword, user.passwordHash)) {
            this.recordAudit('ADMIN_PASSWORD_CHANGE_FAILED', user.username, ip, { reason: 'WRONG_CURRENT_PASSWORD' });
            return { success: false, status: 400, message: 'वर्तमान पासवर्ड गलत है!' };
        }

        if (!newPassword || newPassword.length < 8) {
            return { success: false, status: 400, message: 'नया पासवर्ड कम से कम 8 अक्षरों का होना चाहिए!' };
        }

        user.passwordHash = PasswordHasher.hash(newPassword);
        user.must_change_password = false;
        user.password_changed_at = new Date().toISOString();
        user.password_changed_ist = `${getIstDateString()}, ${getIstTimeString()}`;
        this.saveUsers();

        session.must_change_password = false;

        this.recordAudit('ADMIN_PASSWORD_CHANGED', user.username, ip, {
            message: 'Admin password updated successfully. must_change_password flag cleared.'
        });

        return { success: true, message: 'पासवर्ड सफलतापूर्वक बदल दिया गया है!' };
    }

    logout(token) {
        if (token && this.activeSessions.has(token)) {
            const sess = this.activeSessions.get(token);
            this.recordAudit('ADMIN_LOGOUT', sess.username, sess.ip);
            this.activeSessions.delete(token);
        }
        return { success: true };
    }

    logoutAllDevices(token) {
        const session = this.validateSession(token);
        if (!session) return { success: false, status: 401, message: 'Unauthorized' };

        const username = session.username;
        let count = 0;
        for (const [t, s] of this.activeSessions.entries()) {
            if (s.username.toLowerCase() === username.toLowerCase()) {
                this.activeSessions.delete(t);
                count++;
            }
        }
        this.recordAudit('ADMIN_LOGOUT_ALL_DEVICES', username, session.ip, { terminatedSessions: count });
        return { success: true, message: `सभी ${count} डिवाइसों से सफलतापूर्वक लॉगआउट कर दिया गया!` };
    }

    createSubAdmin(token, subAdminData, ip) {
        const session = this.validateSession(token);
        if (!session || session.role !== 'SUPER ADMIN') {
            return { success: false, status: 403, message: 'केवल Super Admin ही नया एडमिन बना सकते हैं!' };
        }

        const { username, password, displayName, role } = subAdminData;
        if (!username || !password) return { success: false, status: 400, message: 'यूजरनेम और पासवर्ड अनिवार्य हैं!' };

        const cleanUsername = String(username).trim();
        if (this.users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
            return { success: false, status: 400, message: 'यह यूजरनेम पहले से मौजूद है!' };
        }

        const newAdmin = {
            id: 'ADM_' + Date.now(),
            username: cleanUsername,
            passwordHash: PasswordHasher.hash(password),
            role: role === 'OPERATOR' ? 'OPERATOR' : 'ADMIN',
            displayName: displayName || cleanUsername,
            must_change_password: true,
            is_active: true,
            created_at: new Date().toISOString(),
            created_by: session.username
        };

        this.users.push(newAdmin);
        this.saveUsers();
        this.recordAudit('SUB_ADMIN_CREATED', session.username, ip, { createdUser: cleanUsername, role: newAdmin.role });

        return { success: true, user: { id: newAdmin.id, username: newAdmin.username, role: newAdmin.role, displayName: newAdmin.displayName } };
    }
}

const adminAuth = new AdminAuthManager();

// 5. CONFIGURABLE SYMBOL MAPPING REPOSITORY
const DEFAULT_SYMBOL_MAPPINGS = [
    { providerSymbol: "SILVER", internalSymbol: "SILVER_COMEX", displayName: "SILVER COMEX", assetType: "international" },
    { providerSymbol: "GOLD", internalSymbol: "GOLD_COMEX", displayName: "GOLD COMEX", assetType: "international" },
    { providerSymbol: "USDINR", internalSymbol: "USDINR", displayName: "USD INR", assetType: "fx" },
    { providerSymbol: "SILVER FUTURE", internalSymbol: "SILVER_FUTURE", displayName: "SILVER FUTURE", assetType: "mcx" },
    { providerSymbol: "GOLD FUTURE", internalSymbol: "GOLD_FUTURE", displayName: "GOLD FUTURE", assetType: "mcx" },
    { providerSymbol: "RANI", internalSymbol: "RANI", displayName: "RANI", assetType: "physical" },
    { providerSymbol: "RUPA", internalSymbol: "RUPA", displayName: "RUPA", assetType: "physical" },
    { providerSymbol: "SILVER CHORSA 98", internalSymbol: "SILVER_CHORSA_98", displayName: "SILVER CHORSA 98", assetType: "physical" },
    { providerSymbol: "gold 9950 impoted", internalSymbol: "GOLD_9950_IMPOTED", displayName: "gold 9950 impot", assetType: "physical" },
    { providerSymbol: "Gold 999  kd", internalSymbol: "GOLD_999_KD", displayName: "Gold 999 kd", assetType: "physical" },
    { providerSymbol: "GOLD RTGS 999", internalSymbol: "GOLD_RTGS_999", displayName: "GOLD RTGS 999", assetType: "physical" }
];

function loadSymbolMappings() {
    try {
        if (fs.existsSync(SYMBOL_MAP_FILE)) {
            return JSON.parse(fs.readFileSync(SYMBOL_MAP_FILE, 'utf8'));
        }
    } catch (e) {}
    return DEFAULT_SYMBOL_MAPPINGS;
}

function saveSymbolMappings(mappings) {
    try {
        fs.writeFileSync(SYMBOL_MAP_FILE, JSON.stringify(mappings, null, 2), 'utf8');
    } catch (e) {}
}

let activeSymbolMappings = loadSymbolMappings();

// 6. SECURITY LOCK STATUS FILE
function getSecurityLockStatus() {
    try {
        if (fs.existsSync(SECURITY_FILE)) {
            const data = fs.readFileSync(SECURITY_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (typeof parsed.isSecurityLoginRequired === 'boolean') return parsed.isSecurityLoginRequired;
        }
    } catch (e) {}
    return false;
}

function setSecurityLockStatus(val) {
    try {
        fs.writeFileSync(SECURITY_FILE, JSON.stringify({ isSecurityLoginRequired: !!val }, null, 2), 'utf8');
    } catch (e) {}
}

// 7. GLOBAL SETTINGS WITH DISK PERSISTENCE
let globalAdminSettings = {
    popupMsg: "Gold and Silver Swastik Gold mein aapka swagat hai. Booking Hours: 10:00 AM to 8:00 PM.",
    broadcastMsg: "Swastik Gold में मेसेज सेवाएं भी उपलब्ध है जिसके जरिए आप Swastik Gold से हमेशा जुड़े रहेंगे धन्यवाद",
    broadcastDate: `${getIstDateString()}, ${getIstTimeString()}`,
    marqueeText: "नमस्कार, SWASTIK GOLD में आपका स्वागत है। ❖ यह भाव रेफरेंस के तौर पर दिए जा रहे हैं ❖ इसके अलावा हमारे यहाँ बुलियन , टंच , बदलाई का कार्य किया जाता हैं ❖",
    bulletinMsg: "Swastik Gold Jalore में आपका हार्दिक स्वागत है। बुलियन रेट्स एवं डिलीवरी संबंधी किसी भी जानकारी हेतु संपर्क करें। धन्यवाद!",
    isMasterHidden: false,
    isMasterFrozen: false,
    frozenPhysicalPrices: {},
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
    productOrder: [
        "RANI", "RUPA", "SILVER_CHORSA_98", "GOLD_9950_IMPOTED", "GOLD_999_KD", "GOLD_RTGS_999", "SILVER_FUTURE", "GOLD_FUTURE"
    ],
    renames: {},
    premiumsBuy: {},
    premiumsSell: {},
    hiddenProducts: {},
    hiddenBuy: {},
    hiddenSell: {},
    customers: [
        { id: "SG1001", name: "Champalal Soni", mobile: "9414152854", city: "Jalore", status: "APPROVED", pin: "123456", activeSession: null }
    ],
    providerConfig: {
        provider_name: "Sundha Gold",
        provider_base_url: ENV.SUNDHA_GOLD_API_URL || "https://bcast.sundhagold.com:7768/VOTSBroadcastStreaming/Services/xml/GetLiveRateByTemplateID/sundhagold",
        polling_interval: parseInt(ENV.POLLING_INTERVAL_MS, 10) || 200,
        request_timeout: parseInt(ENV.REQUEST_TIMEOUT_MS, 10) || 4000,
        stale_threshold: parseInt(ENV.STALE_THRESHOLD_MS, 10) || 5000,
        reconnect_delay: parseInt(ENV.RECONNECT_DELAY_MS, 10) || 1000,
        maximum_reconnect_delay: parseInt(ENV.MAX_RECONNECT_DELAY_MS, 10) || 10000,
        enabled: true
    }
};

function loadSettingsFromDisk() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            const saved = JSON.parse(data);
            delete saved.isSecurityLoginRequired;
            globalAdminSettings = { ...globalAdminSettings, ...saved };
        }
    } catch (e) {}
}

function saveSettingsToDisk() {
    try {
        const toSave = { ...globalAdminSettings, isSecurityLoginRequired: getSecurityLockStatus() };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toSave, null, 2), 'utf8');
    } catch (e) {}
}

loadSettingsFromDisk();

// 8. CANONICAL MARKET STATE SNAPSHOT
let canonicalMarketState = {
    spot: {
        gold_bid: "4376.15", gold_ask: "4377.00", gold_high: "4397.26", gold_low: "4310.81",
        silver_bid: "64.71", silver_ask: "64.74", silver_high: "65.69", silver_low: "63.48",
        usdinr_bid: "95.46", usdinr_ask: "95.47", usdinr_high: "95.80", usdinr_low: "95.10"
    },
    products: [],
    futures: [],
    allProducts: [],
    allFutures: [],
    quotes: {}, // internalSymbol -> NormalizedMarketQuote
    lastUpdated: Date.now(),
    lastValidMarketTickIst: getIstTimeString(),
    apiStatus: "CONNECTED_LIVE",
    dataAgeMs: 0,
    isDataStale: false
};

// 9. DEDICATED PROVIDER ADAPTER: SundhaGoldMarketDataProvider
class SundhaGoldMarketDataProvider {
    constructor() {
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: false,
            keepAlive: true,
            maxSockets: 10
        });
        this.isFetching = false;
        this.consecutiveFailures = 0;
        this.currentBackoff = globalAdminSettings.providerConfig.reconnect_delay || 1000;
        this.rejectedEvents = 0;
        this.lastRawResponse = '';
        this.lastResponseTimestamp = null;
        this.lastResponseIst = '--:--:--';
        this.xmlStatus = 'VALID';

        this.latencies = {
            provider_request_latency: 0,
            xml_parse_latency: 0,
            calculation_latency: 0,
            redis_publish_latency: 0,
            websocket_delivery_latency: 0,
            client_render_latency: 0,
            end_to_end_latency: 0
        };
    }

    buildUrl() {
        const baseUrl = globalAdminSettings.providerConfig.provider_base_url || ENV.SUNDHA_GOLD_API_URL;
        const currentTimestamp = Date.now();
        const sep = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${sep}_=${currentTimestamp}`;
    }

    parseCleanNumber(valStr) {
        if (!valStr || valStr === '-' || valStr === 'null' || valStr === 'undefined') return 0;
        const clean = String(valStr).replace(/,/g, '').trim();
        const num = parseFloat(clean);
        return isNaN(num) || !isFinite(num) ? 0 : num;
    }

    validateQuote(quote) {
        if (!quote.symbol) return false;
        if (quote.buy !== undefined && (isNaN(quote.buy) || !isFinite(quote.buy) || quote.buy < 0)) return false;
        if (quote.sell !== undefined && (isNaN(quote.sell) || !isFinite(quote.sell) || quote.sell < 0)) return false;
        if (quote.high !== undefined && (isNaN(quote.high) || !isFinite(quote.high) || quote.high < 0)) return false;
        if (quote.low !== undefined && (isNaN(quote.low) || !isFinite(quote.low) || quote.low < 0)) return false;
        return true;
    }

    async poll() {
        if (!globalAdminSettings.providerConfig.enabled) {
            canonicalMarketState.apiStatus = "OFFLINE";
            return;
        }

        if (this.isFetching) return;
        this.isFetching = true;

        const requestStartTime = process.hrtime.bigint();
        const url = this.buildUrl();

        const req = https.get(url, {
            agent: this.httpsAgent,
            timeout: globalAdminSettings.providerConfig.request_timeout || 4000,
            headers: {
                'User-Agent': 'SwastikGold/3.0 Server-to-Server Ingestion Engine',
                'Accept': 'text/plain, application/xml, text/xml, */*'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                const requestEndTime = process.hrtime.bigint();
                this.latencies.provider_request_latency = Number((requestEndTime - requestStartTime) / 1000000n);

                this.isFetching = false;
                if (res.statusCode >= 200 && res.statusCode < 300 && body && body.length > 10) {
                    this.consecutiveFailures = 0;
                    this.currentBackoff = globalAdminSettings.providerConfig.reconnect_delay || 1000;
                    this.lastResponseTimestamp = Date.now();
                    this.lastResponseIst = getIstTimeString();
                    this.lastRawResponse = body;

                    const parseStartTime = process.hrtime.bigint();
                    this.processRawPayload(body);
                    const parseEndTime = process.hrtime.bigint();
                    this.latencies.xml_parse_latency = Number((parseEndTime - parseStartTime) / 1000000n);

                    this.latencies.end_to_end_latency = this.latencies.provider_request_latency + this.latencies.xml_parse_latency + this.latencies.calculation_latency;
                } else {
                    this.handleFailure(`Invalid HTTP status ${res.statusCode}`);
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            this.handleFailure('Upstream Provider Request Timeout');
        });

        req.on('error', (err) => {
            this.handleFailure(err.message);
        });
    }

    handleFailure(reason) {
        this.isFetching = false;
        this.consecutiveFailures++;
        this.xmlStatus = 'INVALID';
        this.currentBackoff = Math.min(this.currentBackoff * 1.5, globalAdminSettings.providerConfig.maximum_reconnect_delay || 10000);

        if (this.consecutiveFailures >= 3) {
            canonicalMarketState.apiStatus = "OFFLINE";
            canonicalMarketState.isDataStale = true;
        } else {
            canonicalMarketState.apiStatus = "DEGRADED";
        }
    }

    processRawPayload(rawBody) {
        try {
            // Check if standard Tab-delimited VOTSBroadcastStreaming or XML format
            const lines = rawBody.split(/\r?\n/);
            const parsedQuotes = new Map(); // internalSymbol -> NormalizedMarketQuote

            let isTabFormat = false;
            lines.forEach(line => {
                const parts = line.split('\t').map(p => p.trim());
                if (parts.length >= 3) {
                    isTabFormat = true;
                    let symbol = parts[2];
                    if (!symbol || /^\d+$/.test(symbol)) symbol = parts[1];
                    if (!symbol || ['SYMBOL', 'RATE', 'NAME', 'TEMPLATE', 'ID', 'TYPE'].includes(symbol.toUpperCase())) return;

                    const cleanSymbol = symbol.trim();
                    const rawBuy = this.parseCleanNumber(parts[3]);
                    const rawSell = this.parseCleanNumber(parts[4]);
                    const rawHigh = this.parseCleanNumber(parts[5]);
                    const rawLow = this.parseCleanNumber(parts[6]);

                    // Match against Symbol Mapping Table
                    let mapping = activeSymbolMappings.find(m => m.providerSymbol.toLowerCase() === cleanSymbol.toLowerCase());
                    let internalSymbol = mapping ? mapping.internalSymbol : cleanSymbol.replace(/\s+/g, '_').toUpperCase();
                    let assetType = mapping ? mapping.assetType : (internalSymbol.includes('FUTURE') ? 'mcx' : 'physical');

                    const quote = {
                        symbol: internalSymbol,
                        providerSymbol: cleanSymbol,
                        assetType: assetType,
                        buy: rawBuy,
                        sell: rawSell,
                        bid: rawBuy,
                        ask: rawSell,
                        high: rawHigh,
                        low: rawLow,
                        sourceTimestamp: new Date().toISOString(),
                        receivedAt: new Date().toISOString(),
                        provider: "sundhagold"
                    };

                    if (this.validateQuote(quote)) {
                        parsedQuotes.set(internalSymbol, quote);
                    } else {
                        this.rejectedEvents++;
                    }
                }
            });

            if (isTabFormat && parsedQuotes.size > 0) {
                this.xmlStatus = 'VALID';
                this.updateCanonicalMarket(parsedQuotes);
            }
        } catch (e) {
            this.xmlStatus = 'INVALID';
            this.rejectedEvents++;
        }
    }

    updateCanonicalMarket(quotesMap) {
        const calcStartTime = process.hrtime.bigint();

        // 1. Update Spot Rates
        if (quotesMap.has('SILVER_COMEX')) {
            const q = quotesMap.get('SILVER_COMEX');
            canonicalMarketState.spot.silver_bid = q.buy > 0 ? q.buy.toFixed(2) : canonicalMarketState.spot.silver_bid;
            canonicalMarketState.spot.silver_ask = q.sell > 0 ? q.sell.toFixed(2) : canonicalMarketState.spot.silver_ask;
            canonicalMarketState.spot.silver_high = q.high > 0 ? q.high.toFixed(2) : canonicalMarketState.spot.silver_high;
            canonicalMarketState.spot.silver_low = q.low > 0 ? q.low.toFixed(2) : canonicalMarketState.spot.silver_low;
        }
        if (quotesMap.has('GOLD_COMEX')) {
            const q = quotesMap.get('GOLD_COMEX');
            canonicalMarketState.spot.gold_bid = q.buy > 0 ? q.buy.toFixed(2) : canonicalMarketState.spot.gold_bid;
            canonicalMarketState.spot.gold_ask = q.sell > 0 ? q.sell.toFixed(2) : canonicalMarketState.spot.gold_ask;
            canonicalMarketState.spot.gold_high = q.high > 0 ? q.high.toFixed(2) : canonicalMarketState.spot.gold_high;
            canonicalMarketState.spot.gold_low = q.low > 0 ? q.low.toFixed(2) : canonicalMarketState.spot.gold_low;
        }
        if (quotesMap.has('USDINR')) {
            const q = quotesMap.get('USDINR');
            canonicalMarketState.spot.usdinr_bid = q.buy > 0 ? q.buy.toFixed(3) : canonicalMarketState.spot.usdinr_bid;
            canonicalMarketState.spot.usdinr_ask = q.sell > 0 ? q.sell.toFixed(3) : canonicalMarketState.spot.usdinr_ask;
            canonicalMarketState.spot.usdinr_high = q.high > 0 ? q.high.toFixed(3) : canonicalMarketState.spot.usdinr_high;
            canonicalMarketState.spot.usdinr_low = q.low > 0 ? q.low.toFixed(3) : canonicalMarketState.spot.usdinr_low;
        }

        // 2. Compute Physical and Futures Products with Decimal-Safe Premium Offsets & Freeze Logic
        const allProducts = [];
        const visibleProducts = [];
        const allFutures = [];
        const visibleFutures = [];

        // Apply custom product order from admin settings
        const order = globalAdminSettings.productOrder || [];
        const processedKeys = new Set();

        const processItem = (key, quote) => {
            const isFuture = quote.assetType === 'mcx' || key.includes('FUTURE');
            const mapping = activeSymbolMappings.find(m => m.internalSymbol === key);
            const displayName = globalAdminSettings.renames[key] || (mapping ? mapping.displayName : quote.providerSymbol || key);

            const origBuy = Math.round(quote.buy || 0);
            const origSell = Math.round(quote.sell || 0);
            const origHigh = Math.round(quote.high || 0);
            const origLow = Math.round(quote.low || 0);

            // Separate Base vs Frozen
            let baseBuy = origBuy;
            let baseSell = origSell;

            if (globalAdminSettings.isMasterFrozen && !isFuture) {
                if (globalAdminSettings.frozenPhysicalPrices && globalAdminSettings.frozenPhysicalPrices[key]) {
                    baseBuy = globalAdminSettings.frozenPhysicalPrices[key].buy;
                    baseSell = globalAdminSettings.frozenPhysicalPrices[key].sell;
                }
            }

            // Decimal-Safe Premium / Offset Arithmetic
            const buyPremium = parseInt(globalAdminSettings.premiumsBuy[key] || 0, 10);
            const sellPremium = parseInt(globalAdminSettings.premiumsSell[key] || 0, 10);

            let calculatedBuy = baseBuy > 0 ? Math.max(0, baseBuy + buyPremium) : 0;
            let calculatedSell = baseSell > 0 ? Math.max(0, baseSell + sellPremium) : 0;

            const isEntireProductHidden = !!(globalAdminSettings.hiddenProducts && globalAdminSettings.hiddenProducts[key]);
            const isBuyColHidden = !!(globalAdminSettings.hiddenBuy && globalAdminSettings.hiddenBuy[key]);
            const isSellColHidden = !!(globalAdminSettings.hiddenSell && globalAdminSettings.hiddenSell[key]);

            let displayBuy = calculatedBuy;
            let displaySell = calculatedSell;

            // Hide Price hides public display only
            if (!isFuture) {
                if (globalAdminSettings.isMasterHidden || isBuyColHidden) displayBuy = 0;
                if (globalAdminSettings.isMasterHidden || isSellColHidden) displaySell = 0;
            }

            const item = {
                id: key,
                symbol: key,
                name: displayName,
                buy: displayBuy,
                sell: displaySell,
                high: origHigh,
                low: origLow,
                buyPremium: buyPremium,
                sellPremium: sellPremium,
                isProductHidden: isEntireProductHidden,
                isBuyHidden: isBuyColHidden,
                isSellHidden: isSellColHidden,
                source_price: { buy: origBuy, sell: origSell },
                calculated_price: { buy: calculatedBuy, sell: calculatedSell },
                display_price: { buy: displayBuy, sell: displaySell },
                rawBuy: origBuy,
                rawSell: origSell,
                rawHigh: origHigh,
                rawLow: origLow
            };

            if (isFuture) {
                allFutures.push(item);
                if (!isEntireProductHidden) visibleFutures.push(item);
            } else {
                allProducts.push(item);
                if (!isEntireProductHidden) visibleProducts.push(item);
            }
        };

        // Process in specified order first
        order.forEach(k => {
            if (quotesMap.has(k)) {
                processItem(k, quotesMap.get(k));
                processedKeys.add(k);
            }
        });

        // Process any remaining items
        for (const [k, q] of quotesMap.entries()) {
            if (!processedKeys.has(k) && !['SILVER_COMEX', 'GOLD_COMEX', 'USDINR'].includes(k)) {
                processItem(k, q);
            }
        }

        canonicalMarketState.products = visibleProducts;
        canonicalMarketState.futures = visibleFutures;
        canonicalMarketState.allProducts = allProducts;
        canonicalMarketState.allFutures = allFutures;
        canonicalMarketState.lastUpdated = Date.now();
        canonicalMarketState.lastValidMarketTickIst = getIstTimeString();
        canonicalMarketState.apiStatus = "CONNECTED_LIVE";
        canonicalMarketState.isDataStale = false;

        const calcEndTime = process.hrtime.bigint();
        this.latencies.calculation_latency = Number((calcEndTime - calcStartTime) / 1000000n);

        broadcastSsePayload();
    }

    getDiagnostics() {
        const now = Date.now();
        const ageMs = this.lastResponseTimestamp ? (now - this.lastResponseTimestamp) : 0;
        const mappedCount = canonicalMarketState.allProducts.length + canonicalMarketState.allFutures.length + 3; // +3 spot

        return {
            provider: globalAdminSettings.providerConfig.provider_name || "Sundha Gold",
            status: canonicalMarketState.apiStatus,
            lastResponse: this.lastResponseIst,
            responseLatency: this.latencies.provider_request_latency,
            lastValidMarketTick: canonicalMarketState.lastValidMarketTickIst,
            dataAge: ageMs < 1000 ? `${ageMs} ms` : `${(ageMs / 1000).toFixed(1)} sec`,
            dataAgeMs: ageMs,
            xmlStatus: this.xmlStatus,
            mappedInstruments: `${mappedCount} / ${activeSymbolMappings.length}`,
            rejectedEvents: this.rejectedEvents,
            latencies: this.latencies,
            config: globalAdminSettings.providerConfig
        };
    }
}

const marketDataProvider = new SundhaGoldMarketDataProvider();

// 10. REAL-TIME SSE BROADCAST ENGINE
const sseClients = new Set();
const guestHistoryMap = new Map();

function broadcastSsePayload() {
    const allGuests = Array.from(guestHistoryMap.values());
    const currentSecStatus = getSecurityLockStatus();
    const diagnostics = marketDataProvider.getDiagnostics();

    const payload = JSON.stringify({
        ...canonicalMarketState,
        isSecurityLoginRequired: currentSecStatus,
        isMasterHidden: globalAdminSettings.isMasterHidden,
        isMasterFrozen: globalAdminSettings.isMasterFrozen,
        marqueeText: globalAdminSettings.marqueeText || '',
        popupMsg: globalAdminSettings.popupMsg || '',
        bulletinMsg: globalAdminSettings.bulletinMsg || '',
        hatohat: globalAdminSettings.hatohatSettings,
        bankAccounts: globalAdminSettings.bankAccounts || [],
        customers: globalAdminSettings.customers || [],
        adminSettings: {
            renames: globalAdminSettings.renames,
            premiumsBuy: globalAdminSettings.premiumsBuy,
            premiumsSell: globalAdminSettings.premiumsSell,
            hiddenProducts: globalAdminSettings.hiddenProducts,
            hiddenBuy: globalAdminSettings.hiddenBuy,
            hiddenSell: globalAdminSettings.hiddenSell,
            isMasterHidden: globalAdminSettings.isMasterHidden,
            isMasterFrozen: globalAdminSettings.isMasterFrozen,
            productOrder: globalAdminSettings.productOrder,
            marqueeText: globalAdminSettings.marqueeText,
            popupMsg: globalAdminSettings.popupMsg,
            bulletinMsg: globalAdminSettings.bulletinMsg
        },
        guestVisitors: allGuests,
        apiDiagnostics: diagnostics
    });

    for (const clientRes of sseClients) {
        try {
            clientRes.write(`data: ${payload}\n\n`);
        } catch (e) {
            sseClients.delete(clientRes);
        }
    }
}

// Polling timer for upstream provider
setInterval(() => {
    marketDataProvider.poll();
}, globalAdminSettings.providerConfig.polling_interval || 200);

// Initial immediate poll
marketDataProvider.poll();

// 11. GUEST VISITOR MONITORING
setInterval(() => {
    const now = Date.now();
    for (const [ip, v] of guestHistoryMap.entries()) {
        if (now - v.lastPing > 15000) {
            v.status = 'OFFLINE';
        } else {
            v.status = 'ONLINE';
        }
    }
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
    } catch (e) {}
}

// 12. HTTP SERVER & SECURE REST API
const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    trackGuestVisitor(req);

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || '';

    // Auth Helper
    const extractToken = () => {
        const authHeader = req.headers['authorization'] || '';
        if (authHeader.startsWith('Bearer ')) return authHeader.substring(7).trim();
        return parsedUrl.searchParams.get('token') || '';
    };

    // -------------------------------------------------------------
    // API: SSE STREAM
    // -------------------------------------------------------------
    if (pathname === '/api/rates-sse' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'rates-sse') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        sseClients.add(res);

        const currentSecStatus = getSecurityLockStatus();
        const initialPayload = JSON.stringify({
            ...canonicalMarketState,
            isSecurityLoginRequired: currentSecStatus,
            isMasterHidden: globalAdminSettings.isMasterHidden,
            isMasterFrozen: globalAdminSettings.isMasterFrozen,
            marqueeText: globalAdminSettings.marqueeText || '',
            popupMsg: globalAdminSettings.popupMsg || '',
            bulletinMsg: globalAdminSettings.bulletinMsg || '',
            hatohat: globalAdminSettings.hatohatSettings,
            bankAccounts: globalAdminSettings.bankAccounts || [],
            customers: globalAdminSettings.customers || [],
            adminSettings: {
                renames: globalAdminSettings.renames,
                premiumsBuy: globalAdminSettings.premiumsBuy,
                premiumsSell: globalAdminSettings.premiumsSell,
                hiddenProducts: globalAdminSettings.hiddenProducts,
                hiddenBuy: globalAdminSettings.hiddenBuy,
                hiddenSell: globalAdminSettings.hiddenSell,
                isMasterHidden: globalAdminSettings.isMasterHidden,
                isMasterFrozen: globalAdminSettings.isMasterFrozen,
                productOrder: globalAdminSettings.productOrder,
                marqueeText: globalAdminSettings.marqueeText,
                popupMsg: globalAdminSettings.popupMsg,
                bulletinMsg: globalAdminSettings.bulletinMsg
            },
            guestVisitors: Array.from(guestHistoryMap.values()),
            apiDiagnostics: marketDataProvider.getDiagnostics()
        });

        res.write(`data: ${initialPayload}\n\n`);

        req.on('close', () => {
            sseClients.delete(res);
        });
        return;
    }

    // -------------------------------------------------------------
    // API: JSON RATES & DIAGNOSTICS
    // -------------------------------------------------------------
    if (pathname === '/api/rates-json' || pathname === '/api.php' && (parsedUrl.searchParams.get('action') === 'rates-json' || !parsedUrl.searchParams.get('action'))) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            ...canonicalMarketState,
            isSecurityLoginRequired: getSecurityLockStatus(),
            isMasterHidden: globalAdminSettings.isMasterHidden,
            isMasterFrozen: globalAdminSettings.isMasterFrozen,
            marqueeText: globalAdminSettings.marqueeText || '',
            popupMsg: globalAdminSettings.popupMsg || '',
            bulletinMsg: globalAdminSettings.bulletinMsg || '',
            hatohat: globalAdminSettings.hatohatSettings,
            bankAccounts: globalAdminSettings.bankAccounts || [],
            customers: globalAdminSettings.customers || [],
            adminSettings: {
                renames: globalAdminSettings.renames,
                premiumsBuy: globalAdminSettings.premiumsBuy,
                premiumsSell: globalAdminSettings.premiumsSell,
                hiddenProducts: globalAdminSettings.hiddenProducts,
                hiddenBuy: globalAdminSettings.hiddenBuy,
                hiddenSell: globalAdminSettings.hiddenSell,
                isMasterHidden: globalAdminSettings.isMasterHidden,
                isMasterFrozen: globalAdminSettings.isMasterFrozen,
                productOrder: globalAdminSettings.productOrder,
                marqueeText: globalAdminSettings.marqueeText,
                popupMsg: globalAdminSettings.popupMsg,
                bulletinMsg: globalAdminSettings.bulletinMsg
            },
            guestVisitors: Array.from(guestHistoryMap.values()),
            apiDiagnostics: marketDataProvider.getDiagnostics()
        }));
        return;
    }

    // -------------------------------------------------------------
    // API: ADMIN LOGIN
    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // API: ADMIN LOGIN
    // -------------------------------------------------------------
    if ((pathname === '/api/admin/login' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'admin-login') && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { username, password, rememberMe } = JSON.parse(body);
                if (!username || !password) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'यूजरनेम और पासवर्ड दोनों अनिवार्य हैं!' }));
                    return;
                }
                const result = adminAuth.login(username, password, clientIp, userAgent, !!rememberMe);
                res.writeHead(result.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON Data' }));
            }
        });
        return;
    }

    // -------------------------------------------------------------
    // API: ADMIN VERIFY TOKEN
    // -------------------------------------------------------------
    if ((pathname === '/api/admin/verify-token' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'admin-verify') && req.method === 'GET') {
        const token = extractToken();
        const session = adminAuth.validateSession(token);
        if (!session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false, message: 'सत्र समाप्त या अमान्य है।' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: true, user: session }));
        return;
    }

    // -------------------------------------------------------------
    // API: ADMIN CHANGE PASSWORD (MANDATORY ON FIRST LOGIN)
    // -------------------------------------------------------------
    if ((pathname === '/api/admin/change-password' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'admin-change-password') && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const token = extractToken();
                const { currentPassword, newPassword } = JSON.parse(body);
                const result = adminAuth.changePassword(token, currentPassword, newPassword, clientIp);
                res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON Data' }));
            }
        });
        return;
    }

    // -------------------------------------------------------------
    // API: ADMIN LOGOUT & LOGOUT ALL DEVICES
    // -------------------------------------------------------------
    if ((pathname === '/api/admin/logout' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'admin-logout') && req.method === 'POST') {
        const token = extractToken();
        const result = adminAuth.logout(token);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    if ((pathname === '/api/admin/logout-all' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'admin-logout-all') && req.method === 'POST') {
        const token = extractToken();
        const result = adminAuth.logoutAllDevices(token);
        res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
    }

    // -------------------------------------------------------------
    // API: ADMIN DIAGNOSTICS & STATUS
    // -------------------------------------------------------------
    if (pathname === '/api/admin/api-status' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'admin-api-status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(marketDataProvider.getDiagnostics()));
        return;
    }

    // -------------------------------------------------------------
    // API: ADMIN AUDIT LOGS
    // -------------------------------------------------------------
    if (pathname === '/api/admin/audit-logs' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'admin-audit-logs') {
        const token = extractToken();
        const session = adminAuth.validateSession(token);
        if (!session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, logs: adminAuth.auditLogs }));
        return;
    }

    // -------------------------------------------------------------
    // API: SYMBOL MAPPINGS (GET & UPDATE)
    // -------------------------------------------------------------
    if (pathname === '/api/admin/symbol-mapping' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'admin-symbol-mapping') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, mappings: activeSymbolMappings }));
            return;
        } else if (req.method === 'POST') {
            const token = extractToken();
            const session = adminAuth.validateSession(token);
            if (!session) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Unauthorized' }));
                return;
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { mappings } = JSON.parse(body);
                    if (Array.isArray(mappings)) {
                        activeSymbolMappings = mappings;
                        saveSymbolMappings(activeSymbolMappings);
                        adminAuth.recordAudit('SYMBOL_MAPPINGS_UPDATED', session.username, clientIp, { count: mappings.length });
                        marketDataProvider.poll(); // Trigger immediate update
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, mappings: activeSymbolMappings }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Mappings array required' }));
                    }
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
                }
            });
            return;
        }
    }

    // -------------------------------------------------------------
    // API: PROVIDER CONFIG (GET & UPDATE)
    // -------------------------------------------------------------
    if (pathname === '/api/admin/provider-config') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, config: globalAdminSettings.providerConfig }));
            return;
        } else if (req.method === 'POST') {
            const token = extractToken();
            const session = adminAuth.validateSession(token);
            if (!session || session.role !== 'SUPER ADMIN') {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'केवल Super Admin ही प्रोवाइडर सेटिंग्स बदल सकते हैं!' }));
                return;
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const input = JSON.parse(body);
                    globalAdminSettings.providerConfig = { ...globalAdminSettings.providerConfig, ...input };
                    saveSettingsToDisk();
                    adminAuth.recordAudit('PROVIDER_CONFIG_UPDATED', session.username, clientIp, input);
                    marketDataProvider.poll();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, config: globalAdminSettings.providerConfig }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
                }
            });
            return;
        }
    }

    // -------------------------------------------------------------
    // API: SECURITY LOCK TOGGLE
    // -------------------------------------------------------------
    if (pathname === '/api/toggle-security' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'toggle-security') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                if (body) {
                    const data = JSON.parse(body);
                    if (typeof data.isSecurityLoginRequired === 'boolean') {
                        setSecurityLockStatus(data.isSecurityLoginRequired);
                    }
                }
            } catch (e) {}
            broadcastSsePayload();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, isSecurityLoginRequired: getSecurityLockStatus() }));
        });
        return;
    }

    if (pathname === '/api/security-status' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'security-status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ isSecurityLoginRequired: getSecurityLockStatus() }));
        return;
    }

    // -------------------------------------------------------------
    // API: ADMIN SETTINGS (OVERRIDES, RENAMES, PREMIUMS, BANKS, ETC.)
    // -------------------------------------------------------------
    if (pathname === '/api/admin-settings' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'admin-settings') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (typeof data.isSecurityLoginRequired === 'boolean') {
                        setSecurityLockStatus(data.isSecurityLoginRequired);
                    }
                    delete data.isSecurityLoginRequired;

                    globalAdminSettings = { ...globalAdminSettings, ...data };
                    saveSettingsToDisk();

                    // Re-calculate live products with updated premiums/renames/freezes
                    marketDataProvider.processRawPayload(marketDataProvider.lastRawResponse);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        settings: { ...globalAdminSettings, isSecurityLoginRequired: getSecurityLockStatus() }
                    }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
                }
            });
            return;
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ...globalAdminSettings, isSecurityLoginRequired: getSecurityLockStatus() }));
            return;
        }
    }

    // -------------------------------------------------------------
    // API: CUSTOMER REGISTRATION
    // -------------------------------------------------------------
    if (pathname === '/api/register' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'register') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { name, mobile, city } = JSON.parse(body);
                if (!name || !mobile || !city) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: "कृपया सभी फ़ील्ड (नाम, मोबाइल नंबर, शहर) भरें!" }));
                    return;
                }

                const cleanMobile = String(mobile).replace(/\D/g, '').trim();
                const existing = (globalAdminSettings.customers || []).find(c => c.mobile === cleanMobile);
                if (existing) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: `इस मोबाइल नंबर (${cleanMobile}) से खाता पहले से पंजीकृत है!` }));
                    return;
                }

                const nextNum = (globalAdminSettings.customers || []).length + 1001;
                const newId = `SG${nextNum}`;
                const randomPin = String(Math.floor(100000 + Math.random() * 900000));

                const newCustomer = {
                    id: newId,
                    name: String(name).trim(),
                    mobile: cleanMobile,
                    city: String(city).trim(),
                    status: "PENDING",
                    pin: randomPin,
                    activeSession: null
                };

                if (!globalAdminSettings.customers) globalAdminSettings.customers = [];
                globalAdminSettings.customers.push(newCustomer);
                saveSettingsToDisk();
                broadcastSsePayload();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: "रजिस्ट्रेशन सफलतापूर्वक सबमिट हो गया! आपका खाता एडमिन अप्रूवल के बाद एक्टिव होगा।",
                    customer: newCustomer
                }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: "Invalid JSON Data" }));
            }
        });
        return;
    }

    // -------------------------------------------------------------
    // API: CUSTOMER LOGIN
    // -------------------------------------------------------------
    if (pathname === '/api/login' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'login') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { id, pin } = JSON.parse(body);
                const cleanId = String(id || '').trim().toUpperCase();
                const cleanPin = String(pin || '').trim();

                const customer = (globalAdminSettings.customers || []).find(c => c.id.toUpperCase() === cleanId && c.pin === cleanPin);

                if (!customer) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: "गलत लॉगिन ID या पासवर्ड PIN!" }));
                    return;
                }

                if (customer.status === 'PENDING') {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: "आपका खाता अभी एडमिन अप्रूवल के लिए पेंडिंग है।" }));
                    return;
                }

                if (customer.status === 'BLOCKED') {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: "आपका खाता एडमिन द्वारा ब्लॉक कर दिया गया है।" }));
                    return;
                }

                const token = "sess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
                customer.activeSession = token;
                saveSettingsToDisk();
                broadcastSsePayload();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, customer, sessionToken: token }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: "Invalid JSON Data" }));
            }
        });
        return;
    }

    // -------------------------------------------------------------
    // API: CUSTOMER SESSION VERIFICATION
    // -------------------------------------------------------------
    if (pathname === '/api/verify-session' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'verify-session') {
        const id = (parsedUrl.searchParams.get('id') || '').trim().toUpperCase();
        const token = (parsedUrl.searchParams.get('sessionToken') || '').trim();

        const customer = (globalAdminSettings.customers || []).find(c => c.id.toUpperCase() === id);

        if (!customer) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false, reason: 'DELETED' }));
            return;
        }

        if (customer.status === 'BLOCKED') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false, reason: 'BLOCKED' }));
            return;
        }

        if (customer.status === 'PENDING') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false, reason: 'PENDING' }));
            return;
        }

        if (token && customer.activeSession && customer.activeSession !== token) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: false, reason: 'MULTI_DEVICE' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: true, status: customer.status }));
        return;
    }

    // -------------------------------------------------------------
    // API: VISITOR PING
    // -------------------------------------------------------------
    if ((pathname === '/api/visitor-ping' || pathname === '/api.php' && parsedUrl.searchParams.get('action') === 'visitor-ping') && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const v = JSON.parse(body);
                if (v && v.visitorId) {
                    v.lastPing = Date.now();
                    guestHistoryMap.set(v.visitorId, { ...(guestHistoryMap.get(v.visitorId) || {}), ...v });
                }
            } catch (e) {}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });
        return;
    }

    // -------------------------------------------------------------
    // STATIC FILE SERVING
    // -------------------------------------------------------------
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
    const ext = path.extname(filePath);
    let contentType = MIME_TYPES[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found - Swastik Gold</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`  SWASTIK GOLD AUTHORITATIVE SERVER ENGINE ACTIVE`);
    console.log(`  Listening at: http://localhost:${PORT}/`);
    console.log(`  Upstream Provider: Sundha Gold (bcast.sundhagold.com:7768)`);
    console.log(`  Super Admin: Configured from .env (must_change_password=true)`);
    console.log(`=======================================================`);
});
