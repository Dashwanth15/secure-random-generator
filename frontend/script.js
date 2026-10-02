// =============================================================================
// script.js — Interactive Cryptography Workbench Controller
// =============================================================================
// Features:
//   1. 2-Column Side-by-Side Workbench Architecture (Left Studio / Right Sandbox)
//   2. 3-Stage Progress Guide (Select -> Generate -> Live Verify)
//   3. 4 Dedicated Interactive Demonstrations (Keys, Nonces, Sessions, Tokens)
//   4. PRNG vs CSPRNG comparison & Seed Predictability experiment
// =============================================================================

'use strict';

const API_BASE = (window.location.port === '5000') ? '' : 'http://127.0.0.1:5000';

const TYPE_CONFIGS = {
  key: {
    title: 'Cryptographic Key',
    icon: '🔑',
    purposeHeading: 'Cryptographic Key',
    purposeSummary: 'Protects information through authenticated encryption.',
    purposeDesc: 'Cryptographic keys must be unpredictable. This project uses Python\'s secrets module to generate secure random key material backed by OS entropy.',
    recommendation: 'Recommended: 32 bytes / 256 bits for AES-256 symmetric encryption',
    sandboxTitle: 'Key Encryption & Decryption Sandbox',
    sandboxBadge: 'Key Lifecycle',
    defaultLength: 32,
    lengths: [
      { bytes: 16, bits: 128, label: '16 bytes — 128 bits' },
      { bytes: 24, bits: 192, label: '24 bytes — 192 bits' },
      { bytes: 32, bits: 256, label: '32 bytes — 256 bits (Recommended)' }
    ]
  },
  nonce: {
    title: 'Nonce',
    icon: '🔄',
    purposeHeading: 'Nonce (Number Used Once)',
    purposeSummary: 'Provides uniqueness and freshness in cryptographic operations.',
    purposeDesc: 'Nonce size depends on the cryptographic protocol (12 bytes is standard for AES-GCM). Prevents duplicate operations and replay attacks.',
    recommendation: 'Standard: 12 bytes / 96 bits for AES-GCM and ChaCha20-Poly1305',
    sandboxTitle: 'Nonce Freshness & Anti-Replay Sandbox',
    sandboxBadge: 'Anti-Replay Nonce',
    defaultLength: 12,
    lengths: [
      { bytes: 8, bits: 64, label: '8 bytes — 64 bits' },
      { bytes: 12, bits: 96, label: '12 bytes — 96 bits (Standard AES-GCM)' },
      { bytes: 16, bits: 128, label: '16 bytes — 128 bits' }
    ]
  },
  session: {
    title: 'Session Identifier',
    icon: '👤',
    purposeHeading: 'Session Identifier',
    purposeSummary: 'Associates user requests with authenticated server sessions.',
    purposeDesc: 'Session identifiers must be impossible to guess so attackers cannot hijack active user sessions without credentials.',
    recommendation: 'Standard: 32 bytes / 256 bits (prevents brute-force session guessing)',
    sandboxTitle: 'Session Authentication & Hijack Defense Sandbox',
    sandboxBadge: 'Session Auth',
    defaultLength: 32,
    lengths: [
      { bytes: 16, bits: 128, label: '16 bytes — 128 bits' },
      { bytes: 32, bits: 256, label: '32 bytes — 256 bits (Standard)' },
      { bytes: 64, bits: 512, label: '64 bytes — 512 bits' }
    ]
  },
  token: {
    title: 'Security Token',
    icon: '🛡️',
    purposeHeading: 'Security Token',
    purposeSummary: 'Unpredictable bearer token for CSRF, APIs, and password resets.',
    purposeDesc: 'Security tokens require high entropy and constant-time validation (secrets.compare_digest) to prevent timing side-channel attacks.',
    recommendation: 'Standard: 32 bytes / 256 bits (constant-time verification required)',
    sandboxTitle: 'Security Token Constant-Time Verification Sandbox',
    sandboxBadge: 'Token Verify',
    defaultLength: 32,
    lengths: [
      { bytes: 16, bits: 128, label: '16 bytes — 128 bits' },
      { bytes: 32, bits: 256, label: '32 bytes — 256 bits (Standard)' },
      { bytes: 64, bits: 512, label: '64 bytes — 512 bits' }
    ]
  }
};

