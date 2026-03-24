/* ═══════════════════════════════════════════════════════════════════
   CertVerify — Frontend Application Logic
   Supports Freighter wallet or falls back to Demo Mode
   ═══════════════════════════════════════════════════════════════════ */

// ── State ───────────────────────────────────────────────────────────
const state = {
    connected: false,
    walletAddress: null,
    demoMode: true,
    // Demo storage — map of hex-hash → { data, timestamp }
    certificates: JSON.parse(localStorage.getItem('certverify_certs') || '{}'),
};

// ── DOM Elements ────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

const dom = {
    connectBtn:     $('#connectBtn'),
    manualWalletInput: $('#manualWalletInput'),
    modeBadge:      $('#modeBadge'),
    walletValue:    $('#walletValue'),
    certCount:      $('#certCount'),

    issueForm:      $('#issueForm'),
    issueInput:     $('#issueInput'),
    issueHashValue: $('#issueHashValue'),
    issueBtn:       $('#issueBtn'),
    issueResult:    $('#issueResult'),

    verifyForm:     $('#verifyForm'),
    verifyInput:    $('#verifyInput'),
    verifyHashValue:$('#verifyHashValue'),
    verifyBtn:      $('#verifyBtn'),
    verifyResult:   $('#verifyResult'),
    verifyDisplay:  $('#verifyDisplay'),
    verifyDisplayIcon: $('#verifyDisplayIcon'),
    verifyDisplayText: $('#verifyDisplayText'),

    recentList:     $('#recentList'),
    clearHistoryBtn:$('#clearHistoryBtn'),
    toastContainer: $('#toastContainer'),
};

// ── Initialise ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    attachListeners();
    updateCertCount();
    renderRecentList();

    // Auto-detect Freighter
    if (typeof window.freighterApi !== 'undefined' || typeof window.freighter !== 'undefined') {
        dom.modeBadge.textContent = 'Freighter Detected';
        dom.modeBadge.classList.add('badge--live');
    }

    showToast('Welcome! Using Demo Mode — connect Freighter for testnet interaction.', 'info');
});

// ── Event Listeners ─────────────────────────────────────────────────
function attachListeners() {
    dom.connectBtn.addEventListener('click', handleConnect);
    dom.issueForm.addEventListener('submit', handleIssueCertificate);
    dom.verifyForm.addEventListener('submit', handleVerifyCertificate);
    dom.clearHistoryBtn.addEventListener('click', handleClearHistory);

    // Live hash preview as user types
    dom.issueInput.addEventListener('input', () => updateHashPreview(dom.issueInput, dom.issueHashValue));
    dom.verifyInput.addEventListener('input', () => updateHashPreview(dom.verifyInput, dom.verifyHashValue));
}

