/**
 * Arte Cinético y Lumínico - Inspirado en Gyula Kosice
 * Fase 5.00: Control por Micrófono y Análisis de Frecuencias
 */

const MADI_COLORS = [
  '#FF0055', // Rosa Neón
  '#7000FF', // Violeta Profundo
  '#FFCC00', // Amarillo Eléctrico
  '#FFFFFF', // Blanco puro
  '#00A8FF'  // Celeste Neón
];

let blocks = [];
let globalLengthMod = 1.0; 
let bubbleMoveUntil = 0;

// Variables globales para el análisis de sonido (Web Audio API)
let audioCtx = null;
let analyser = null;
let microphoneStream = null;
let audioDataArray = null;
let audioInitialized = false;
let audioInitializationError = null;

// Temporizadores para mantener la interacción activa tras un disparo sónico
let neonTrembleUntil = 0;
let pinsTrembleUntil = 0;

// Estado exclusivo de sonido activo (NONE, NEON, PINS, CONTRACTION)
let activeSoundType = "NONE";
let soundStartTime = 0;

// Variables globales para el análisis de frecuencia (nuevos disparadores)
let whistleActive = false; // Silbidos (frecuencias agudas)
let hissActive = false;    // Siseos (frecuencias medias-altas)
let buzzActive = false;    // Zumbidos (frecuencias graves)

// Variables para el respaldo acústico (peak detection) del ritmo vocal "gluglu"
let isGluPeakActive = false;
let gluPeakStartTime = 0;
let lastGluPeakTime = 0;

// Variables para el sistema de silencio y desvanecimiento
let lastSoundTime = 0;
let isFadedOut = false;
let globalAlphaMod = 1.0;
const THRESHOLD_SILENCE = 28; // Elevado de 15 a 28 para ignorar ruidos constantes (como ventilador de notebook)
let consecutiveSoundFrames = 0; // Para filtrar ruidos cortos imprevistos (clics, teclado)

// Umbrales calibrados para los disparadores de audio
const THRESHOLD_SILBIDO = 130;     // Umbral para silbido (Contracción)
const THRESHOLD_GRAVE = 100;       // Umbral para grave medio (Vibración de Neón, rebajado a 100 para voz)
const THRESHOLD_SISEO = 40;        // Umbral mínimo para siseo (Vibración de Pines, sin límite superior)

let showDebug = false;             // Mostrar panel de depuración en tiempo real por defecto





function setup() {
  let canvas = createCanvas(960, 720);
  // Centrar el lienzo en el cuerpo de la página
  canvas.parent(document.body);
  generarComposicion();
}