let currentType = 'key';
let currentBytes = 32;
let lastGeneratedData = null;

// DOM Helper
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// 1. SERVER HEALTH CHECK
// ---------------------------------------------------------------------------
async function checkServerHealth() {
  const banner = $('server-banner');
  if (!banner) return;
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (res.ok) {
      banner.textContent = '✓ Flask server active — All cryptographic endpoints online';
      banner.className = 'server-banner online';
      setTimeout(() => { banner.style.display = 'none'; }, 3000);
    } else {
      throw new Error('Server non-200');
    }
  } catch {
    banner.textContent = '⚠ Flask server offline — Run "python app.py" in backend/ directory';
    banner.className = 'server-banner offline';
  }
}

// ---------------------------------------------------------------------------
// 2. 3-STAGE PROGRESS GUIDE
// ---------------------------------------------------------------------------
function updateGuideStage(stageNum) {
  for (let i = 1; i <= 3; i++) {
    const stepEl = $(`gstep-${i}`);
    if (stepEl) {
      stepEl.classList.toggle('active', i <= stageNum);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. PRIMITIVE TABS SELECTION CONTROLLER
// ---------------------------------------------------------------------------
function initPrimitiveTabs() {
  const tabs = document.querySelectorAll('.prim-tab');
  const infoIcon = $('prim-info-icon');
  const infoHeading = $('prim-info-heading');
  const infoPurpose = $('prim-info-purpose');
  const infoDesc = $('prim-info-desc');

  const sandboxTitle = $('sandbox-header-title');
  const sandboxBadge = $('sandbox-mode-badge');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const typeKey = tab.getAttribute('data-type');
      if (!typeKey || !TYPE_CONFIGS[typeKey]) return;

      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-checked', 'false');
      });

      tab.classList.add('active');
      tab.setAttribute('aria-checked', 'true');

      currentType = typeKey;
      const conf = TYPE_CONFIGS[typeKey];

      // Update Left Studio Info Card
      if (infoIcon) infoIcon.textContent = conf.icon;
      if (infoHeading) infoHeading.textContent = conf.purposeHeading;
      if (infoPurpose) infoPurpose.textContent = conf.purposeSummary;
      if (infoDesc) infoDesc.innerHTML = conf.purposeDesc;

      // Update Right Sandbox Header
      if (sandboxTitle) sandboxTitle.textContent = conf.sandboxTitle;
      if (sandboxBadge) sandboxBadge.textContent = conf.sandboxBadge;

      // Update Length Options
      populateByteLengthOptions(typeKey);

      // Switch Sandbox View
      switchSandboxView(typeKey);

      // Hide previous result box on type change
      const resBox = $('generated-result-box');
      if (resBox) resBox.style.display = 'none';

      updateGuideStage(1);
    });
  });
}

// ---------------------------------------------------------------------------
// 4. BYTE LENGTH OPTIONS & LIVE CALCULATION
// ---------------------------------------------------------------------------
function populateByteLengthOptions(typeKey) {
  const select = $('byte-length-select');
  const recEl = $('config-recommendation');
  if (!select) return;

  const conf = TYPE_CONFIGS[typeKey];
  select.innerHTML = '';

  conf.lengths.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.bytes;
    opt.textContent = item.label;
    if (item.bytes === conf.defaultLength) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  currentBytes = conf.defaultLength;
  updateLiveCalculations(currentBytes);

  if (recEl) recEl.textContent = conf.recommendation;

  select.onchange = () => {
    currentBytes = parseInt(select.value, 10);
    updateLiveCalculations(currentBytes);
  };
}

function updateLiveCalculations(bytes) {
  const calcBytes = $('calc-bytes');
  const calcBits  = $('calc-bits');
  const calcHex   = $('calc-hex');

  const bits = bytes * 8;
  const hexChars = bytes * 2;

  if (calcBytes) calcBytes.textContent = bytes;
  if (calcBits) calcBits.textContent = bits;
  if (calcHex) calcHex.textContent = hexChars;
}