// ── SHA-256 Hashing (Web Crypto API) ────────────────────────────────
async function sha256Hex(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function updateHashPreview(inputEl, displayEl) {
    const text = inputEl.value.trim();
    if (!text) {
        displayEl.textContent = '—';
        return;
    }
    const hash = await sha256Hex(text);
    displayEl.textContent = hash;
}

// ── Connect Wallet ──────────────────────────────────────────────────
async function handleConnect() {
    let address = dom.manualWalletInput.value.trim();

    // If manual address provided, use it
    if (address) {
        state.connected = true;
        state.walletAddress = address;
        state.demoMode = false;
        
        dom.walletValue.textContent = truncAddress(address);
        dom.walletValue.title = address;

        dom.connectBtn.innerHTML = `<span class="btn__dot btn__dot--connected"></span> Connected`;
        dom.modeBadge.textContent = 'Live (Testnet)';
        dom.modeBadge.classList.add('badge--live');
        
        showToast(`Connected manually: ${truncAddress(address)}`, 'success');
        return;
    }

    // Otherwise, try Freighter
    const freighter = window.freighterApi || window.freighter;

    if (!freighter) {
        showToast('Please enter an address or install Freighter. Continuing in Demo Mode.', 'warning');
        state.demoMode = true;
        return;
    }

    try {
        setButtonLoading(dom.connectBtn, true);
        await freighter.requestAccess();
        const res = await freighter.getAddress();
        address = res.address;

        state.connected = true;
        state.walletAddress = address;
        state.demoMode = false;

        dom.manualWalletInput.value = address;
        dom.walletValue.textContent = truncAddress(address);
        dom.walletValue.title = address;

        dom.connectBtn.innerHTML = `<span class="btn__dot btn__dot--connected"></span> Connected`;
        dom.modeBadge.textContent = 'Live (Testnet)';
        dom.modeBadge.classList.add('badge--live');

        showToast(`Connected: ${truncAddress(address)}`, 'success');
    } catch (err) {
        showToast(`Connection failed: ${err.message || err}`, 'error');
    } finally {
        setButtonLoading(dom.connectBtn, false);
    }
}

// ── Issue Certificate ───────────────────────────────────────────────
async function handleIssueCertificate(e) {
    e.preventDefault();
    clearResult(dom.issueResult);

    const rawData = dom.issueInput.value.trim();
    if (!rawData) {
        showResult(dom.issueResult, 'Please enter certificate data to hash.', 'error');
        return;
    }

    setButtonLoading(dom.issueBtn, true);
    const hash = await sha256Hex(rawData);

    if (state.demoMode) {
        await simulateDelay();

        // Check if already exists
        if (state.certificates[hash]) {
            showResult(dom.issueResult, `⚠️ This certificate already exists!\nHash: ${hash}`, 'error');
            showToast('Certificate already registered', 'warning');
            setButtonLoading(dom.issueBtn, false);
            return;
        }

        // Store
        state.certificates[hash] = {
            data: rawData.substring(0, 100), // store first 100 chars for display
            timestamp: Date.now(),
        };
        saveCertificates();
        updateCertCount();
        renderRecentList();

        showResult(dom.issueResult,
            `✅ Certificate issued!\nHash: ${hash}`,
            'success'
        );
        showToast('Certificate issued successfully (demo)', 'success');
        dom.issueInput.value = '';
        dom.issueHashValue.textContent = '—';
    } else {
        // Live mode: invoke Soroban contract
        try {
            showResult(dom.issueResult, '⏳ Submitting to Stellar testnet…', 'success');
            await invokeSoroban('add_certificate', { admin: state.walletAddress, hash });
            showResult(dom.issueResult, `✅ Certificate issued on-chain!\nHash: ${hash}`, 'success');
            showToast('Certificate issued on-chain!', 'success');
        } catch (err) {
            showResult(dom.issueResult, `❌ ${err.message || err}`, 'error');
            showToast('Issuance failed — see card for details', 'error');
        }
    }

    setButtonLoading(dom.issueBtn, false);
}

// ── Verify Certificate ──────────────────────────────────────────────
async function handleVerifyCertificate(e) {
    e.preventDefault();
    clearResult(dom.verifyResult);
    dom.verifyDisplay.classList.add('hidden');

    const rawData = dom.verifyInput.value.trim();
    if (!rawData) {
        showResult(dom.verifyResult, 'Please enter certificate data to verify.', 'error');
        return;
    }

    setButtonLoading(dom.verifyBtn, true);
    const hash = await sha256Hex(rawData);

    if (state.demoMode) {
        await simulateDelay();

        const exists = !!state.certificates[hash];
        showVerifyResult(exists, hash);

        if (exists) {
            showToast('Certificate is VALID ✅', 'success');
        } else {
            showToast('Certificate NOT FOUND ❌', 'error');
        }
    } else {
        // Live mode: invoke Soroban contract
        try {
            showResult(dom.verifyResult, '⏳ Querying Stellar testnet…', 'success');
            const result = await invokeSoroban('verify_certificate', { hash });
            showVerifyResult(result, hash);
        } catch (err) {
            showResult(dom.verifyResult, `❌ ${err.message || err}`, 'error');
            showToast('Verification failed', 'error');
        }
    }

    setButtonLoading(dom.verifyBtn, false);
}

function showVerifyResult(isValid, hash) {
    clearResult(dom.verifyResult);
    dom.verifyDisplay.classList.remove('hidden', 'verify-display--valid', 'verify-display--invalid');

    if (isValid) {
        dom.verifyDisplay.classList.add('verify-display--valid');
        dom.verifyDisplayIcon.textContent = '✅';
        dom.verifyDisplayText.textContent = 'Certificate is VALID and authentic!';
    } else {
        dom.verifyDisplay.classList.add('verify-display--invalid');
        dom.verifyDisplayIcon.textContent = '❌';
        dom.verifyDisplayText.textContent = 'Certificate NOT FOUND — may be fraudulent.';
    }
}

// ── Recent Certificates List ────────────────────────────────────────
function renderRecentList() {
    const entries = Object.entries(state.certificates)
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, 20);

    if (entries.length === 0) {
        dom.recentList.innerHTML = '<p class="recent-list__empty">No certificates issued yet. Use the Issue panel above.</p>';
        return;
    }

    dom.recentList.innerHTML = entries.map(([hash, info]) => {
        const time = new Date(info.timestamp).toLocaleString();
        return `
            <div class="recent-item">
                <div class="recent-item__badge">📜</div>
                <div class="recent-item__info">
                    <div class="recent-item__data">${escapeHtml(info.data)}</div>
                    <div class="recent-item__hash">${hash}</div>
                </div>
                <div class="recent-item__time">${time}</div>
            </div>
        `;
    }).join('');
}

function handleClearHistory() {
    state.certificates = {};
    saveCertificates();
    updateCertCount();
    renderRecentList();
    showToast('Certificate history cleared', 'info');
}

// ── Soroban Contract Invocation (placeholder) ───────────────────────
async function invokeSoroban(method, args) {
    // Placeholder for actual Soroban SDK integration.
    // In production, use @stellar/stellar-sdk + FreighterAPI to
    // build, sign, and submit transactions.
    throw new Error(
        `Live contract invocation requires Stellar SDK integration. ` +
        `Method: ${method}, Args: ${JSON.stringify(args)}`
    );
}

// ── Helpers ─────────────────────────────────────────────────────────
function saveCertificates() {
    localStorage.setItem('certverify_certs', JSON.stringify(state.certificates));
}

function updateCertCount() {
    const count = Object.keys(state.certificates).length;
    dom.certCount.textContent = `${count} issued`;
}

function truncAddress(addr) {
    if (!addr || addr.length < 12) return addr || '—';
    return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function simulateDelay(ms = 600) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function setButtonLoading(btn, loading) {
    if (loading) {
        btn.dataset.originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Processing…';
    } else {
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        btn.disabled = false;
    }
}

function showResult(el, message, type) {
    el.classList.remove('hidden', 'card__result--success', 'card__result--error');
    el.classList.add(type === 'success' ? 'card__result--success' : 'card__result--error');
    el.textContent = message;
}

function clearResult(el) {
    el.classList.add('hidden');
    el.textContent = '';
}

// ── Toast System ────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast--exiting');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}