function draw() {
  // 1. Mostrar overlay si el audio no está inicializado
  if (!audioInitialized) {
    background(10, 10, 12);
    
    // Grilla decorativa en background (estética Madi/Kosice)
    stroke(255, 255, 255, 15);
    strokeWeight(1);
    for (let x = 0; x < width; x += 40) line(x, 0, x, height);
    for (let y = 0; y < height; y += 40) line(0, y, width, y);
    
    // Título principal
    noStroke();
    textAlign(CENTER, CENTER);
    textFont('sans-serif');
    
    // Marco exterior neón para el canvas de museo
    stroke('#00A8FF');
    strokeWeight(2);
    noFill();
    rectMode(CENTER);
    rect(width/2, height/2, width - 4, height - 4);
    
    noStroke();
    textSize(26);
    textStyle(BOLD);
    fill('#00A8FF'); // Celeste Neón
    text("KOSICE - RELIEVES LUMÍNICOS", width / 2, height / 2 - 80);
    
    textSize(14);
    textStyle(NORMAL);
    fill(180);
    text("Proyecto de Arte Hidrocinético e Interactivo", width / 2, height / 2 - 40);
    
    // Botón / Instrucción
    fill(20, 20, 25);
    stroke(255, 255, 255, 50);
    strokeWeight(1);
    rect(width / 2, height / 2 + 30, 340, 56, 8);
    
    noStroke();
    fill('#FF0055'); // Rosa Neón
    textSize(14);
    textStyle(BOLD);
    text("HAGA CLICK PARA INICIAR MICRÓFONO", width / 2, height / 2 + 30);
    
    // Instrucciones de interacción
    textStyle(NORMAL);
    textAlign(LEFT, TOP);
    let lx = width / 2 - 210;
    let ly = height / 2 + 85;
    
    textSize(11);
    fill(160);
    text("Guía de Interacciones por Micrófono (Exclusivas):", lx, ly);
    fill(130);
    text("• Silbido (1000-2000 Hz): Contracción de cilindros en tiempo real", lx, ly + 18);
    text("• Grave medio / Voz (130-470 Hz) de 0.6 a 3s: Vibra neón por 2s", lx, ly + 32);
    text("• Siseo 'Ssss' (3000-8000 Hz) de 0.6 a 3s: Vibran pines LED por 2s", lx, ly + 46);
    text("• Decir \"gluglu\" (o dos golpes de voz rápidos): Activa burbujas por 4s", lx, ly + 60);
    
    if (audioInitializationError) {
      textAlign(CENTER, CENTER);
      fill('#FF0055');
      textSize(12);
      text("Error: Permiso denegado o micrófono no disponible.\n(" + audioInitializationError + ")", width / 2, height / 2 + 185);
    }
    return;
  }
  
  background(10, 10, 12); 
  
  let isInteractingLength = false;
  
  // Procesamiento de audio en tiempo real
  if (audioInitialized && analyser) {
    analyser.getByteFrequencyData(audioDataArray);
    
    // Separación física en bins disjuntos y audibles para evitar solapamientos
    let energyZumbido = getAverageVolume(audioDataArray, 3, 11);   // 130-470 Hz (Grave medio / Voz humana)
    let energySilbido = getAverageVolume(audioDataArray, 23, 47);  // 1000-2000 Hz (Silbido puro)
    let energySiseo = getAverageVolume(audioDataArray, 70, 187);   // 3000-8000 Hz (Siseo de fricción "Ssss")
    let voiceEnergy = getAverageVolume(audioDataArray, 3, 10);    // 150-400 Hz (Voz humana)
    let overallVolume = getAverageVolume(audioDataArray, 0, audioDataArray.length);
    
    let now = millis();
    
    // Detector de silencio / sonido activo (umbrales elevados para filtrar el ruido de fondo constante de ventiladores)
    let isSoundDetected = (overallVolume > THRESHOLD_SILENCE || energyZumbido > 60 || energySilbido > 60 || energySiseo > 30 || voiceEnergy > 55);
    
    if (isSoundDetected) {
      lastSoundTime = now;
      if (isFadedOut) {
        consecutiveSoundFrames++;
        if (consecutiveSoundFrames > 12) { // Requiere ~200ms de sonido sostenido (evita clics accidentales de mouse/teclado)
          generarComposicion(false); // Regenerar con formas aleatorias
          isFadedOut = false;
          consecutiveSoundFrames = 0;
          console.log("[Silence System]: Sonido sostenido detectado. Regenerando obra de forma aleatoria.");
        }
      } else {
        consecutiveSoundFrames = 0;
      }
    } else {
      consecutiveSoundFrames = 0;
    }
    
    // Control del modificador de opacidad (desvanecimiento tras 4 segundos de silencio - 50% más rápido)
    if (now - lastSoundTime > 4000) {
      isFadedOut = true;
      globalAlphaMod = max(0.0, globalAlphaMod - 0.033); // Se desvanece un 50% más rápido
    } else {
      globalAlphaMod = min(1.0, globalAlphaMod + 0.06); // Reaparece rápidamente (menos latencia de respuesta)
    }
    
    // REGLA DE PRIORIDAD: Si las burbujas están activas por voz/K, suprimimos otras detecciones
    let isSpeechActive = (now < bubbleMoveUntil);
    if (isSpeechActive) {
      activeSoundType = "NONE";
    }
    
    // DETECTOR DE RUIDO DE BANDA ANCHA INTELIGENTE
    // Consideramos ruido si múltiples bandas están activas al mismo tiempo, a menos que 
    // haya un tono voluntario dominante y claro.
    let isNoise = false;
    let bandsActive = 0;
    if (energyZumbido > THRESHOLD_SISEO) bandsActive++;
    if (energySilbido > THRESHOLD_SISEO) bandsActive++;
    if (energySiseo > THRESHOLD_SISEO) bandsActive++;
    
    if (bandsActive >= 2) {
      // Definimos si hay un tono dominante claro frente a las demás bandas
      // El silbido es dominante si supera su umbral y los graves de fondo están controlados (< 90)
      let isDominantSilbido = (energySilbido > THRESHOLD_SILBIDO && energyZumbido < 90);
      // El grave es dominante si supera su umbral y los silbidos están controlados (< 90)
      let isDominantZumbido = (energyZumbido > THRESHOLD_GRAVE && energySilbido < 90);
      // El siseo es dominante si supera su umbral mínimo y no hay energía alta en graves ni en silbidos (ambos < 80)
      let isDominantSiseo = (energySiseo > THRESHOLD_SISEO && energyZumbido < 80 && energySilbido < 80);
      
      // Si no hay ninguna banda dominante y clara, se considera ruido de banda ancha (roces, clics)
      if (!isDominantSilbido && !isDominantZumbido && !isDominantSiseo) {
        isNoise = true;
      }
    }
    
    // --- 1. DETECTOR ACÚSTICO DE RESPALDO PARA "GLUGLU" ---
    // Detecta dos picos rápidos de voz en un intervalo corto (200-600ms)
    // No bloqueamos por isNoise ni por activeSoundType aquí, porque la voz humana es naturalmente de banda ancha (multibanda)
    // y el primer pico 'glu' puede activar transitoriamente otro estado de audio.
    if (!isSpeechActive) {
      if (voiceEnergy > 80) { // Reducido de 95 a 80 para mayor sensibilidad en micrófonos promedio
        if (!isGluPeakActive) {
          gluPeakStartTime = now;
          isGluPeakActive = true;
        }
      } else {
        if (isGluPeakActive) {
          let peakDuration = now - gluPeakStartTime;
          if (peakDuration >= 45 && peakDuration <= 315) { // Duración de sílaba (10% menos latencia)
            let timeGap = now - lastGluPeakTime;
            if (timeGap >= 135 && timeGap <= 540) { // Patrón de doble pico (10% menos latencia)
              bubbleMoveUntil = now + 4000; // Mueve burbujas por 4 segundos
              isSpeechActive = true;
              console.log("[Acoustic Fallback]: Detectado ritmo de 'gluglu'!");
            }
            lastGluPeakTime = now;
          }
          isGluPeakActive = false;
        }
      }
    }
    
    // --- 2. SISTEMA DE EXCLUSIVIDAD (STATE LOCKING) ---
    if (activeSoundType === "NONE" && !isSpeechActive && !isNoise && !isFadedOut) {
      // Intentar activar una nueva interacción de forma mutuamente excluyente
      if (energySilbido > THRESHOLD_SILBIDO) {
        activeSoundType = "CONTRACTION"; // Silbido -> Solo acortar
      } else if (energyZumbido > THRESHOLD_GRAVE) {
        activeSoundType = "NEON";         // Grave medio -> Vibrate cylinders (neon)
        soundStartTime = now;
      } else if (energySiseo > THRESHOLD_SISEO) {
        activeSoundType = "PINS";         // Siseo -> Vibrate pins (LEDs)
        soundStartTime = now;
      }
    }
    
    // Monitorear y resolver el estado activo (solo si no se activaron las burbujas por voz)
    if (!isSpeechActive) {
      if (activeSoundType === "CONTRACTION") {
        if (energySilbido < THRESHOLD_SILBIDO) {
          activeSoundType = "NONE"; // Liberar al silenciar
        } else {
          // Acortar cilindros en tiempo real de forma responsiva mientras silbas
          globalLengthMod -= 0.05;
          if (globalLengthMod < 0.2) globalLengthMod = 0.2;
          isInteractingLength = true;
        }
      } else if (activeSoundType === "NEON") {
        if (energyZumbido < THRESHOLD_GRAVE) {
          let duration = (now - soundStartTime) / 1000.0;
          if (duration >= 0.54 && duration <= 2.7) { // Ventana de detección (10% menos latencia)
            neonTrembleUntil = now + 2000; // Cilindros (neón) vibran por 2s
          }
          activeSoundType = "NONE";
        }
      } else if (activeSoundType === "PINS") {
        if (energySiseo < THRESHOLD_SISEO) {
          let duration = (now - soundStartTime) / 1000.0;
          if (duration >= 0.54 && duration <= 2.7) { // Ventana de detección (10% menos latencia)
            pinsTrembleUntil = now + 2000; // Pines LED vibran por 2s
          }
          activeSoundType = "NONE";
        }
      }
    }
  }
  
  // Fallback Físico - Tecla 0: Acortar (cuenta como entrada de interacción, resetea temporizador de silencio)
  if (keyIsDown(48) || keyIsDown(96)) {
    globalLengthMod -= 0.025;
    if (globalLengthMod < 0.2) globalLengthMod = 0.2;
    isInteractingLength = true;
    lastSoundTime = millis();
  }
  
  // Retorno elástico al estado original (10% más rápido para menor latencia de retorno)
  if (!isInteractingLength) {
    globalLengthMod += (1.0 - globalLengthMod) * 0.11;
  }
  
  for (let b of blocks) {
    b.draw();
  }
  
  // --- PANEL DE DEPURACIÓN SÓNICA ---
  if (audioInitialized && showDebug && audioDataArray) {
    push();
    // Fondo semitransparente oscuro en la esquina superior izquierda
    fill(15, 15, 20, 220);
    stroke('#00A8FF');
    strokeWeight(1);
    rectMode(CORNER);
    rect(10, 10, 260, 155, 6);
    
    // Texto
    noStroke();
    fill(255);
    textSize(10);
    textAlign(LEFT, TOP);
    textStyle(BOLD);
    text("DEPURACIÓN SÓNICA (Tecla 'D' para ocultar)", 18, 18);
    
    textStyle(NORMAL);
    fill(180);
    
    let now = millis();
    let isSpeechActive = (now < bubbleMoveUntil);
    let energyZumbido = getAverageVolume(audioDataArray, 2, 7);
    let energySilbido = getAverageVolume(audioDataArray, 23, 47);
    let energySiseo = getAverageVolume(audioDataArray, 70, 187);
    let voiceEnergy = getAverageVolume(audioDataArray, 3, 10);
    
    // Recalcular isNoise y bandsActive para el panel
    let bandsActive = 0;
    if (energyZumbido > THRESHOLD_SISEO) bandsActive++;
    if (energySilbido > THRESHOLD_SISEO) bandsActive++;
    if (energySiseo > THRESHOLD_SISEO) bandsActive++;
    let isNoise = false;
    if (bandsActive >= 2) {
      let isDominantSilbido = (energySilbido > THRESHOLD_SILBIDO && energyZumbido < 90);
      let isDominantZumbido = (energyZumbido > THRESHOLD_GRAVE && energySilbido < 90);
      let isDominantSiseo = (energySiseo > THRESHOLD_SISEO && energyZumbido < 80 && energySilbido < 80);
      if (!isDominantSilbido && !isDominantZumbido && !isDominantSiseo) {
        isNoise = true;
      }
    }

    text(`• Grave medio (Neón):  ${nfc(energyZumbido, 1)} / ${THRESHOLD_GRAVE}`, 18, 35);
    text(`• Silbido (Contr):     ${nfc(energySilbido, 1)} / ${THRESHOLD_SILBIDO}`, 18, 50);
    text(`• Siseo (Pines):       ${nfc(energySiseo, 1)} / ${THRESHOLD_SISEO}`, 18, 65);
    text(`• Voz (Burbujas):      ${nfc(voiceEnergy, 1)} / 80 (Peak active: ${isGluPeakActive})`, 18, 80);
    
    // Mostrar si se detecta ruido
    if (isNoise) {
      fill('#FF0055');
      text(`• Ruido Detectado: SÍ (${bandsActive} bandas activas)`, 18, 98);
    } else {
      fill('#00A8FF');
      text(`• Ruido Detectado: NO (${bandsActive} bandas activas)`, 18, 98);
    }
    
    fill(255);
    text(`• Estado: ${activeSoundType}`, 18, 115);
    text(`• Burbujas act.: ${isSpeechActive ? "SÍ" : "NO"} (${isSpeechActive ? nfc((bubbleMoveUntil - now)/1000, 1) + "s" : "0s"})`, 18, 130);
    pop();
  }
}