// ---------------------------------------------------------------------------
// 5. CSPRNG VALUE GENERATOR CONTROLLER
// ---------------------------------------------------------------------------
function initGenerator() {
  const btnGenerate = $('btn-generate-value');
  const resBox = $('generated-result-box');
  const valDisplay = $('generated-value-display');
  const btnCopy = $('btn-copy-val');

  const resBadgeBits = $('res-badge-bits');
  const statBits = $('stat-bits');
  const statBytes = $('stat-bytes');
  const statHex = $('stat-hex');

  if (!btnGenerate) return;

  btnGenerate.addEventListener('click', async () => {
    btnGenerate.classList.add('loading');

    try {
      const res = await fetch(`${API_BASE}/api/generate-value`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: currentType, length: currentBytes })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed.');

      lastGeneratedData = data;

      // Populate Result Box
      if (valDisplay) valDisplay.textContent = data.value;
      if (resBadgeBits) resBadgeBits.textContent = `${data.bits} BITS`;
      if (statBits) statBits.textContent = data.bits;
      if (statBytes) statBytes.textContent = data.bytes;
      if (statHex) statHex.textContent = data.hex_chars;

      if (resBox) {
        resBox.style.display = 'block';
      }

      // Propagate into Right Sandbox panel
      propagateToSandbox(data);

      updateGuideStage(2);

    } catch (err) {
      alert(`Generation error: ${err.message}`);
    } finally {
      btnGenerate.classList.remove('loading');
    }
  });

  // 1-Click Copy
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      if (!lastGeneratedData || !lastGeneratedData.value) return;
      try {
        await navigator.clipboard.writeText(lastGeneratedData.value);
        btnCopy.textContent = '✓ Copied';
        setTimeout(() => { btnCopy.textContent = '⎘ Copy'; }, 2000);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = lastGeneratedData.value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btnCopy.textContent = '✓ Copied';
        setTimeout(() => { btnCopy.textContent = '⎘ Copy'; }, 2000);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 6. SANDBOX SWITCHER & VALUE PROPAGATION
// ---------------------------------------------------------------------------
function switchSandboxView(typeKey) {
  const demoKey = $('demo-key-container');
  const demoNonce = $('demo-nonce-container');
  const demoSession = $('demo-session-container');
  const demoToken = $('demo-token-container');

  if (demoKey) demoKey.style.display = typeKey === 'key' ? 'block' : 'none';
  if (demoNonce) demoNonce.style.display = typeKey === 'nonce' ? 'block' : 'none';
  if (demoSession) demoSession.style.display = typeKey === 'session' ? 'block' : 'none';
  if (demoToken) demoToken.style.display = typeKey === 'token' ? 'block' : 'none';
}

let currentGeneratedKey = '';
let currentCiphertext = '';

function propagateToSandbox(data) {
  if (data.type === 'key') {
    currentGeneratedKey = data.value;
    const refKeyEl = $('key-active-ref-val');
    if (refKeyEl) refKeyEl.textContent = data.value;

    const cipherPanel = $('key-cipher-panel');
    if (cipherPanel) cipherPanel.style.display = 'none';
    const sBox = $('key-verify-success');
    if (sBox) sBox.style.display = 'none';
    const fBox = $('key-verify-failure');
    if (fBox) fBox.style.display = 'none';
    const keyInput = $('key-attempt-input');
    if (keyInput) keyInput.value = '';
    currentCiphertext = '';
  } else if (data.type === 'nonce') {
    const nonceAttached = $('nonce-attached-val');
    if (nonceAttached) nonceAttached.textContent = data.value;
    const nonceBox = $('nonce-result-box');
    if (nonceBox) nonceBox.style.display = 'none';
  } else if (data.type === 'session') {
    const sessVal = $('session-active-val');
    if (sessVal) sessVal.textContent = data.value;
    const sessBox = $('session-result-box');
    if (sessBox) sessBox.style.display = 'none';
  } else if (data.type === 'token') {
    const tokenExp = $('token-expected-val');
    const tokenInput = $('token-input-field');
    if (tokenExp) tokenExp.textContent = data.value;
    if (tokenInput) tokenInput.value = data.value;
    const tokenBox = $('token-result-box');
    if (tokenBox) tokenBox.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// 7. DEMO 1: KEY LIFECYCLE (ENCRYPT & AUTHENTICATED DECRYPT)
// ---------------------------------------------------------------------------
function initKeyDemo() {
  const btnEncrypt = $('btn-key-encrypt');
  const msgInput = $('key-demo-message');
  const cipherPanel = $('key-cipher-panel');
  const cipherValDisplay = $('key-ciphertext-val');
  const keyActiveRef = $('key-active-ref-val');

  const keyAttemptInput = $('key-attempt-input');
  const btnPaste = $('btn-paste-key-input');
  const btnChipCorrect = $('btn-chip-correct-key');
  const btnChipWrong = $('btn-chip-wrong-key');
  const btnChipCorrupt = $('btn-chip-corrupt-key');
  const btnVerify = $('btn-key-verify');

  const successBox = $('key-verify-success');
  const failureBox = $('key-verify-failure');
  const recoveredText = $('key-recovered-text');
  const failureExpl = $('key-failure-explanation');

  if (!btnEncrypt) return;

  // 1. Encrypt Message with Key
  btnEncrypt.addEventListener('click', async () => {
    const msg = msgInput.value.trim();
    if (!msg) {
      alert('Please enter a secret message to encrypt.');
      return;
    }

    // Ensure we have a generated key
    if (!currentGeneratedKey) {
      $('btn-generate-value').click();
      await new Promise(r => setTimeout(r, 400));
    }

    try {
      const res = await fetch(`${API_BASE}/api/encrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, key: currentGeneratedKey })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Encryption failed.');

      currentCiphertext = data.ciphertext;
      if (cipherValDisplay) cipherValDisplay.textContent = data.ciphertext;
      if (keyActiveRef) keyActiveRef.textContent = currentGeneratedKey;
      if (cipherPanel) cipherPanel.style.display = 'block';

      if (successBox) successBox.style.display = 'none';
      if (failureBox) failureBox.style.display = 'none';
      if (keyAttemptInput) keyAttemptInput.value = '';

      updateGuideStage(3);

    } catch (err) {
      alert(`Encryption error: ${err.message}`);
    }
  });

  // 2. Paste & Quick Test Shortcuts
  if (btnPaste) {
    btnPaste.addEventListener('click', async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (txt) {
          keyAttemptInput.value = txt.trim();
          triggerKeyInputFlash();
        }
      } catch {
        keyAttemptInput.focus();
      }
    });
  }

  function triggerKeyInputFlash() {
    keyAttemptInput.classList.remove('input-flash');
    void keyAttemptInput.offsetWidth; // trigger reflow
    keyAttemptInput.classList.add('input-flash');
  }

  // Exact single source of truth: populates the EXACT same hex key
  if (btnChipCorrect) {
    btnChipCorrect.addEventListener('click', () => {
      if (!currentGeneratedKey && lastGeneratedData) {
        currentGeneratedKey = lastGeneratedData.value;
      }
      if (currentGeneratedKey) {
        keyAttemptInput.value = currentGeneratedKey;
        triggerKeyInputFlash();
        if (successBox) successBox.style.display = 'none';
        if (failureBox) failureBox.style.display = 'none';
      } else {
        alert('Please generate a secure key first.');
      }
    });
  }

  // Mismatched test key (different 64-hex characters)
  if (btnChipWrong) {
    btnChipWrong.addEventListener('click', () => {
      keyAttemptInput.value = 'e8b19a0f447c2d5e6108b3f2a99c1482701e85bf9234cad6197263b8045e12f0';
      triggerKeyInputFlash();
      if (successBox) successBox.style.display = 'none';
      if (failureBox) failureBox.style.display = 'none';
    });
  }

  // Tampered ciphertext test (keeps valid key, corrupts ciphertext)
  if (btnChipCorrupt) {
    btnChipCorrupt.addEventListener('click', () => {
      if (currentGeneratedKey) {
        keyAttemptInput.value = currentGeneratedKey;
        triggerKeyInputFlash();
      }
      if (currentCiphertext && currentCiphertext.length > 10) {
        // Tamper with ciphertext by altering characters in the middle
        const mid = Math.floor(currentCiphertext.length / 2);
        const alteredChar = currentCiphertext[mid] === 'A' ? 'B' : 'A';
        currentCiphertext = currentCiphertext.substring(0, mid) + alteredChar + currentCiphertext.substring(mid + 1);
        if (cipherValDisplay) cipherValDisplay.textContent = currentCiphertext;
      }
      if (successBox) successBox.style.display = 'none';
      if (failureBox) failureBox.style.display = 'none';
    });
  }

  // 3. Authenticated Decryption & Verification
  btnVerify.addEventListener('click', async () => {
    const enteredKey = keyAttemptInput.value.trim();
    if (!enteredKey) {
      alert('Please enter or paste a key to attempt decryption.');
      return;
    }

    if (!currentCiphertext) {
      alert('Please encrypt a message first.');
      return;
    }

    btnVerify.classList.add('loading');

    try {
      const res = await fetch(`${API_BASE}/api/verify-decrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: enteredKey, ciphertext: currentCiphertext })
      });

      const data = await res.json();

      if (data.success === true) {
        if (recoveredText) recoveredText.textContent = `"${data.message}"`;
        if (successBox) successBox.style.display = 'block';
        if (failureBox) failureBox.style.display = 'none';
        updateGuideStage(3);
      } else {
        if (failureExpl) failureExpl.textContent = data.explanation || 'HMAC authentication check failed. Ciphertext remains protected.';
        if (failureBox) failureBox.style.display = 'block';
        if (successBox) successBox.style.display = 'none';
      }

    } catch (err) {
      alert(`Decryption error: ${err.message}`);
    } finally {
      btnVerify.classList.remove('loading');
    }
  });
}

