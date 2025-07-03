const URL = "model/";
let model, webcam, ctxWebcam, maxPredictions;

let arrows = [];
let lastSymbol = null;
let sameCount = 0;

let minDelay = 1000;
let maxDelay = 1500;
let arrowSpeed = 8;

let score = 0;
let currentPose = "";

const backsound = new Audio("assets/backsounds.mp3");
backsound.loop = true;
backsound.volume = 1;

let gameCanvas, ctxGame;
let directions = ["⬅️", "⬆️", "➡️"];
let directionMap = { "⬅️": "kiri", "⬆️": "atas", "➡️": "kanan" };
let directionX = { "⬅️": 80, "⬆️": 180, "➡️": 280 };
let targetY = 90;

let floatingTexts = [];

let gameStarted = false;
let gameEnded = false;
let countdownValue = 3;
let timerValue = 120;
let countdownInterval, timerInterval;

let lastArrowTime = 0;

let totalMisses = 0;
const maxMisses = 20;

const soundEffects = {
  button: new Audio("sfx/click-button.mp3"),
  hit: new Audio("sfx/hit1.wav"),
  miss: new Audio("sfx/miss.wav"),
  countdown: new Audio("sfx/countdown.mp3"),
  finish: new Audio("sfx/finish.mp3"),
};

let currentAudio = null;

const arrowImages = {
  "⬆️": new Image(),
  "➡️": new Image(),
  "⬅️": new Image(),
};
arrowImages["⬆️"].src = "images/atas.png";
arrowImages["➡️"].src = "images/kanan.png";
arrowImages["⬅️"].src = "images/kiri.png";

async function init() {
  const modelURL = URL + "model.json";
  const metadataURL = URL + "metadata.json";
  model = await tmPose.load(modelURL, metadataURL);
  maxPredictions = model.getTotalClasses();

  webcam = new tmPose.Webcam(400, 400, true);
  await webcam.setup();
  await webcam.play();

  const webcamContainer = document.getElementById("webcam-container");
  webcamContainer.innerHTML = "";
  webcamContainer.appendChild(webcam.canvas);

  webcam.canvas.style.width = "400px";
  webcam.canvas.style.height = "400px";
  webcam.canvas.style.border = "4px solid #555";
  webcam.canvas.style.borderRadius = "10px";
  webcam.canvas.style.backgroundColor = "black";

  ctxWebcam = webcam.canvas.getContext("2d");
  ctxWebcam.imageSmoothingEnabled = false;

  gameCanvas = document.getElementById("game-canvas");
  ctxGame = gameCanvas.getContext("2d");
  ctxGame.imageSmoothingEnabled = true;

  setInterval(() => checkHits(), 100);
  window.requestAnimationFrame(loop);
}

function startGame() {
  document.getElementById("start-btn").style.display = "none";
  document.getElementById("label-pilih").style.display = "none";
  document.getElementById("music-select").style.display = "none";

  if (backsound && !backsound.paused) {
    backsound.pause();
    backsound.currentTime = 0;
  }

  totalMisses = 0;

  countdownValue = 3;
  score = 0;
  arrows = [];
  floatingTexts = [];
  gameEnded = false;

  const selectedMusic = document.getElementById("music-select").value;

  // Siapkan Audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  currentAudio = new Audio(selectedMusic);

  // Mainkan efek countdown
  soundEffects.countdown.play();

  currentAudio.addEventListener("loadedmetadata", () => {
    timerValue = Math.floor(currentAudio.duration) || 120;
  });

  currentAudio.load(); // trigger load metadata

  // Jalankan countdown
  countdownInterval = setInterval(() => {
    countdownValue--;

    if (countdownValue <= 0) {
      clearInterval(countdownInterval);
      gameStarted = true;

      currentAudio.play();
      startArrowLoop();
      startTimer();
    }
  }, 1000);
}