function mousePressed() {
  if (!audioInitialized) {
    initAudio();
  }
}

async function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphoneStream = audioCtx.createMediaStreamSource(stream);
    
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.4; // Reducido de 0.8 para acelerar la reacción sónica (menos latencia)
    const bufferLength = analyser.frequencyBinCount;
    audioDataArray = new Uint8Array(bufferLength);
    
    microphoneStream.connect(analyser);
    audioInitialized = true;
    
    // Inicializar el temporizador de silencio con el tiempo actual
    lastSoundTime = millis();
    
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    
    // Inicializar reconocimiento de voz en paralelo para la palabra "gluglu"
    initSpeechRecognition();
  } catch (err) {
    audioInitializationError = err.message;
  }
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Este navegador no soporta Web Speech API.");
    return;
  }
  
  let recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'es-AR'; // Español rioplatense/latino
  
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      let transcript = event.results[i][0].transcript.toLowerCase();
      console.log("[Reconocedor de Voz Escuchó]:", transcript);
      // Detectar variaciones de la palabra "gluglu" o sílabas asociadas
      if (transcript.includes("gluglu") || transcript.includes("glu glu") || 
          transcript.includes("glu") || transcript.includes("lu") || 
          transcript.includes("gugu") || transcript.includes("globo")) {
        bubbleMoveUntil = millis() + 4000; // Mueve burbujas por 4 segundos
        console.log("¡Disparo de Burbujas Activado por Voz!");
      }
    }
  };
  
  recognition.onend = () => {
    // Mantener la escucha activa de forma continua si el audio general sigue inicializado
    if (audioInitialized) {
      try {
        recognition.start();
      } catch (e) {
        // Ignorar si ya se está inicializando
      }
    }
  };
  
  try {
    recognition.start();
  } catch (e) {
    console.error("No se pudo iniciar el reconocedor de voz:", e);
  }
}

