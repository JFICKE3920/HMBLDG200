const video = document.getElementById("video");
const canvas = document.getElementById("hiddenCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const statusText = document.getElementById("statusText");
const motionValue = document.getElementById("motionValue");
const viewModeText = document.getElementById("viewModeText");
const cameraModeText = document.getElementById("cameraModeText");
const flashStatusText = document.getElementById("flashStatusText");
const permissionHint = document.getElementById("permissionHint");
const alertOverlay = document.getElementById("alertOverlay");
const screenFlashOverlay = document.getElementById("screenFlashOverlay");
const fullscreenTapHint = document.getElementById("fullscreenTapHint");

const thresholdInput = document.getElementById("threshold");
const cooldownInput = document.getElementById("cooldown");
const zoomInput = document.getElementById("zoom");
const thresholdLabel = document.getElementById("thresholdLabel");
const cooldownLabel = document.getElementById("cooldownLabel");
const zoomLabel = document.getElementById("zoomLabel");
const zoomHint = document.getElementById("zoomHint");
const soundEnabled = document.getElementById("soundEnabled");
const flashEnabled = document.getElementById("flashEnabled");

const startCameraBtn = document.getElementById("startCameraBtn");
const switchCameraBtn = document.getElementById("switchCameraBtn");
const startMonitorBtn = document.getElementById("startMonitorBtn");
const stopMonitorBtn = document.getElementById("stopMonitorBtn");
const testAlertBtn = document.getElementById("testAlertBtn");
const testFlashBtn = document.getElementById("testFlashBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const swapOrientationBtn = document.getElementById("swapOrientationBtn");
const videoCard = document.getElementById("videoCard");
const videoShell = document.getElementById("videoShell");

let stream = null;
let videoTrack = null;
let monitoring = false;
let animationFrameId = null;
let previousFrame = null;
let lastTriggerTime = 0;
let landscapeView = false;
let manualFullscreen = false;
let zoomCapabilities = null;
let torchSupported = false;
let tapHintTimeout = null;
let cameraFacingMode = "user";

function loadSettings() {
  const savedThreshold = localStorage.getItem("cubicle-threshold");
  const savedCooldown = localStorage.getItem("cubicle-cooldown");
  const savedSound = localStorage.getItem("cubicle-sound");
  const savedFlash = localStorage.getItem("cubicle-flash");
  const savedLandscape = localStorage.getItem("cubicle-landscape");
  const savedZoom = localStorage.getItem("cubicle-zoom");
  const savedCameraFacing = localStorage.getItem("cubicle-facing");

  if (savedThreshold) thresholdInput.value = savedThreshold;
  if (savedCooldown) cooldownInput.value = savedCooldown;
  if (savedSound !== null) soundEnabled.checked = savedSound === "true";
  if (savedFlash !== null) flashEnabled.checked = savedFlash === "true";
  if (savedLandscape !== null) landscapeView = savedLandscape === "true";
  if (savedZoom) zoomInput.value = savedZoom;
  if (savedCameraFacing === "user" || savedCameraFacing === "environment") cameraFacingMode = savedCameraFacing;

  syncLabels();
  applyViewMode();
  applyCameraViewState();
  updateFlashUi();
  updateFullscreenTapBehavior();
}

function saveSettings() {
  localStorage.setItem("cubicle-threshold", thresholdInput.value);
  localStorage.setItem("cubicle-cooldown", cooldownInput.value);
  localStorage.setItem("cubicle-sound", soundEnabled.checked);
  localStorage.setItem("cubicle-flash", flashEnabled.checked);
  localStorage.setItem("cubicle-landscape", landscapeView);
  localStorage.setItem("cubicle-zoom", zoomInput.value);
  localStorage.setItem("cubicle-facing", cameraFacingMode);
}

function syncLabels() {
  thresholdLabel.textContent = `${Number(thresholdInput.value).toFixed(1)}%`;
  cooldownLabel.textContent = `${Number(cooldownInput.value).toFixed(1)} sec`;
  zoomLabel.textContent = `${Number(zoomInput.value).toFixed(1)}×`;
}

function applyViewMode() {
  videoShell.classList.toggle("landscape-view", landscapeView);
  swapOrientationBtn.textContent = landscapeView ? "Portrait View" : "Landscape View";
  viewModeText.textContent = landscapeView ? "Landscape" : "Portrait";
}

function applyCameraViewState() {
  const isFront = cameraFacingMode === "user";
  cameraModeText.textContent = isFront ? "Front" : "Rear";
  switchCameraBtn.textContent = isFront ? "Use Rear Camera" : "Use Front Camera";
  video.classList.toggle("mirror", isFront);
  updateFlashUi();
}

function updateFlashUi() {
  if (!flashEnabled.checked) {
    flashStatusText.textContent = "Off";
    return;
  }

  if (cameraFacingMode === "user") {
    flashStatusText.textContent = "Screen Flash";
  } else if (!stream) {
    flashStatusText.textContent = "Not checked";
  } else if (torchSupported) {
    flashStatusText.textContent = "Rear Torch Ready";
  } else {
    flashStatusText.textContent = "Screen Fallback";
  }
}

function isFullscreenLike() {
  return Boolean(document.fullscreenElement) || manualFullscreen;
}

function showTapHintTemporarily() {
  if (!isFullscreenLike()) {
    fullscreenTapHint.classList.add("hidden");
    return;
  }
  fullscreenTapHint.classList.remove("hidden");
  clearTimeout(tapHintTimeout);
  tapHintTimeout = setTimeout(() => fullscreenTapHint.classList.add("hidden"), 1800);
}

function updateFullscreenTapBehavior() {
  if (!isFullscreenLike()) {
    fullscreenTapHint.classList.add("hidden");
    return;
  }
  showTapHintTemporarily();
}

thresholdInput.addEventListener("input", () => { syncLabels(); saveSettings(); });
cooldownInput.addEventListener("input", () => { syncLabels(); saveSettings(); });
soundEnabled.addEventListener("change", saveSettings);
flashEnabled.addEventListener("change", () => {
  saveSettings();
  updateFlashUi();
});
zoomInput.addEventListener("input", async () => {
  syncLabels();
  saveSettings();
  await applyZoom();
});

swapOrientationBtn.addEventListener("click", async (event) => {
  event.stopPropagation();
  landscapeView = !landscapeView;
  applyViewMode();
  saveSettings();
  await tryLockOrientation();
});

async function startCamera() {
  try {
    statusText.textContent = "Requesting camera...";
    stopCameraStream();

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: cameraFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    videoTrack = stream.getVideoTracks()[0] || null;
    video.srcObject = stream;
    await video.play();

    permissionHint.style.display = "none";
    statusText.textContent = "Camera ready";

    applyCameraViewState();
    await setupZoomControl();
    setupTorchControl();
    await tryLockOrientation();
  } catch (error) {
    console.error(error);
    statusText.textContent = "Camera access failed";
    permissionHint.innerHTML = "Camera access failed. Use HTTPS and allow camera access in Safari.";
  }
}

function stopCameraStream() {
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  videoTrack = null;
  torchSupported = false;
  zoomCapabilities = null;
  updateFlashUi();
}

async function switchCamera() {
  cameraFacingMode = cameraFacingMode === "user" ? "environment" : "user";
  saveSettings();
  applyCameraViewState();
  previousFrame = null;

  const wasMonitoring = monitoring;
  if (monitoring) stopMonitoring();

  await startCamera();
  if (wasMonitoring && stream) startMonitoring();
}

async function setupZoomControl() {
  zoomCapabilities = null;
  zoomInput.disabled = true;
  zoomInput.min = "1";
  zoomInput.max = "1";
  zoomInput.step = "0.1";
  zoomInput.value = "1";
  zoomHint.textContent = "Zoom becomes available when the browser and selected camera support it.";

  if (!videoTrack || typeof videoTrack.getCapabilities !== "function") {
    zoomHint.textContent = "This browser does not expose camera zoom controls.";
    syncLabels();
    return;
  }

  const capabilities = videoTrack.getCapabilities();
  if (!capabilities || !capabilities.zoom) {
    zoomHint.textContent = "This camera/browser combination does not support adjustable zoom here.";
    syncLabels();
    return;
  }

  zoomCapabilities = capabilities.zoom;
  zoomInput.disabled = false;
  zoomInput.min = String(zoomCapabilities.min ?? 1);
  zoomInput.max = String(zoomCapabilities.max ?? 1);
  zoomInput.step = String(zoomCapabilities.step ?? 0.1);

  const settings = typeof videoTrack.getSettings === "function" ? videoTrack.getSettings() : {};
  const savedZoom = Number(localStorage.getItem("cubicle-zoom"));
  const startZoom =
    Number.isFinite(savedZoom) && savedZoom >= Number(zoomInput.min) && savedZoom <= Number(zoomInput.max)
      ? savedZoom
      : (settings.zoom ?? zoomCapabilities.min ?? 1);

  zoomInput.value = String(startZoom);
  zoomHint.textContent = `Zoom supported from ${Number(zoomInput.min).toFixed(1)}× to ${Number(zoomInput.max).toFixed(1)}×.`;
  syncLabels();
  await applyZoom();
}

async function applyZoom() {
  if (!videoTrack || !zoomCapabilities || typeof videoTrack.applyConstraints !== "function") return;

  const zoomValue = Number(zoomInput.value);
  try {
    await videoTrack.applyConstraints({ advanced: [{ zoom: zoomValue }] });
    zoomLabel.textContent = `${zoomValue.toFixed(1)}×`;
  } catch (error) {
    console.warn("Zoom apply failed:", error);
  }
}

function setupTorchControl() {
  torchSupported = false;

  if (videoTrack && typeof videoTrack.getCapabilities === "function") {
    const capabilities = videoTrack.getCapabilities();
    torchSupported = Boolean(capabilities && capabilities.torch);
  }

  updateFlashUi();
}

async function setTorch(on) {
  if (!videoTrack || !torchSupported || typeof videoTrack.applyConstraints !== "function") return false;

  try {
    await videoTrack.applyConstraints({ advanced: [{ torch: Boolean(on) }] });
    return true;
  } catch (error) {
    console.warn("Torch apply failed:", error);
    torchSupported = false;
    updateFlashUi();
    return false;
  }
}

function screenFlash(durationMs = 450) {
  screenFlashOverlay.classList.remove("hidden");
  setTimeout(() => screenFlashOverlay.classList.add("hidden"), durationMs);
}

async function runMotionFlash(durationMs = 450) {
  if (!flashEnabled.checked) return;

  if (cameraFacingMode === "environment" && torchSupported) {
    const turnedOn = await setTorch(true);
    if (turnedOn) {
      setTimeout(() => setTorch(false), durationMs);
      return;
    }
  }

  screenFlash(durationMs);
}

async function testFlash() {
  if (!flashEnabled.checked) {
    flashEnabled.checked = true;
    saveSettings();
    updateFlashUi();
  }
  await runMotionFlash(650);
}

function stopMonitoring() {
  monitoring = false;
  statusText.textContent = "Paused";
  previousFrame = null;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function startMonitoring() {
  if (!stream) {
    statusText.textContent = "Start camera first";
    return;
  }
  monitoring = true;
  statusText.textContent = "Monitoring";
  previousFrame = null;
  processFrame();
}

function toggleMonitoringFromFullscreenTap() {
  if (!isFullscreenLike() || !stream) return;

  if (monitoring) stopMonitoring();
  else startMonitoring();

  showTapHintTemporarily();
}

function processFrame() {
  if (!monitoring) return;
  if (video.readyState < 2) {
    animationFrameId = requestAnimationFrame(processFrame);
    return;
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const currentFrame = new Uint8Array(canvas.width * canvas.height);
  let pixelIndex = 0;

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    currentFrame[pixelIndex++] = Math.round((0.299 * r) + (0.587 * g) + (0.114 * b));
  }

  let percentChanged = 0;
  if (previousFrame) {
    let changed = 0;
    for (let i = 0; i < currentFrame.length; i++) {
      const diff = Math.abs(currentFrame[i] - previousFrame[i]);
      if (diff >= 18) changed++;
    }
    percentChanged = (changed / currentFrame.length) * 100;
  }

  previousFrame = currentFrame;
  motionValue.textContent = `${percentChanged.toFixed(1)}%`;

  const threshold = Number(thresholdInput.value);
  const cooldownMs = Number(cooldownInput.value) * 1000;
  const now = Date.now();

  if (percentChanged >= threshold && now - lastTriggerTime >= cooldownMs) {
    lastTriggerTime = now;
    statusText.textContent = "Motion detected";
    triggerAlert();
    runMotionFlash(450);
    setTimeout(() => {
      if (monitoring) statusText.textContent = "Monitoring";
    }, 900);
  }

  animationFrameId = requestAnimationFrame(processFrame);
}

function triggerAlert() {
  alertOverlay.classList.remove("hidden");
  if (soundEnabled.checked) playBeep();
  if (navigator.vibrate) navigator.vibrate([180, 100, 180]);

  setTimeout(() => alertOverlay.classList.add("hidden"), 800);
}

function playBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.18);
  } catch (error) {
    console.warn("Beep failed:", error);
  }
}