function resetGame() {
  soundEffects.button.play();
  gameStarted = false;
  gameEnded = false;
  totalMisses = 0;

  score = 0;
  arrows = [];
  floatingTexts = [];
  timerValue = 120;
  countdownValue = 3;

  document.getElementById("game-box").style.display = "none";
  document.getElementById("difficulty-selection").style.display = "block";
  document.getElementById("restart-btn").style.display = "none";
  document.getElementById("start-btn").style.display = "inline-block";
  document.getElementById("music-select").style.display = "inline-block";

  if (backsound.paused) {
    backsound.currentTime = 0;
    backsound.play().catch((e) => console.warn("Gagal memutar backsound:", e));
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
}

function startTimer() {
  timerInterval = setInterval(() => {
    timerValue--;
    if (timerValue <= 0) {
      clearInterval(timerInterval);
      gameStarted = false;
      gameEnded = true;
      document.getElementById("restart-btn").style.display = "inline-block";

      // Hentikan lagu jika sedang diputar
      if (currentAudio) {
        currentAudio.pause();
      }
    }
  }, 1000);
}

function startArrowLoop() {
  const spawnInterval = 100;

  setInterval(() => {
    if (!gameStarted || gameEnded) return;

    const now = Date.now();
    const elapsed = now - lastArrowTime;

    if (
      elapsed >=
      Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
    ) {
      let symbol = directions[Math.floor(Math.random() * directions.length)];

      if (symbol === lastSymbol) {
        sameCount++;
        if (sameCount >= 3) {
          const others = directions.filter((dir) => dir !== lastSymbol);
          symbol = others[Math.floor(Math.random() * others.length)];
          sameCount = 1;
        }
      } else {
        sameCount = 1;
      }

      lastSymbol = symbol;

      const x = directionX[symbol];
      arrows.push({
        symbol,
        x,
        y: gameCanvas.height,
        hit: false,
        result: "none",
      });

      lastArrowTime = now;
    }
  }, spawnInterval);
}

async function loop() {
  webcam.update();
  await predict();

  ctxWebcam.drawImage(webcam.canvas, 0, 0, 400, 400);
  drawGameCanvas();
  window.requestAnimationFrame(loop);
}

async function predict() {
  const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
  const prediction = await model.predict(posenetOutput);

  let highest = prediction.reduce((a, b) =>
    a.probability > b.probability ? a : b
  );

  currentPose = highest.probability > 0.75 ? highest.className : "normal";
  document.getElementById("pose-result").textContent = currentPose;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function drawGameCanvas() {
  ctxGame.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Helper for futuristic text
  function drawFuturisticText(
    text,
    x,
    y,
    size = 20,
    color = "#00fff7",
    glow = true,
    align = "center",
    font = "Orbitron, Arial, sans-serif"
  ) {
    ctxGame.save();
    ctxGame.font = `bold ${size}px ${font}`;
    ctxGame.textAlign = align;
    ctxGame.fillStyle = color;
    if (glow) {
      ctxGame.shadowColor = color;
      ctxGame.shadowBlur = 20;
    }
    ctxGame.fillText(text, x, y);
    ctxGame.restore();
  }

  if (!gameStarted && countdownValue === 3 && !gameEnded) {
    drawFuturisticText('Klik "Mulai Bermain"', 200, 170, 22, "#00fff7", true);
    drawFuturisticText("untuk mulai", 200, 200, 22, "#00fff7", true);

    return;
  }

  if (!gameStarted && countdownValue > 0 && !gameEnded) {
    drawFuturisticText(countdownValue, 200, 200, 90, "#00fff7", true);
    return;
  }

  if (gameEnded) {
    soundEffects.finish.play();

    const reason = totalMisses >= maxMisses ? "Game Over!" : "Waktu Habis!";
    drawFuturisticText(reason, 200, 200, 32, "#ff00c8", true);
    drawFuturisticText("Skor Akhir: " + score, 200, 250, 28, "#00fff7", true);
    return;
  }

  // Draw futuristic target lines
  ctxGame.save();
  ctxGame.strokeStyle = "#00fff7";
  ctxGame.shadowColor = "#00fff7";
  ctxGame.shadowBlur = 10;
  ctxGame.lineWidth = 2;
  ctxGame.beginPath();
  ctxGame.moveTo(0, targetY - 15);
  ctxGame.lineTo(gameCanvas.width, targetY - 15);
  ctxGame.moveTo(0, targetY + 20);
  ctxGame.lineTo(gameCanvas.width, targetY + 20);
  ctxGame.stroke();
  ctxGame.restore();

  directions.forEach((symbol) => {
    const x = directionX[symbol];
    ctxGame.drawImage(
      arrowImages[symbol],
      Math.floor(x - 25),
      Math.floor(targetY - 25),
      50,
      50
    );
  });

  arrows = arrows.filter((arrow) => {
    arrow.y -= arrowSpeed;

    if (arrow.result === "hit") {
      ctxGame.save();
      ctxGame.beginPath();
      ctxGame.arc(arrow.x, arrow.y, 32, 0, 2 * Math.PI);
      ctxGame.fillStyle = "rgba(0, 255, 89, 0.38)";
      ctxGame.shadowColor = "#00fff7";
      ctxGame.shadowBlur = 20;
      ctxGame.fill();
      ctxGame.restore();
    } else if (arrow.result === "miss") {
      ctxGame.save();
      ctxGame.beginPath();
      ctxGame.arc(arrow.x, arrow.y, 32, 0, 2 * Math.PI);
      ctxGame.fillStyle = "rgba(255, 0, 17, 0.58)";
      ctxGame.shadowColor = "#ff00c8";
      ctxGame.shadowBlur = 20;
      ctxGame.fill();
      ctxGame.restore();
    }

    ctxGame.drawImage(
      arrowImages[arrow.symbol],
      Math.floor(arrow.x - 25),
      Math.floor(arrow.y - 25),
      50,
      50
    );

    if (!arrow.hit && arrow.y < targetY - 45) {
      arrow.hit = true;
      arrow.result = "miss";
      totalMisses++;
      floatingTexts.push({
        text: "Miss",
        x: arrow.x,
        y: arrow.y,
        opacity: 1,
        color: "red",
      });
      playSoundEffect(soundEffects.miss);
    }

    return arrow.y > -50;
  });

  // Futuristic score and timer
  drawFuturisticText("Skor: " + score, 30, 38, 22, "#00fff7", true, "left");
  drawFuturisticText(
    "Waktu: " + formatTime(timerValue),
    370,
    38,
    22,
    "#ff0033",
    true,
    "right"
  );
  drawFuturisticText(
    `Miss: ${totalMisses}/${maxMisses}`,
    200,
    370,
    18,
    "#ff8800",
    true
  );

  // Floating texts
  floatingTexts.forEach((ft, index) => {
    let color, shadow;
    if (ft.color === "red") {
      color = "#ff00c8";
      shadow = "#ff00c8";
    } else {
      color = "#00fff7";
      shadow = "#00fff7";
    }
    ctxGame.save();
    ctxGame.globalAlpha = ft.opacity;
    ctxGame.font = "bold 24px Orbitron, Arial, sans-serif";
    ctxGame.textAlign = "center";
    ctxGame.fillStyle = color;
    ctxGame.shadowColor = shadow;
    ctxGame.shadowBlur = 18;
    ctxGame.fillText(ft.text, ft.x, ft.y);
    ctxGame.restore();
    ft.y -= 2;
    ft.opacity -= 0.1;
    if (ft.opacity <= 0) {
      floatingTexts.splice(index, 1);
    }
  });
}

function playSoundEffect(sound) {
  const clone = sound.cloneNode();
  clone.play();
}

function checkHits() {
  if (!gameStarted || countdownValue > 0 || gameEnded) return;

  const detectionZoneLimit = targetY + 70;
  const candidates = arrows.filter((a) => !a.hit && a.y <= detectionZoneLimit);

  candidates.sort((a, b) => Math.abs(a.y - targetY) - Math.abs(b.y - targetY));

  for (let arrow of candidates) {
    const dy = Math.abs(arrow.y - targetY);
    const expected = directionMap[arrow.symbol];

    if (dy <= 40 && currentPose === expected) {
      arrow.hit = true;
      arrow.result = "hit";
      score++;
      playSoundEffect(soundEffects.hit);

      const messages = ["Perfect!", "Good!", "Nice!"];
      const randomText = messages[Math.floor(Math.random() * messages.length)];
      floatingTexts.push({
        text: randomText,
        x: arrow.x,
        y: arrow.y,
        opacity: 1,
        color: "lime",
      });
      return;
    }

    if (
      arrow.y > targetY + 50 &&
      arrow.y <= detectionZoneLimit &&
      currentPose === expected
    ) {
      arrow.hit = true;
      arrow.result = "miss";
      totalMisses++;
      playSoundEffect(soundEffects.miss);

      floatingTexts.push({
        text: "Too Early!",
        x: arrow.x,
        y: arrow.y,
        opacity: 1,
        color: "red",
      });

      if (totalMisses >= maxMisses) {
        gameEnded = true;
        gameStarted = false;

        // Hentikan lagu
        if (currentAudio) {
          currentAudio.pause();
        }

        // Tampilkan tombol restart
        document.getElementById("restart-btn").style.display = "inline-block";
      }
      return;
    }
  }

  if (totalMisses >= maxMisses) {
    gameEnded = true;
    gameStarted = false;

    // Stop lagu
    if (currentAudio) {
      currentAudio.pause();
    }

    // Tampilkan tombol restart
    document.getElementById("restart-btn").style.display = "inline-block";
  }
}

function selectDifficulty(level) {
  if (level === "easy") {
    arrowSpeed = 6;
    minDelay = 2100;
    maxDelay = 2300;
    soundEffects.button.play();
  } else if (level === "medium") {
    arrowSpeed = 10;
    minDelay = 1900;
    maxDelay = 2000;
    soundEffects.button.play();
  } else if (level === "hard") {
    arrowSpeed = 13;
    minDelay = 800;
    maxDelay = 900;
    soundEffects.button.play();
  }

  // Sembunyikan seleksi kesulitan dan tampilkan game
  document.getElementById("difficulty-selection").style.display = "none";
  document.getElementById("game-box").style.display = "block";
  soundEffects.button.play();
}

document.getElementById("howto-start-btn").addEventListener("click", () => {
  document.getElementById("howto-screen").style.display = "none";
  document.getElementById("difficulty-selection").style.display = "block";
  soundEffects.button.play();
});

// ✅ INISIALISASI SEMUA SAAT HALAMAN DIMUAT
window.addEventListener("load", () => {
  document.getElementById("difficulty-selection").style.display = "none";
  init();
  backsound
    .play()
    .catch((err) => console.warn("Autoplay ditolak oleh browser:", err));

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", resetGame);
});

// Navigasi antar halaman
document.getElementById("welcome-next-btn").addEventListener("click", () => {
  document.getElementById("welcome-screen").style.display = "none";
  document.getElementById("howto-screen").style.display = "block";
  document.getElementById("difficulty-selection").style.display = "none";
  soundEffects.button.play();
});