function getAverageVolume(array, start, end) {
  let sum = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    sum += array[i];
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function keyPressed() {
  if (key === 'k' || key === 'K') {
    bubbleMoveUntil = millis() + 1000;
    lastSoundTime = millis(); // Cuenta como entrada de interacción
  }
  if (key === 'd' || key === 'D') {
    showDebug = !showDebug;
    lastSoundTime = millis(); // Cuenta como entrada de interacción
  }
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = floor(random(i + 1));
    let temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

function generarComposicion(useFixedSeed = true) {
  if (useFixedSeed) {
    randomSeed(1805); 
  } else {
    // Generar una semilla aleatoria nueva para re-posicionar los bloques
    randomSeed(floor(random(1000000)));
  }
  
  blocks = [];
  globalLengthMod = 1.0;
  
  let cols = 4; 
  let rows = 3;
  let cellW = width / cols;
  let cellH = height / rows;
  
  let numCells = cols * rows; 
  let totalTarget = 12; 
  
  let orientations = [];
  let matrixSizes = [];
  let dotSizes = []; 
  let longSizes = []; 
  let capPins = []; 
  let longTubes = []; 
  
  for (let i = 0; i < totalTarget / 2; i++) {
    orientations.push(true, false);
    matrixSizes.push(true, false);
    dotSizes.push(true, false); 
    longSizes.push(true, false); 
  }
  
  let doublePins = [];
  for (let i = 0; i < totalTarget; i++) {
     doublePins.push(i < 4); 
     capPins.push(i < floor(totalTarget * 0.3)); 
     longTubes.push(i < floor(totalTarget * 0.2)); 
  }
  
  shuffleArray(orientations);
  shuffleArray(matrixSizes);
  shuffleArray(dotSizes);
  shuffleArray(longSizes);
  shuffleArray(doublePins);
  shuffleArray(capPins);
  shuffleArray(longTubes);
  
  let cells = [];
  for (let i = 0; i < numCells; i++) cells.push(i);
  
  let selectedCells;
  while (true) {
    shuffleArray(cells);
    selectedCells = cells.slice(0, totalTarget);
    break;
  }
  
  let fixedThickness = 72; 
  let blockColors = [];
  for(let i=0; i<totalTarget; i++) {
      blockColors.push(MADI_COLORS[i % MADI_COLORS.length]);
  }
  shuffleArray(blockColors);
  
  for (let i = 0; i < totalTarget; i++) {
    let cellIndex = selectedCells[i];
    let col = cellIndex % cols;
    let row = floor(cellIndex / cols);
    
    let anchorX = col * cellW + cellW / 2;
    let anchorY = row * cellH + cellH / 2;
    
    let isVertical = orientations[i];
    let isLargeMatrix = matrixSizes[i];
    let hasLargeDots = dotSizes[i]; 
    let hasDoublePins = doublePins[i];
    let isLongMatrix = longSizes[i];
    let hasCapPins = capPins[i];
    let isExtraLong = longTubes[i];
    
    let lengthFactor = isExtraLong ? 0.715 : 0.55;
    
    let bw, bh;
    if (isVertical) {
       bw = fixedThickness; 
       bh = cellH * lengthFactor; 
    } else {
       bw = cellW * lengthFactor; 
       bh = fixedThickness;
    }
    
    let c = color(blockColors[i]);
    
    blocks.push(new KosiceBlock(anchorX, anchorY, bw, bh, isVertical, c, isLargeMatrix, hasLargeDots, hasDoublePins, isLongMatrix, hasCapPins, cellW, cellH));
  }
}

class KosiceBlock {
  constructor(x, y, w, h, isVertical, col, isLargeMatrix, hasLargeDots, hasDoublePins, isLongMatrix, hasCapPins, cellW, cellH) {
    this.x = x;
    this.y = y;
    this.baseW = w;
    this.baseH = h;
    this.isVertical = isVertical;
    this.color = col;
    this.isLargeMatrix = isLargeMatrix;
    this.hasLargeDots = hasLargeDots; 
    this.hasDoublePins = hasDoublePins;
    this.isLongMatrix = isLongMatrix;
    this.hasCapPins = hasCapPins;
    
    // Easing de velocidad para movimiento fluido de burbujas
    this.bubbleSpeedFactor = 0.0;
    
    if (this.hasDoublePins && this.hasCapPins) {
       this.hasCapPins = false; 
    }
    
    this.bubbles = [];
    let numBubbles = floor(random(6, 15));
    for (let i = 0; i < numBubbles; i++) {
        let maxDistX = (this.baseW / 2) * 0.7;
        let maxDistY = (this.baseH / 2) * 0.7;
        let bx = random(-maxDistX, maxDistX);
        let by = random(-maxDistY, maxDistY);
        let minR = this.isVertical ? this.baseW * 0.15 : this.baseH * 0.15;
        let maxR = this.isVertical ? this.baseW * 0.5 : this.baseH * 0.5;
        let br = random(minR, maxR);
        let speed = map(br, minR, maxR, 2.16, 6.75); // Conservamos la velocidad aumentada
        this.bubbles.push({
          x: bx, y: by, r: br, 
          speed: speed, wobbleSpeed: random(0.05, 0.15), wobbleOffset: random(0, TWO_PI), wobbleAmp: random(0.2, 0.8)
        });
    }
    
    this.pins = [];
    let pinSide = random() > 0.5 ? 1 : -1;
    
    let dotSpacing = 6; 
    let pinSeparation = 8; 
    
    let colsThickness = this.isLargeMatrix ? 6 : 4; 
    let maxRows = floor((this.isVertical ? this.baseH : this.baseW) / dotSpacing);
    let minRows = colsThickness + 2; 
    
    let rowsToDraw;
    if (this.isLongMatrix) {
        rowsToDraw = maxRows;
    } else {
        rowsToDraw = floor(random(minRows, maxRows - 1)); 
    }
    
    if (this.isVertical) {
       let cols = colsThickness; 
       let rows = rowsToDraw;
       
       let startY;
       if (this.isLongMatrix) {
           startY = -this.baseH/2 + dotSpacing/2; 
       } else {
           if (random() > 0.5) startY = -this.baseH/2 + dotSpacing*2; 
           else startY = this.baseH/2 - (rows * dotSpacing) - dotSpacing*2;
       }
       
       let sides = this.hasDoublePins ? [1, -1] : [pinSide];
       
       for (let side of sides) {
           let startX = (this.baseW / 2 + pinSeparation) * side;
           for (let i = 0; i < cols; i++) {
               for (let j = 0; j < rows; j++) {
                   let px = startX + (i * dotSpacing * side);
                   let py = startY + (j * dotSpacing);
                   this.pins.push({x: px, y: py});
               }
           }
       }
       
       if (this.hasCapPins) {
           let capSide = random() > 0.5 ? 1 : -1; 
           let capCols = this.isLargeMatrix ? 8 : 5; 
           let capRows = 2; 
           
           let cStartY = (this.baseH / 2 + pinSeparation) * capSide;
           let cStartX = - (capCols * dotSpacing) / 2 + dotSpacing / 2; 
           
           for (let i = 0; i < capCols; i++) {
               for (let j = 0; j < capRows; j++) {
                   let px = cStartX + (i * dotSpacing);
                   let py = cStartY + (j * dotSpacing * capSide);
                   this.pins.push({x: px, y: py});
               }
           }
       }
       
    } else {
       let tempCols = rowsToDraw; 
       let tempRows = colsThickness; 
       
       let startX;
       if (this.isLongMatrix) {
           startX = -this.baseW/2 + dotSpacing/2; 
       } else {
           if (random() > 0.5) startX = -this.baseW/2 + dotSpacing*2; 
           else startX = this.baseW/2 - (tempCols * dotSpacing) - dotSpacing*2;
       }
       
       let sides = this.hasDoublePins ? [1, -1] : [pinSide];
       
       for (let side of sides) {
           let startY = (this.baseH / 2 + pinSeparation) * side;
           for (let j = 0; j < tempRows; j++) {
               for (let i = 0; i < tempCols; i++) {
                   let px = startX + (i * dotSpacing);
                   let py = startY + (j * dotSpacing * side);
                   this.pins.push({x: px, y: py});
               }
           }
       }
       
       if (this.hasCapPins) {
           let capSide = random() > 0.5 ? 1 : -1; 
           let capRows = this.isLargeMatrix ? 8 : 5; 
           let capCols = 2; 
           
           let cStartX = (this.baseW / 2 + pinSeparation) * capSide;
           let cStartY = - (capRows * dotSpacing) / 2 + dotSpacing / 2; 
           
           for (let j = 0; j < capRows; j++) {
               for (let i = 0; i < capCols; i++) {
                   let px = cStartX + (i * dotSpacing * capSide);
                   let py = cStartY + (j * dotSpacing);
                   this.pins.push({x: px, y: py});
               }
           }
       }
    }
  }

  draw() {
    push();
    
    // Las figuras vuelven a estar ancladas estáticamente a su posición original
    translate(this.x, this.y);
    
    let currentW, currentH;
    if (this.isVertical) {
       currentW = this.baseW;
       currentH = this.baseH * globalLengthMod;
    } else {
       currentW = this.baseW * globalLengthMod;
       currentH = this.baseH;
    }
    
    let isCylindersTrembling = (millis() < neonTrembleUntil);
    let isPinsTrembling = (millis() < pinsTrembleUntil); 
    
    noStroke();
    fill(255, 255, 255, 255 * globalAlphaMod);
    drawingContext.shadowBlur = 8 * globalAlphaMod;
    drawingContext.shadowColor = `rgba(255, 255, 255, ${0.9 * globalAlphaMod})`;
    
    let dotRadius = this.hasLargeDots ? 3.0 : 1.8; 
    
    for(let p of this.pins) {
      let pinDx = isPinsTrembling ? random(-2.5, 2.5) : 0;
      let pinDy = isPinsTrembling ? random(-2.5, 2.5) : 0;
      circle(p.x + pinDx, p.y + pinDy, dotRadius);
    }
    
    drawingContext.shadowBlur = 0;
    
    push();
    if (isCylindersTrembling) {
       let ctx = random(-4, 4);
       let cty = random(-4, 4);
       translate(ctx, cty);
    }
    
    let grad;
    if (this.isVertical) {
       grad = drawingContext.createLinearGradient(-currentW/2, 0, currentW/2, 0);
    } else {
       grad = drawingContext.createLinearGradient(0, -currentH/2, 0, currentH/2);
    }
    
    let cBase = color(this.color);
    let edgeAlpha = 180 * globalAlphaMod;
    let rEdge = red(cBase) * 0.4;
    let gEdge = green(cBase) * 0.4;
    let bEdge = blue(cBase) * 0.4;
    let cEdgeStr = `rgba(${rEdge}, ${gEdge}, ${bEdge}, ${edgeAlpha/255})`;
    let cCenterStr = `rgba(${min(red(cBase)+100, 255)}, ${min(green(cBase)+100, 255)}, ${min(blue(cBase)+100, 255)}, ${globalAlphaMod})`;
    
    grad.addColorStop(0, cEdgeStr);
    grad.addColorStop(0.5, cCenterStr);
    grad.addColorStop(1, cEdgeStr);
    
    drawingContext.shadowBlur = 60 * globalAlphaMod;
    let shadowCol = color(this.color);
    shadowCol.setAlpha(alpha(shadowCol) * globalAlphaMod);
    drawingContext.shadowColor = shadowCol.toString();
    drawingContext.fillStyle = grad;
    noStroke();
    
    rectMode(CENTER);
    rect(0, 0, currentW, currentH);
    
    drawingContext.shadowBlur = 0;
    drawingContext.save();
    rect(0, 0, currentW, currentH); 
    drawingContext.clip();
    
    let isMoving = keyIsDown(75) || millis() < bubbleMoveUntil;
    let targetSpeedFactor = isMoving ? 1.0 : 0.0;
    
    // Easing de la velocidad para aceleración y desaceleración fluidas (hidrodinámicas)
    this.bubbleSpeedFactor += (targetSpeedFactor - this.bubbleSpeedFactor) * 0.08;
    
    for(let b of this.bubbles) {
      if (this.bubbleSpeedFactor > 0.001) {
        // Ondulación armónica doble para simular corrientes de agua más naturales
        let wobble = (sin(frameCount * b.wobbleSpeed + b.wobbleOffset) + cos(frameCount * b.wobbleSpeed * 0.5)) * b.wobbleAmp * 0.7;
        if (this.isVertical) {
          b.y -= b.speed * this.bubbleSpeedFactor; 
          b.x += wobble * this.bubbleSpeedFactor;
          if (b.y < -currentH / 2 - b.r) b.y = currentH / 2 + b.r; 
        } else {
          b.x -= b.speed * this.bubbleSpeedFactor; 
          b.y += wobble * this.bubbleSpeedFactor;
          if (b.x < -currentW / 2 - b.r) b.x = currentW / 2 + b.r;
        }
      }
      
      if (this.isVertical && b.y < -currentH / 2 - b.r) b.y = currentH / 2 + b.r;
      if (!this.isVertical && b.x < -currentW / 2 - b.r) b.x = currentW / 2 + b.r;
      
      let rX = this.isVertical ? b.r : b.r * 1.3;
      let rY = this.isVertical ? b.r * 1.3 : b.r;
      
      strokeWeight(1.5);
      stroke(255, 255, 255, 200 * globalAlphaMod);
      noFill();
      ellipse(b.x, b.y, rX, rY);
      
      strokeWeight(3);
      stroke(255, 255, 255, 120 * globalAlphaMod);
      arc(b.x, b.y, rX * 0.8, rY * 0.8, 0, PI);
      
      noStroke();
      fill(255, 255, 255, 255 * globalAlphaMod);
      ellipse(b.x - rX * 0.25, b.y - rY * 0.25, rX * 0.25, rY * 0.25);
    }
    
    drawingContext.restore();
    pop(); 
    pop(); 
  }
}
