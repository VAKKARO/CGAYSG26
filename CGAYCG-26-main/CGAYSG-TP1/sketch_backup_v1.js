/**
 * Arte Cinético y Lumínico - Inspirado en Gyula Kosice
 * Fase 5.00: Control por Micrófono y Análisis de Frecuencias (Respaldo)
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

// Temporizadores para mantener la vibración tras un disparo sónico corto
let neonTrembleUntil = 0;
let pinsTrembleUntil = 0;

// Contadores de frames consecutivos sobre los umbrales
let consecutiveBassHighFrames = 0;
let consecutiveTrebleFrames = 0;
let consecutiveAnyFrames = 0;

// Umbrales calibrados por defecto (ajustables según sensibilidad)
const THRESHOLD_BASS_HIGH = 140; // Sonido grave fuerte (aplauso/golpe)
const THRESHOLD_TREBLE = 45;     // Sonido agudo (chasquido/silbido)
const THRESHOLD_ANY = 15;        // Cualquier sonido (voz/ruido general)




function setup() {
  let canvas = createCanvas(640, 480);
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
    text("Guía de Interacciones por Micrófono y Duración:", lx, ly);
    fill(130);
    text("• Sonido grave de alta amplitud (1 a 2 segundos): Vibra neón", lx, ly + 18);
    text("• Sonido de baja amplitud (1 a 2 segundos): Vibran pines LED", lx, ly + 32);
    text("• Silbido agudo de alta amplitud (4 a 5 segundos): Contracción fija", lx, ly + 46);
    text("• Diga la palabra \"gluglu\": Activa el flujo de burbujas", lx, ly + 60);
    
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
    
    let bassEnergy = getAverageVolume(audioDataArray, 2, 7); // ~80-300 Hz
    let trebleEnergy = getAverageVolume(audioDataArray, 46, 186); // ~2000-8000 Hz
    let totalEnergy = getAverageVolume(audioDataArray, 0, audioDataArray.length);
    
    let now = millis();
    
    // 1. Detección de Grave de Alta Amplitud (duración 1-2 segundos) -> Vibra neón
    if (bassEnergy > THRESHOLD_BASS_HIGH) {
      if (!isBassSoundActive) {
        bassStartTime = now;
        isBassSoundActive = true;
      }
    } else {
      if (isBassSoundActive) {
        let duration = (now - bassStartTime) / 1000.0;
        if (duration >= 1.0 && duration <= 2.0) {
          neonTrembleUntil = now + 2000; // Vibra por 2 segundos
        }
        isBassSoundActive = false;
      }
    }
    
    // 2. Detección de Sonido de Baja Amplitud (duración 1-2 segundos) -> Vibra pines LED
    if (totalEnergy > THRESHOLD_LOW_AMP_MIN && totalEnergy < THRESHOLD_LOW_AMP_MAX) {
      if (!isLowAmpSoundActive) {
        lowAmpStartTime = now;
        isLowAmpSoundActive = true;
      }
    } else {
      if (isLowAmpSoundActive) {
        let duration = (now - lowAmpStartTime) / 1000.0;
        if (duration >= 1.0 && duration <= 2.0) {
          pinsTrembleUntil = now + 2000; // Vibra por 2 segundos
        }
        isLowAmpSoundActive = false;
      }
    }
    
    // 3. Detección de Agudo de Alta Amplitud (duración 4-5 segundos) -> Contracción fija
    if (trebleEnergy > THRESHOLD_TREBLE_HIGH) {
      if (!isTrebleSoundActive) {
        trebleStartTime = now;
        isTrebleSoundActive = true;
      }
      
      // Feedback visual interactivo en tiempo real durante el silbido (tras 0.5s)
      let elapsed = (now - trebleStartTime) / 1000.0;
      if (elapsed > 0.5) {
        let progress = min(elapsed / 4.0, 1.0);
        globalLengthMod = lerp(1.0, 0.2, progress);
        isInteractingLength = true;
      }
    } else {
      if (isTrebleSoundActive) {
        let duration = (now - trebleStartTime) / 1000.0;
        if (duration >= 4.0 && duration <= 5.0) {
          contractionHoldUntil = now + 3000; // Mantiene la contracción por 3 segundos
        }
        isTrebleSoundActive = false;
      }
    }
  }
  
  // Si está activo el congelamiento de contracción
  if (millis() < contractionHoldUntil) {
    globalLengthMod = 0.2;
    isInteractingLength = true;
  }
  
  // Fallback Físico - Tecla 0: Acortar
  if (keyIsDown(48) || keyIsDown(96)) {
    globalLengthMod -= 0.025;
    if (globalLengthMod < 0.2) globalLengthMod = 0.2;
    isInteractingLength = true;
  }
  
  // Retorno elástico al estado original
  if (!isInteractingLength) {
    globalLengthMod += (1.0 - globalLengthMod) * 0.1;
  }
  
  for (let b of blocks) {
    b.draw();
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
    const bufferLength = analyser.frequencyBinCount;
    audioDataArray = new Uint8Array(bufferLength);
    
    microphoneStream.connect(analyser);
    audioInitialized = true;
    
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
      // Detectar variaciones de la palabra "gluglu"
      if (transcript.includes("gluglu") || transcript.includes("glu glu")) {
        bubbleMoveUntil = millis() + 4000; // Mueve burbujas por 4 segundos
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

function generarComposicion() {
  randomSeed(1805); 
  
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
  doublePins.push(true); // default initialization fallback matching original logic
  doublePins = doublePins.slice(0, totalTarget);
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
    fill(255);
    drawingContext.shadowBlur = 8;
    drawingContext.shadowColor = 'rgba(255, 255, 255, 0.9)';
    
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
    let edgeAlpha = 180;
    let rEdge = red(cBase) * 0.4;
    let gEdge = green(cBase) * 0.4;
    let bEdge = blue(cBase) * 0.4;
    let cEdgeStr = `rgba(${rEdge}, ${gEdge}, ${bEdge}, ${edgeAlpha/255})`;
    let cCenterStr = `rgba(${min(red(cBase)+100, 255)}, ${min(green(cBase)+100, 255)}, ${min(blue(cBase)+100, 255)}, 1)`;
    
    grad.addColorStop(0, cEdgeStr);
    grad.addColorStop(0.5, cCenterStr);
    grad.addColorStop(1, cEdgeStr);
    
    drawingContext.shadowBlur = 60;
    drawingContext.shadowColor = this.color.toString();
    drawingContext.fillStyle = grad;
    noStroke();
    
    rectMode(CENTER);
    rect(0, 0, currentW, currentH);
    
    drawingContext.shadowBlur = 0;
    drawingContext.save();
    rect(0, 0, currentW, currentH); 
    drawingContext.clip();
    
    let isMoving = keyIsDown(75) || millis() < bubbleMoveUntil;
    
    for(let b of this.bubbles) {
      if (isMoving) {
        if (this.isVertical) {
          b.y -= b.speed; 
          b.x += sin(frameCount * b.wobbleSpeed + b.wobbleOffset) * b.wobbleAmp;
          if (b.y < -currentH / 2 - b.r) b.y = currentH / 2 + b.r; 
        } else {
          b.x -= b.speed; 
          b.y += sin(frameCount * b.wobbleSpeed + b.wobbleOffset) * b.wobbleAmp;
          if (b.x < -currentW / 2 - b.r) b.x = currentW / 2 + b.r;
        }
      }
      
      if (this.isVertical && b.y < -currentH / 2 - b.r) b.y = currentH / 2 + b.r;
      if (!this.isVertical && b.x < -currentW / 2 - b.r) b.x = currentW / 2 + b.r;
      
      let rX = this.isVertical ? b.r : b.r * 1.3;
      let rY = this.isVertical ? b.r * 1.3 : b.r;
      
      strokeWeight(1.5);
      stroke(255, 255, 255, 200);
      noFill();
      ellipse(b.x, b.y, rX, rY);
      
      strokeWeight(3);
      stroke(255, 255, 255, 120);
      arc(b.x, b.y, rX * 0.8, rY * 0.8, 0, PI);
      
      noStroke();
      fill(255, 255, 255, 255);
      ellipse(b.x - rX * 0.25, b.y - rY * 0.25, rX * 0.25, rY * 0.25);
    }
    
    drawingContext.restore();
    pop(); 
    pop(); 
  }
}