async function toggleFullscreen(event) {
  if (event) event.stopPropagation();

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      manualFullscreen = false;
      document.body.classList.remove("fullscreen-mode");
      videoCard.classList.remove("manual-fullscreen");
      fullscreenBtn.textContent = "Fullscreen";
      updateFullscreenTapBehavior();
      return;
    }

    if (videoCard.requestFullscreen) {
      await videoCard.requestFullscreen();
      fullscreenBtn.textContent = "Exit Fullscreen";
      updateFullscreenTapBehavior();
      return;
    }
  } catch (error) {
    console.warn("Native fullscreen failed, falling back:", error);
  }

  manualFullscreen = !manualFullscreen;
  document.body.classList.toggle("fullscreen-mode", manualFullscreen);
  videoCard.classList.toggle("manual-fullscreen", manualFullscreen);
  fullscreenBtn.textContent = manualFullscreen ? "Exit Fullscreen" : "Fullscreen";
  updateFullscreenTapBehavior();
}

document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  fullscreenBtn.textContent = active ? "Exit Fullscreen" : "Fullscreen";
  if (!active) document.body.classList.remove("fullscreen-mode");
  updateFullscreenTapBehavior();
});

async function tryLockOrientation() {
  if (!screen.orientation || typeof screen.orientation.lock !== "function") return;
  try {
    await screen.orientation.lock(landscapeView ? "landscape" : "portrait");
  } catch (error) {
    console.warn("Orientation lock unavailable:", error);
  }
}

window.addEventListener("orientationchange", () => {
  const isLandscapeNow = window.matchMedia("(orientation: landscape)").matches;
  viewModeText.textContent = isLandscapeNow ? "Landscape" : "Portrait";
});

videoShell.addEventListener("click", (event) => {
  const clickedButton = event.target.closest("button");
  if (clickedButton) return;
  toggleMonitoringFromFullscreenTap();
});

startCameraBtn.addEventListener("click", startCamera);
switchCameraBtn.addEventListener("click", switchCamera);
startMonitorBtn.addEventListener("click", startMonitoring);
stopMonitorBtn.addEventListener("click", stopMonitoring);
testAlertBtn.addEventListener("click", triggerAlert);
testFlashBtn.addEventListener("click", testFlash);
fullscreenBtn.addEventListener("click", toggleFullscreen);

window.addEventListener("beforeunload", () => {
  setTorch(false);
  stopCameraStream();
});

loadSettings();
