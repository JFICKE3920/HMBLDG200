const video = document.getElementById("video");
const canvas = document.getElementById("hiddenCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const statusText = document.getElementById("statusText");
const motionValue = document.getElementById("motionValue");
const permissionHint = document.getElementById("permissionHint");
const alertOverlay = document.getElementById("alertOverlay");

const thresholdInput = document.getElementById("threshold");
const cooldownInput = document.getElementById("cooldown");
const thresholdLabel = document.getElementById("thresholdLabel");
const cooldownLabel = document.getElementById("cooldownLabel");
const soundEnabled = document.getElementById("soundEnabled");

const startCameraBtn = document.getElementById("startCameraBtn");
const startMonitorBtn = document.getElementById("startMonitorBtn");
const stopMonitorBtn = document.getElementById("stopMonitorBtn");
const testAlertBtn = document.getElementById("testAlertBtn");

let stream = null;
let monitoring = false;
let animationFrameId = null;
let previousFrame = null;
let lastTriggerTime = 0;

function loadSettings() {
  const savedThreshold = localStorage.getItem("cubicle-threshold");
  const savedCooldown = localStorage.getItem("cubicle-cooldown");
  const savedSound = localStorage.getItem("cubicle-sound");

  if (savedThreshold) thresholdInput.value = savedThreshold;
  if (savedCooldown) cooldownInput.value = savedCooldown;
  if (savedSound !== null) soundEnabled.checked = savedSound === "true";

  syncLabels();
}

function saveSettings() {
  localStorage.setItem("cubicle-threshold", thresholdInput.value);
  localStorage.setItem("cubicle-cooldown", cooldownInput.value);
  localStorage.setItem("cubicle-sound", soundEnabled.checked);
}

function syncLabels() {
  thresholdLabel.textContent = `${Number(thresholdInput.value).toFixed(1)}%`;
  cooldownLabel.textContent = `${Number(cooldownInput.value).toFixed(1)} sec`;
}

thresholdInput.addEventListener("input", () => {
  syncLabels();
  saveSettings();
});

cooldownInput.addEventListener("input", () => {
  syncLabels();
  saveSettings();
});

soundEnabled.addEventListener("change", saveSettings);

async function startCamera() {
  try {
    statusText.textContent = "Requesting camera...";
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    permissionHint.style.display = "none";
    statusText.textContent = "Camera ready";
  } catch (error) {
    console.error(error);
    statusText.textContent = "Camera access failed";
    permissionHint.innerHTML = "Camera access failed. Use HTTPS and allow camera access in Safari.";
  }
}

function stopMonitoring() {
  monitoring = false;
  statusText.textContent = "Idle";
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
      if (diff >= 18) {
        changed++;
      }
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

    setTimeout(() => {
      if (monitoring) {
        statusText.textContent = "Monitoring";
      }
    }, 900);
  }

  animationFrameId = requestAnimationFrame(processFrame);
}

function triggerAlert() {
  alertOverlay.classList.remove("hidden");

  if (soundEnabled.checked) {
    playBeep();
  }

  if (navigator.vibrate) {
    navigator.vibrate([180, 100, 180]);
  }

  setTimeout(() => {
    alertOverlay.classList.add("hidden");
  }, 800);
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

startCameraBtn.addEventListener("click", startCamera);
startMonitorBtn.addEventListener("click", startMonitoring);
stopMonitorBtn.addEventListener("click", stopMonitoring);
testAlertBtn.addEventListener("click", triggerAlert);

window.addEventListener("beforeunload", () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
});

loadSettings();