// ---------------------------------------------------------------------------
// 8. DEMO 2: NONCE CONTROLLER (ANTI-REPLAY)
// ---------------------------------------------------------------------------
function initNonceDemo() {
  const btnSendFresh = $('btn-nonce-send-fresh');
  const btnSendReplay = $('btn-nonce-send-replay');
  const btnReset = $('btn-nonce-reset');

  const resBox = $('nonce-result-box');
  const resIcon = $('nonce-res-icon');
  const resTitle = $('nonce-res-title');
  const resMsg = $('nonce-res-message');
  const resHttp = $('nonce-res-http');
  const resFresh = $('nonce-res-fresh');

  async function testNonce(nonceVal) {
    if (!nonceVal || nonceVal === '—') {
      alert('Please click "Generate Secure Value" in the Generator Studio on the left first.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/nonce/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce: nonceVal, action: 'send' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');

      resBox.style.display = 'block';
      resTitle.textContent = data.title;
      resMsg.textContent = data.message;
      resHttp.textContent = data.http_status;
      resFresh.textContent = data.fresh ? 'FRESH (ACCEPTED)' : 'REUSED (REJECTED)';

      if (data.fresh) {
        resBox.className = 'verify-alert verify-alert-success';
        resIcon.textContent = '✓';
        updateGuideStage(3);
      } else {
        resBox.className = 'verify-alert verify-alert-danger';
        resIcon.textContent = '⚠';
      }

    } catch (err) {
      alert(`Nonce error: ${err.message}`);
    }
  }

  if (btnSendFresh) {
    btnSendFresh.addEventListener('click', () => {
      const nonceVal = $('nonce-attached-val').textContent.trim();
      testNonce(nonceVal);
    });
  }

  if (btnSendReplay) {
    btnSendReplay.addEventListener('click', () => {
      const nonceVal = $('nonce-attached-val').textContent.trim();
      testNonce(nonceVal);
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      try {
        await fetch(`${API_BASE}/api/nonce/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset' })
        });
        if (resBox) resBox.style.display = 'none';
        alert('Server nonce cache reset.');
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 9. DEMO 3: SESSION IDENTIFIER CONTROLLER
// ---------------------------------------------------------------------------
function initSessionDemo() {
  const btnValid = $('btn-session-send-valid');
  const btnInvalid = $('btn-session-send-invalid');

  const resBox = $('session-result-box');
  const resIcon = $('session-res-icon');
  const resTitle = $('session-res-title');
  const resMsg = $('session-res-message');
  const resHttp = $('session-res-http');
  const resAccess = $('session-res-access');

  async function testSession(sessionVal) {
    if (!sessionVal || sessionVal === '—') {
      alert('Please generate a Session Identifier on the left first.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/session/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionVal, endpoint: 'GET /profile' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Validation failed.');

      resBox.style.display = 'block';
      resTitle.textContent = data.title;
      resMsg.textContent = data.message;
      resHttp.textContent = data.http_status;
      resAccess.textContent = data.valid ? 'GRANTED (200 OK)' : 'DENIED (401 UNAUTHORIZED)';

      if (data.valid) {
        resBox.className = 'verify-alert verify-alert-success';
        resIcon.textContent = '✓';
        updateGuideStage(3);
      } else {
        resBox.className = 'verify-alert verify-alert-danger';
        resIcon.textContent = '❌';
      }

    } catch (err) {
      alert(`Session error: ${err.message}`);
    }
  }

  if (btnValid) {
    btnValid.addEventListener('click', () => {
      const sessVal = $('session-active-val').textContent.trim();
      testSession(sessVal);
    });
  }

  if (btnInvalid) {
    btnInvalid.addEventListener('click', () => {
      const guessedSession = '9f8e7d6c5b4a39281726354859607182';
      testSession(guessedSession);
    });
  }
}

// ---------------------------------------------------------------------------
// 10. DEMO 4: SECURITY TOKEN CONTROLLER (CONSTANT-TIME)
// ---------------------------------------------------------------------------
function initTokenDemo() {
  const btnVerify = $('btn-token-verify');
  const btnReset = $('btn-token-reset-valid');
  const btnCorrupt = $('btn-token-corrupt-char');

  const expValEl = $('token-expected-val');
  const inputEl = $('token-input-field');

  const resBox = $('token-result-box');
  const resIcon = $('token-res-icon');
  const resTitle = $('token-res-title');
  const resMsg = $('token-res-message');
  const resDecision = $('token-res-decision');

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const expected = expValEl.textContent.trim();
      inputEl.value = expected !== '—' ? expected : '';
    });
  }

  if (btnCorrupt) {
    btnCorrupt.addEventListener('click', () => {
      let val = inputEl.value.trim();
      if (val.length > 0) {
        const lastChar = val[val.length - 1];
        const newChar = lastChar === 'a' ? 'b' : 'a';
        inputEl.value = val.slice(0, -1) + newChar;
      } else {
        inputEl.value = 'corrupted_token_test';
      }
    });
  }

  if (btnVerify) {
    btnVerify.addEventListener('click', async () => {
      const expected = expValEl.textContent.trim();
      const inputVal = inputEl.value.trim();

      if (!expected || expected === '—') {
        alert('Please generate a Security Token on the left first.');
        return;
      }
      if (!inputVal) {
        alert('Please enter an input token to verify.');
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/token/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expected_token: expected, input_token: inputVal })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Token verification failed.');

        resBox.style.display = 'block';
        resTitle.textContent = data.title;
        resMsg.textContent = data.message;
        resDecision.textContent = data.valid ? 'AUTHORIZED (200 OK)' : 'FORBIDDEN (403 MISMATCH)';

        if (data.valid) {
          resBox.className = 'verify-alert verify-alert-success';
          resIcon.textContent = '✓';
          updateGuideStage(3);
        } else {
          resBox.className = 'verify-alert verify-alert-danger';
          resIcon.textContent = '❌';
        }

      } catch (err) {
        alert(`Token error: ${err.message}`);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 11. PRNG vs CSPRNG COMPARISON CONTROLLER
// ---------------------------------------------------------------------------
async function loadComparison() {
  const btn = $('refresh-compare-btn');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/compare`);
    const data = await res.json();
    renderComparison(data);
  } catch (err) {
    console.error('Comparison load error', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderComparison(data) {
  const prng = data.prng;
  const csprng = data.csprng;

  renderSeq('prng-run1', prng.run1);
  renderSeq('prng-run2', prng.run2);

  const cs1 = $('csprng-run1');
  const cs2 = $('csprng-run2');
  if (cs1) cs1.textContent = csprng.run1;
  if (cs2) cs2.textContent = csprng.run2;

  const sameBadge = $('prng-same-badge');
  if (sameBadge) {
    sameBadge.textContent = prng.identical
      ? '✓ IDENTICAL RUNS — Same Seed Produces Identical Sequence'
      : '✗ Different';
    sameBadge.className = `same-badge ${prng.identical ? 'bad' : 'good'}`;
  }

  const diffBadge = $('csprng-diff-badge');
  if (diffBadge) {
    diffBadge.textContent = csprng.identical
      ? '⚠ Coincidence'
      : '✓ INDEPENDENT RUNS — Computationally Unpredictable';
    diffBadge.className = 'same-badge good';
  }
}

function renderSeq(containerId, numbers) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';

  numbers.forEach((n, i) => {
    const span = document.createElement('span');
    span.className = 'seq-num prng';
    span.textContent = n;
    container.appendChild(span);

    if (i < numbers.length - 1) {
      const arr = document.createElement('span');
      arr.className = 'seq-arrow';
      arr.textContent = '→';
      container.appendChild(arr);
    }
  });
}

// ---------------------------------------------------------------------------
// 12. PREDICTABILITY DEMONSTRATION CONTROLLER
// ---------------------------------------------------------------------------
let currentPredictStep = 0;
let predictData = null;

async function loadPredictStep(step) {
  try {
    const res = await fetch(`${API_BASE}/api/predict-next?step=${step}`);
    const data = await res.json();
    predictData = data;
    renderPredictSequence(data, false);
  } catch (err) {
    console.error('Predict step error', err);
  }
}

function renderPredictSequence(data, revealed) {
  const container = $('predict-sequence');
  if (!container) return;
  container.innerHTML = '';

  data.shown.forEach(n => {
    const span = document.createElement('span');
    span.className = 'pred-num';
    span.textContent = n;
    container.appendChild(span);

    const arr = document.createElement('span');
    arr.className = 'pred-arrow-icon';
    arr.textContent = '→';
    container.appendChild(arr);
  });

  const mystery = document.createElement('span');
  if (revealed) {
    mystery.className = 'pred-num revealed';
    mystery.textContent = data.next;
  } else {
    mystery.className = 'pred-num hidden-num';
    mystery.textContent = '???';
  }
  container.appendChild(mystery);
}

function initPredictDemo() {
  const revealBtn = $('reveal-btn');
  if (!revealBtn) return;

  revealBtn.addEventListener('click', async () => {
    if (!predictData) {
      await loadPredictStep(currentPredictStep);
      return;
    }

    renderPredictSequence(predictData, true);

    const msgEl = $('reveal-message');
    if (msgEl) {
      msgEl.textContent = predictData.message;
      msgEl.classList.add('visible');
    }

    setTimeout(async () => {
      currentPredictStep = predictData.step;
      await loadPredictStep(currentPredictStep);
      if (msgEl) msgEl.classList.remove('visible');
    }, 3200);
  });
}

async function loadCsprngPredictSample() {
  try {
    const res = await fetch(`${API_BASE}/api/generate-value?type=key&length=8`);
    const data = await res.json();
    const el = $('csprng-predict-val');
    if (el && data.value) el.textContent = data.value;
  } catch {
    const el = $('csprng-predict-val');
    if (el) el.textContent = 'a91f3b82d7c1e4f0';
  }
}

// ---------------------------------------------------------------------------
// 13. STICKY NAV OBSERVER
// ---------------------------------------------------------------------------
function setupNavHighlight() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link[href^="#"]');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });

  sections.forEach(s => observer.observe(s));
}

// ---------------------------------------------------------------------------
// 14. INITIALIZATION ON DOM LOAD
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Health check
  await checkServerHealth();

  // 2. Initialize Primitive Tabs & Byte Lengths
  initPrimitiveTabs();
  populateByteLengthOptions('key');

  // 3. Initialize Generator Studio
  initGenerator();

  // 4. Initialize Sandbox Demos
  initKeyDemo();
  initNonceDemo();
  initSessionDemo();
  initTokenDemo();

  // 5. Initialize Comparison & Prediction
  const refreshBtn = $('refresh-compare-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadComparison);
  await loadComparison();

  initPredictDemo();
  await loadPredictStep(0);
  await loadCsprngPredictSample();

  // 6. Navigation Highlighting
  setupNavHighlight();
});
