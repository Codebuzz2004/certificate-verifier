"use client";

import { useState, useEffect, useRef } from "react";
import * as freighterAPI from "@stellar/freighter-api";

// ── Helpers ─────────────────────────────────────────────────────────

async function sha256Hex(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function truncAddress(addr) {
  if (!addr || addr.length < 12) return addr || "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function simulateDelay(ms = 600) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function Home() {
  // ── State ───────────────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [demoMode, setDemoMode] = useState(true);
  const [certificates, setCertificates] = useState({});
  const [manualWalletInput, setManualWalletInput] = useState("");
  const [freighterDetected, setFreighterDetected] = useState(false);

  // Issue Form State
  const [issueInput, setIssueInput] = useState("");
  const [issueHashValue, setIssueHashValue] = useState("—");
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueResult, setIssueResult] = useState({ show: false, message: "", type: "" });

  // Verify Form State
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyHashValue, setVerifyHashValue] = useState("—");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState({ show: false, message: "", type: "" });
  const [verifyDisplay, setVerifyDisplay] = useState({ show: false, valid: false });

  const [toasts, setToasts] = useState([]);

  // ── Init ──────────────────────────────────────────────────────
  useEffect(() => {
    // Load local storage certs
    const loaded = JSON.parse(localStorage.getItem("certverify_certs") || "{}");
    setCertificates(loaded);

    // Auto-detect Freighter
    if (typeof window.freighterApi !== "undefined" || typeof window.freighter !== "undefined") {
      setFreighterDetected(true);
    }

    showToast("Welcome! Using Demo Mode — connect Freighter for testnet interaction.", "info");
  }, []);

  // Sync hashes
  useEffect(() => {
    const updateHash = async () => {
      if (issueInput.trim()) {
        const h = await sha256Hex(issueInput.trim());
        setIssueHashValue(h);
      } else {
        setIssueHashValue("—");
      }
    };
    updateHash();
  }, [issueInput]);

  useEffect(() => {
    const updateHash = async () => {
      if (verifyInput.trim()) {
        const h = await sha256Hex(verifyInput.trim());
        setVerifyHashValue(h);
      } else {
        setVerifyHashValue("—");
      }
    };
    updateHash();
  }, [verifyInput]);

  // ── Save Certs to local storage
  const saveCertificates = (certs) => {
    setCertificates(certs);
    localStorage.setItem("certverify_certs", JSON.stringify(certs));
  };


  // ── Action Handlers ──────────────────────────────────────────────────

  const handleConnect = async () => {
    let address = manualWalletInput.trim();

    // If manual address provided, use it
    if (address) {
      setConnected(true);
      setWalletAddress(address);
      setDemoMode(false);
      showToast(`Connected manually: ${truncAddress(address)}`, "success");
      return;
    }

    // Otherwise, try Freighter
    const freighter = window.freighterApi || window.freighter;

    if (!freighter) {
      showToast("Please enter an address or install Freighter. Continuing in Demo Mode.", "warning");
      setDemoMode(true);
      return;
    }

    try {
      await freighter.requestAccess();
      const res = await freighter.getAddress();
      address = res.address;

      setConnected(true);
      setWalletAddress(address);
      setDemoMode(false);
      setManualWalletInput(address);

      showToast(`Connected: ${truncAddress(address)}`, "success");
    } catch (err) {
      showToast(`Connection failed: ${err.message || err}`, "error");
    }
  };

  const handleIssueCertificate = async (e) => {
    e.preventDefault();
    setIssueResult({ show: false, message: "", type: "" });

    const rawData = issueInput.trim();
    if (!rawData) {
      setIssueResult({ show: true, message: "Please enter certificate data to hash.", type: "error" });
      return;
    }

    setIssueLoading(true);
    const hash = await sha256Hex(rawData);

    if (demoMode) {
      await simulateDelay();

      // Check if already exists
      if (certificates[hash]) {
        setIssueResult({ show: true, message: `⚠️ This certificate already exists!\nHash: ${hash}`, type: "error" });
        showToast("Certificate already registered", "warning");
        setIssueLoading(false);
        return;
      }

      // Store
      const newCerts = { ...certificates };
      newCerts[hash] = {
        data: rawData.substring(0, 100), // store first 100 chars for display
        timestamp: Date.now(),
      };
      saveCertificates(newCerts);

      setIssueResult({ show: true, message: `✅ Certificate issued!\nHash: ${hash}`, type: "success" });
      showToast("Certificate issued successfully (demo)", "success");
      setIssueInput("");
      setIssueHashValue("—");
    } else {
      // Live mode: invoke Soroban contract
      try {
        setIssueResult({ show: true, message: "⏳ Submitting to Stellar testnet…", type: "success" });
        await invokeSoroban("add_certificate", { admin: walletAddress, hash });
        setIssueResult({ show: true, message: `✅ Certificate issued on-chain!\nHash: ${hash}`, type: "success" });
        showToast("Certificate issued on-chain!", "success");
        setIssueInput("");
      } catch (err) {
        setIssueResult({ show: true, message: `❌ ${err.message || err}`, type: "error" });
        showToast("Issuance failed — see card for details", "error");
      }
    }

    setIssueLoading(false);
  };

  const handleVerifyCertificate = async (e) => {
    e.preventDefault();
    setVerifyResult({ show: false, message: "", type: "" });
    setVerifyDisplay({ show: false, valid: false });

    const rawData = verifyInput.trim();
    if (!rawData) {
      setVerifyResult({ show: true, message: "Please enter certificate data to verify.", type: "error" });
      return;
    }

    setVerifyLoading(true);
    const hash = await sha256Hex(rawData);

    if (demoMode) {
      await simulateDelay();

      const exists = !!certificates[hash];
      showVerifyResultLocal(exists);

      if (exists) {
        showToast("Certificate is VALID ✅", "success");
      } else {
        showToast("Certificate NOT FOUND ❌", "error");
      }
    } else {
      // Live mode: invoke Soroban contract
      try {
        setVerifyResult({ show: true, message: "⏳ Querying Stellar testnet…", type: "success" });
        const result = await invokeSoroban("verify_certificate", { hash });
        showVerifyResultLocal(result);
      } catch (err) {
        setVerifyResult({ show: true, message: `❌ ${err.message || err}`, type: "error" });
        showToast("Verification failed", "error");
      }
    }

    setVerifyLoading(false);
  };

  const showVerifyResultLocal = (isValid) => {
    setVerifyResult({ show: false, message: "", type: "" });
    setVerifyDisplay({ show: true, valid: isValid });
  };

  const handleClearHistory = () => {
    saveCertificates({});
    showToast("Certificate history cleared", "info");
  };

  // ── Live Soroban Contract Invocation (placeholder) ───────────────────────
  const invokeSoroban = async (method, args) => {
    // Placeholder for actual Soroban SDK integration.
    throw new Error(
      `Live contract invocation requires Stellar SDK configuration. Method: ${method}, Args: ${JSON.stringify(args)}`
    );
  };

  // ── Toast System ────────────────────────────────────────────────────
  const showToast = (message, type = "info", duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [{ id, message, type }, ...prev]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  };


  // ── Render Helpers ───────────────────────────────────────────────────

  const recentList = Object.entries(certificates)
    .sort((a, b) => b[1].timestamp - a[1].timestamp)
    .slice(0, 20);

  return (
    <>
      {/* ─── Navbar ─── */}
      <nav className="navbar" id="navbar">
        <div className="navbar__brand">
          <span className="navbar__icon">🎓</span>
          <span className="navbar__title">CertVerify</span>
        </div>
        <div className="navbar__actions">
          {!connected ? (
             <span className={`badge ${freighterDetected ? "badge--live" : ""}`}>
               {freighterDetected ? "Freighter Detected" : "Demo Mode"}
             </span>
          ) : (
             <span className="badge badge--live">Live (Testnet)</span>
          )}
          
          <div className="wallet-input-group">
            <input
              type="text"
              className="form__input form__input--small"
              placeholder="Enter Freighter Address..."
              value={manualWalletInput}
              onChange={(e) => setManualWalletInput(e.target.value)}
            />
            <button className="btn btn--outline" onClick={handleConnect}>
              <span className={`btn__dot ${connected ? "btn__dot--connected" : ""}`}></span>
              {connected ? "Connected" : "Connect Wallet"}
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <header className="hero">
        <div className="hero__content">
          <h1 className="hero__title">
            <span className="hero__title-line">Blockchain</span>
            <span className="hero__title-line hero__title-line--gradient">Certificate Verifier</span>
          </h1>
          <p className="hero__subtitle">
            Issue tamper-proof certificates on the Stellar blockchain. Verify authenticity instantly.
            Powered by Soroban smart contracts.
          </p>
        </div>
      </header>

      {/* ─── Status Bar ─── */}
      <section className="status-bar" id="statusBar">
        <div className="status-bar__item">
          <span className="status-bar__label">Network</span>
          <span className="status-bar__value">Testnet</span>
        </div>
        <div className="status-bar__divider"></div>
        <div className="status-bar__item">
          <span className="status-bar__label">Wallet</span>
          <span className="status-bar__value" title={walletAddress}>
            {connected ? truncAddress(walletAddress) : "Not connected"}
          </span>
        </div>
        <div className="status-bar__divider"></div>
        <div className="status-bar__item">
          <span className="status-bar__label">Certificates</span>
          <span className="status-bar__value">{Object.keys(certificates).length} issued</span>
        </div>
      </section>

      {/* ─── Main Cards ─── */}
      <main className="cards">
        {/* Issue Certificate Card */}
        <section className="card card--issue">
          <div className="card__header">
            <div className="card__icon-wrap card__icon-wrap--issue">📜</div>
            <div>
              <h2 className="card__title">Issue Certificate</h2>
              <p className="card__desc">Admin: register a new certificate on-chain</p>
            </div>
          </div>
          <form className="form" onSubmit={handleIssueCertificate}>
            <div className="form__group">
              <label className="form__label" htmlFor="issueInput">
                Certificate Data
              </label>
              <textarea
                className="form__input form__textarea"
                id="issueInput"
                placeholder="Enter certificate text, ID, or any data to hash…"
                rows="3"
                value={issueInput}
                onChange={(e) => setIssueInput(e.target.value)}
              ></textarea>
            </div>
            <div className="hash-preview">
              <span className="hash-preview__label">SHA-256 Hash</span>
              <span className="hash-preview__value mono">{issueHashValue}</span>
            </div>
            <button className="btn btn--primary btn--full" type="submit" disabled={issueLoading}>
              {issueLoading ? (
                <><span className="spinner"></span> Processing…</>
              ) : (
                <><span className="btn__icon">📝</span> Issue Certificate</>
              )}
            </button>
          </form>
          
          {issueResult.show && (
            <div className={`card__result ${issueResult.type === "success" ? "card__result--success" : "card__result--error"}`}>
              {issueResult.message}
            </div>
          )}
        </section>

        {/* Verify Certificate Card */}
        <section className="card card--verify">
          <div className="card__header">
            <div className="card__icon-wrap card__icon-wrap--verify">🔍</div>
            <div>
              <h2 className="card__title">Verify Certificate</h2>
              <p className="card__desc">Check if a certificate is authentic</p>
            </div>
          </div>
          <form className="form" onSubmit={handleVerifyCertificate}>
            <div className="form__group">
              <label className="form__label" htmlFor="verifyInput">
                Certificate Data
              </label>
              <textarea
                className="form__input form__textarea"
                id="verifyInput"
                placeholder="Enter the original certificate data to verify…"
                rows="3"
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
              ></textarea>
            </div>
            <div className="hash-preview">
              <span className="hash-preview__label">SHA-256 Hash</span>
              <span className="hash-preview__value mono">{verifyHashValue}</span>
            </div>
            <button className="btn btn--success btn--full" type="submit" disabled={verifyLoading}>
              {verifyLoading ? (
                 <><span className="spinner"></span> Processing…</>
              ) : (
                 <><span className="btn__icon">✅</span> Verify Certificate</>
              )}
            </button>
          </form>

          {verifyResult.show && (
            <div className={`card__result ${verifyResult.type === "success" ? "card__result--success" : "card__result--error"}`}>
               {verifyResult.message}
            </div>
          )}

          {/* Verification Result Display */}
          {verifyDisplay.show && (
            <div className={`verify-display ${verifyDisplay.valid ? "verify-display--valid" : "verify-display--invalid"}`}>
              <div className="verify-display__icon">{verifyDisplay.valid ? "✅" : "❌"}</div>
              <div className="verify-display__text">
                {verifyDisplay.valid ? "Certificate is VALID and authentic!" : "Certificate NOT FOUND — may be fraudulent."}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ─── Recent Certificates ─── */}
      <section className="recent-section">
        <div className="recent-section__header">
          <h2 className="recent-section__title">📋 Recently Issued Certificates</h2>
          <button className="btn btn--outline btn--small" onClick={handleClearHistory}>
            Clear History
          </button>
        </div>
        <div className="recent-list">
          {recentList.length === 0 ? (
            <p className="recent-list__empty">No certificates issued yet. Use the Issue panel above.</p>
          ) : (
            recentList.map(([hash, info]) => (
              <div className="recent-item" key={hash}>
                <div className="recent-item__badge">📜</div>
                <div className="recent-item__info">
                  <div className="recent-item__data">{info.data}</div>
                  <div className="recent-item__hash">{hash}</div>
                </div>
                <div className="recent-item__time">{new Date(info.timestamp).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ─── Toasts ─── */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>

      {/* ─── Footer ─── */}
      <footer className="footer">
        <p>Built with ❤️ on <strong>Stellar Soroban</strong> · Certificate Verifier Smart Contract</p>
      </footer>
    </>
  );
}
