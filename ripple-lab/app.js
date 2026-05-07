const phone = document.querySelector(".phone");
const wallpaper = document.querySelector(".wallpaper");
const canvas = document.querySelector("#rippleCanvas");
const trigger = document.querySelector("#triggerRipple");
const context = canvas.getContext("2d", { alpha: true });

const source = new Image();
source.src = "../screen.jpg";

let startedAt = -4000;
let animationFrame = null;
let sourceReady = false;

const settings = {
  coverage: 0.38,
  duration: 2200,
  frontSpeed: 0.78,
  wavelength: 0.22,
  bandWidth: 0.035,
  strength: 0.075,
  viscosity: 0.92,
  gridColumns: 70,
  gridRows: 86,
};

source.addEventListener("load", () => {
  sourceReady = true;
  resize();
  render(performance.now());
});

function resize() {
  const rect = phone.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
}

function triggerRipple() {
  if (!sourceReady) {
    source.addEventListener("load", triggerRipple, { once: true });
    return;
  }
  startedAt = performance.now();
  phone.classList.add("rippling");
  if (animationFrame === null) {
    animationFrame = window.requestAnimationFrame(render);
  }
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function getPulse(age) {
  const progress = Math.min(1, age / settings.duration);
  const attack = Math.min(1, age / 90);
  const decay = Math.pow(1 - progress, 1.08);
  return Math.sin(attack * Math.PI * 0.5) * decay;
}

function sampleWallpaper(sx, sy, sw, sh, dx, dy, dw, dh) {
  context.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
}

function render(time) {
  animationFrame = null;
  resize();
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (!sourceReady) return;

  const age = time - startedAt;
  const pulse = getPulse(age);
  const active = pulse > 0.006;

  if (active) {
    drawRipple(time, age, pulse);
    animationFrame = window.requestAnimationFrame(render);
  } else {
    phone.classList.remove("rippling");
  }
}

function drawRipple(time, age, pulse) {
  const width = canvas.width;
  const height = canvas.height;
  const coverHeight = Math.round(height * settings.coverage);
  const columns = settings.gridColumns;
  const rows = settings.gridRows;
  const tileW = width / columns;
  const tileH = coverHeight / rows;
  const imageScaleX = source.width / width;
  const imageScaleY = source.height / height;

  const progress = Math.min(1, age / settings.duration);
  const waveFront = easeOutCubic(progress) * settings.frontSpeed;
  const centerX = 0.5;
  const centerY = -0.035;
  const aspect = width / coverHeight;

  context.save();
  context.globalCompositeOperation = "source-over";

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x = col * tileW;
      const y = row * tileH;
      const u = (x + tileW * 0.5) / width;
      const v = (y + tileH * 0.5) / coverHeight;
      const dx = (u - centerX) * aspect * 0.58;
      const dy = v - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const ringDistance = distance - waveFront;
      const ring = Math.exp(-(ringDistance * ringDistance) / settings.bandWidth);
      const secondary = Math.exp(-Math.pow(distance - waveFront * 0.58, 2) / (settings.bandWidth * 2.4));
      const wake = Math.exp(-Math.pow(distance - waveFront * 0.34, 2) / (settings.bandWidth * 4.8));
      const oscillation = Math.sin((distance - waveFront) / settings.wavelength * Math.PI * 2);
      const topEnergy = Math.pow(1 - v, 0.55);
      const fadeDown = 1 - smoothstep(0.78, 1, v);
      const energy = pulse * topEnergy * fadeDown * (ring + secondary * 0.5 + wake * 0.22);

      const normalX = dx / Math.max(distance, 0.0001);
      const normalY = dy / Math.max(distance, 0.0001);
      const refract = oscillation * energy * settings.strength;
      const shimmer = Math.sin(u * 18 + time * 0.0013) * Math.sin(v * 7 - time * 0.0009) * 0.012 * energy;

      const offsetX = (normalX * refract + shimmer) * width;
      const offsetY = (normalY * refract * settings.viscosity) * coverHeight;
      const sx = Math.max(0, (x - offsetX) * imageScaleX);
      const sy = Math.max(0, (y - offsetY) * imageScaleY);
      const sw = Math.min(source.width - sx, (tileW + 1.5) * imageScaleX);
      const sh = Math.min(source.height - sy, (tileH + 1.5) * imageScaleY);

      sampleWallpaper(sx, sy, sw, sh, x, y, tileW + 1.5, tileH + 1.5);
    }
  }

  drawRefractionLight(width, coverHeight, waveFront, pulse);
  context.restore();
}

function drawRefractionLight(width, coverHeight, waveFront, pulse) {
  const cx = width * 0.5;
  const cy = -coverHeight * 0.035;
  const radius = coverHeight * (waveFront + 0.1);

  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = pulse * 0.62;

  const glow = context.createRadialGradient(cx, cy, 0, cx, cy, coverHeight * 0.92);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.55)");
  glow.addColorStop(0.18, "rgba(218, 255, 244, 0.28)");
  glow.addColorStop(0.56, "rgba(205, 230, 255, 0.12)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, coverHeight);

  context.globalAlpha = pulse * 0.5;
  context.lineWidth = Math.max(1, width * 0.008);
  context.strokeStyle = "rgba(255, 255, 255, 0.72)";
  context.beginPath();
  context.ellipse(cx, cy, radius * 1.72, radius * 0.74, 0, 0, Math.PI * 2);
  context.stroke();

  context.globalAlpha = pulse * 0.28;
  context.lineWidth = Math.max(1, width * 0.005);
  context.strokeStyle = "rgba(198, 255, 238, 0.72)";
  context.beginPath();
  context.ellipse(cx, cy, radius * 1.24, radius * 0.52, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function smoothstep(edge0, edge1, value) {
  const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

window.addEventListener("resize", resize);
trigger.addEventListener("click", triggerRipple);
phone.addEventListener("click", triggerRipple);

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" && event.key !== " " && event.key !== "Spacebar") return;
  event.preventDefault();
  triggerRipple();
});

window.addEventListener("load", () => {
  resize();
  window.focus();
});
