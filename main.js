// main.js - handles STT, camera, translate, SOS and gesture detection (MediaPipe Hands)

const backendBase = 'http://localhost:4000'; // change if needed

document.addEventListener('DOMContentLoaded', () => {
  // --- Basic features (STT, Camera, Translate, SOS) ---
  let recognition;
  let listening = false;
  const transcriptEl = document.getElementById('transcript');
  const startBtn = document.getElementById('start-listen');
  const stopBtn = document.getElementById('stop-listen');

  function initSTT() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (transcriptEl) transcriptEl.textContent = 'SpeechRecognition not supported in this browser.';
      if (startBtn) startBtn.disabled = true;
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    // --- STT status handling (REAL state, not button state) ---
    recognition.onstart = () => {
      const s = document.getElementById('stt-status');
      if (s) {
        s.textContent = 'Status: Listening…';
        s.className = 'stt-status listening';
      }
      if (startBtn) startBtn.classList.add('disabled-look');
      if (stopBtn) stopBtn.classList.add('listening');
    };

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript;
      if (transcriptEl) transcriptEl.textContent = text;
    };

    recognition.onerror = (e) => {
      console.error('STT error', e);
      if (transcriptEl) transcriptEl.textContent = 'Error: ' + (e.error || 'unknown');
    };

    recognition.onend = () => {
      listening = false;
      const s = document.getElementById('stt-status');
      if (s) {
        s.textContent = 'Status: Not listening';
        s.className = 'stt-status idle';
      }
      if (startBtn) startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      if (startBtn) startBtn.classList.remove('disabled-look');
      if (stopBtn) stopBtn.classList.remove('listening');
    };
  }

  initSTT();

  startBtn?.addEventListener('click', () => {
    if (!recognition) return;
    try {
      // Clear previous transcript for a fresh session
      if (transcriptEl) transcriptEl.textContent = '';

      recognition.start();
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } catch (err) {
      console.error('Failed to start recognition', err);
    }
  });

  stopBtn?.addEventListener('click', async () => {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (err) {
      console.error('Error stopping recognition', err);
    }

    const text = transcriptEl?.textContent || '';
    if (text.trim()) {
      try {
        await fetch(backendBase + '/api/logs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'speech', data: { text }, userId: 'student1' })
        });

        // Show confirmation after successful save
        const s = document.getElementById('stt-status');
        if (s) {
          s.textContent = 'Status: Speech saved ✓';
          s.className = 'stt-status listening';
        }
      } catch (err) {
        console.error('Failed to save log', err);
      }
    }
  });

  // --- Camera (video stream) ---
  let stream;
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const ctx = overlay ? overlay.getContext('2d') : null;
  const startCamBtn = document.getElementById('start-camera');
  const stopCamBtn = document.getElementById('stop-camera');
  const camStatus = document.getElementById('camera-status');
  const gestureLabelEl = document.getElementById('gesture-label');

  startCamBtn?.addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (video) video.srcObject = stream;
      if (camStatus) camStatus.textContent = 'Camera running';
      if (startCamBtn) startCamBtn.disabled = true;
      if (stopCamBtn) stopCamBtn.disabled = false;

      // If hands camera is configured later, starting the stream is enough.
      // MediaPipe's Camera utility will also use the same video element.
    } catch (err) {
      console.error('Camera error', err);
      if (camStatus) camStatus.textContent = 'Camera error: ' + (err.message || err.name || 'unknown');
    }
  });

  stopCamBtn?.addEventListener('click', () => {
    if (!stream) return;
    stream.getTracks().forEach(t => t.stop());
    if (video) video.srcObject = null;
    if (camStatus) camStatus.textContent = 'Camera stopped.';
    if (startCamBtn) startCamBtn.disabled = false;
    if (stopCamBtn) stopCamBtn.disabled = true;
    // stop MediaPipe camera if exists
    if (window._mpCamera && typeof window._mpCamera.stop === 'function') {
      try { window._mpCamera.stop(); } catch(e){/* ignore */ }
    }
  });

  // --- Translate ---
  const translateBtn = document.getElementById('translate-btn');
  translateBtn?.addEventListener('click', async () => {
    const inputEl = document.getElementById('translate-input');
    const text = (inputEl?.value) || (transcriptEl?.textContent) || '';
    const targetEl = document.getElementById('translate-target');
    const target = targetEl?.value || 'en';
    if (!text.trim()) return alert('Enter text or speak something first');
    try {
      const res = await fetch(backendBase + '/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, target, userId: 'student1' })
      });
      const data = await res.json();
      const out = document.getElementById('translate-output');
      if (out) out.textContent = data.translatedText || '[no response]';
    } catch (err) {
      console.error('Translate error', err);
      alert('Translate error: ' + (err.message || err));
    }
  });

  // --- SOS ---
  const sosBtn = document.getElementById('sos-btn');
  const sosStatus = document.getElementById('sos-status');

  sosBtn?.addEventListener('click', async () => {
    const ok = confirm('Send SOS? This will store an alert in the backend.');
    if (!ok) return;
    try {
      const res = await fetch(backendBase + '/api/sos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'student1', location: 'Unknown', message: 'SOS from web UI' })
      });
      const data = await res.json();
      if (sosStatus) sosStatus.textContent = 'SOS sent: ' + (data.message || 'ok');
    } catch (err) {
      console.error('SOS error', err);
      if (sosStatus) sosStatus.textContent = 'SOS failed: ' + (err.message || err);
    }
  });

  // --- Gesture detection: MediaPipe Hands + simple heuristics ---
  // Heuristics use landmark tip vs pip positions to decide folded/extended fingers.
  // Landmark indices (MediaPipe): thumb_tip=4, index_tip=8, middle_tip=12, ring_tip=16, pinky_tip=20
  // pip indices: index_pip=6, middle_pip=10, ring_pip=14, pinky_pip=18
  // thumb_mcp ~ 2 (used for vertical thumb check)
  let lastGesture = null;
  let gestureStableCount = 0;
  const GESTURE_STABLE_REQUIRED = 5; // increased frames for stronger stability
  const DEBOUNCE_MS = 1200;         // longer debounce to avoid duplicate logs
  let lastLoggedAt = 0;

  function detectGestureFromLandmarks(landmarks) {
    // landmarks: array of {x,y,z} normalized; y smaller => higher on screen
    if (!landmarks || landmarks.length < 21) return null;

    const tip = (i) => landmarks[i];
    const pip = (i) => landmarks[i];

    const thumbTip = landmarks[4];
    const thumbMcp = landmarks[2];

    const indexTip = landmarks[8], indexPip = landmarks[6];
    const middleTip = landmarks[12], middlePip = landmarks[10];
    const ringTip = landmarks[16], ringPip = landmarks[14];
    const pinkyTip = landmarks[20], pinkyPip = landmarks[18];

    // Helper: finger extended if tip.y < pip.y (tip higher than pip)
    const indexExtended = indexTip.y < indexPip.y;
    const middleExtended = middleTip.y < middlePip.y;
    const ringExtended = ringTip.y < ringPip.y;
    const pinkyExtended = pinkyTip.y < pinkyPip.y;

    // Thumb up check: thumb tip above thumb mcp (smaller y)
    const thumbUp = thumbTip.y < thumbMcp.y;

    // Heuristics:
    // Thumbs up: thumbUp true && other fingers folded
    if (thumbUp && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return 'thumbs_up';
    }

    // Open palm (stop): many fingers extended
    const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;
    if (extendedCount >= 3) {
      return 'open_palm';
    }

    // Fist: no fingers extended (all folded)
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      // but ensure thumb is not strongly up (to avoid confusion with thumbs_up)
      if (!thumbUp) return 'fist';
    }

    return null;
  }

  // Draw landmarks and label (improved)
  function drawResultsOnCanvas(landmarks, multiHandedness) {
    if (!ctx || !overlay) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!landmarks) return;

    // draw skeleton connections (simple set)
    const pairs = [
      [0,1],[1,2],[2,3],[3,4],       // thumb
      [0,5],[5,6],[6,7],[7,8],       // index
      [5,9],[9,10],[10,11],[11,12],  // middle
      [9,13],[13,14],[14,15],[15,16],// ring
      [13,17],[17,18],[18,19],[19,20]// pinky
    ];

    // draw connections
    ctx.lineWidth = 2;
    for (let i=0;i<pairs.length;i++){
      const [a,b] = pairs[i];
      const ax = landmarks[a].x * overlay.width;
      const ay = landmarks[a].y * overlay.height;
      const bx = landmarks[b].x * overlay.width;
      const by = landmarks[b].y * overlay.height;
      ctx.strokeStyle = 'rgba(11,114,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // draw landmarks and color fingertips green if extended (heuristic)
    const tipIndices = [4,8,12,16,20];
    const pipIndices = [2,6,10,14,18]; // approximate for thumb/pips
    for (let i = 0; i < landmarks.length; i++) {
      const x = landmarks[i].x * overlay.width;
      const y = landmarks[i].y * overlay.height;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);

      // color fingertips differently
      if (tipIndices.includes(i)) {
        // fingertip color default
        ctx.fillStyle = 'rgba(0,150,136,0.95)';
      } else {
        ctx.fillStyle = 'rgba(12,20,58,0.9)';
      }
      ctx.fill();
    }

    // subtle rectangle highlight inside guide when hand detected
    const guide = document.getElementById('guide-rect');
    if (guide) {
      guide.style.borderColor = 'rgba(11,114,255,0.36)';
      guide.style.boxShadow = '0 8px 24px rgba(11,114,255,0.04)';
    }
  }

  // Initialize MediaPipe Hands
  if (window.Hands) {
    const hands = new Hands({
      locateFile: (file) => {
        // Use jsdelivr distribution
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,            // keep fast
      minDetectionConfidence: 0.78,  // higher threshold
      minTrackingConfidence: 0.7
    });

    hands.onResults((results) => {
      // results.multiHandLandmarks is an array (one entry per hand)
      const landmarks = (results.multiHandLandmarks && results.multiHandLandmarks[0]) || null;

      if (landmarks) {
        drawResultsOnCanvas(landmarks, results.multiHandedness);
        const gesture = detectGestureFromLandmarks(landmarks);

        // stability logic
        if (gesture === lastGesture && gesture !== null) {
          gestureStableCount++;
        } else {
          gestureStableCount = 1;
        }

        if (gesture !== lastGesture) {
          lastGesture = gesture;
        }

        // update UI label when stable for some frames
        if (gestureStableCount >= GESTURE_STABLE_REQUIRED && gesture) {
          const now = Date.now();
          // Avoid logging too frequently
          if (now - lastLoggedAt > DEBOUNCE_MS) {
            lastLoggedAt = now;
            // Show label
            if (gestureLabelEl) gestureLabelEl.innerHTML = `Detected gesture: <strong>${gesture.replace('_', ' ')}</strong>`;
            // pulse visual
            if (typeof pulseGestureLabel === 'function') pulseGestureLabel();
            // Post to backend
            fetch(backendBase + '/api/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'gesture', data: { label: gesture }, userId: 'student1' })
            }).catch(err => console.error('Failed to save gesture log', err));
          }
        }
      } else {
        // clear canvas and reset label if no hand
        if (ctx && overlay) ctx.clearRect(0, 0, overlay.width, overlay.height);
        // fade guide back to subtle
        const guide = document.getElementById('guide-rect');
        if (guide) {
          guide.style.borderColor = 'rgba(11,114,255,0.16)';
          guide.style.boxShadow = 'none';
        }
        // don't immediately clear label; leave last known label
      }
    });

    // wire MediaPipe Camera util (it reads the same video element)
    if (typeof Camera === 'function') {
      // store camera on global so we can stop it when Stop Camera clicked
      window._mpCamera = new Camera(video, {
        onFrame: async () => {
          try {
            await hands.send({ image: video });
          } catch (e) {
            // ignore occasional send errors
          }
        },
        width: 640,
        height: 480
      });
      // We do NOT start it here; start when user clicks Start Camera
      // but startCamBtn click opens stream; MediaPipe camera uses video element directly
    } else {
      console.warn('MediaPipe Camera utility not available.');
    }

  } else {
    console.warn('MediaPipe Hands not available. Did the script load?');
  }

  // To start detection once camera is active: start the MediaPipe camera manually
  // We'll hook this into startCamBtn click to start the mpCamera if available
  startCamBtn?.addEventListener('click', () => {
    // small timeout to allow video stream attachment
    setTimeout(() => {
      if (window._mpCamera && typeof window._mpCamera.start === 'function') {
        try {
          window._mpCamera.start();
        } catch (e) { /* ignore */ }
      }
    }, 200);
  });

  // visual pulse helper
  function pulseGestureLabel() {
    if (!gestureLabelEl) return;
    gestureLabelEl.style.transition = 'transform 220ms ease, background 220ms';
    gestureLabelEl.style.transform = 'scale(1.03)';
    gestureLabelEl.style.background = 'rgba(11,114,255,0.04)';
    setTimeout(()=> {
      gestureLabelEl.style.transform = '';
      gestureLabelEl.style.background = '';
    }, 260);
  }

  // Clean-up when leaving page (optional)
  window.addEventListener('beforeunload', () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (window._mpCamera && typeof window._mpCamera.stop === 'function') {
      try { window._mpCamera.stop(); } catch(e){/* ignore */ }
    }
  });

  // small helpful message if MediaPipe not loaded (debug)
  setTimeout(() => {
    if (!window.Hands) {
      console.warn('MediaPipe Hands failed to load. Check network or CDN availability.');
      if (camStatus) camStatus.textContent = 'Camera running (gesture disabled - MediaPipe missing).';
    }
  }, 1500);

  // --- optional: ignore third-party unhandled rejections already added earlier if needed ---
  window.addEventListener('unhandledrejection', function (event) {
    try {
      const reason = event.reason || '';
      const stackOrMessage = (typeof reason === 'object') ? (reason.stack || reason.message || '') : String(reason);
      if (stackOrMessage.toString().includes('giveFreely') || stackOrMessage.toString().includes('No checkout popup config found')) {
        event.preventDefault();
        console.warn('Ignored third-party unhandled rejection from giveFreely or similar.');
        return;
      }
    } catch (e) {}
    // allow other errors to surface
  });
});