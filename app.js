const phone = document.querySelector(".phone");
const rippleCanvas = document.querySelector("#rippleCanvas");
const cardSpace = document.querySelector("#cardSpace");
const stageLabel = document.querySelector("#stageLabel");
const proximityTrigger = document.querySelector("#proximityTrigger");
const shareHint = document.querySelector("#shareHint");
const sentTitle = document.querySelector("#sentTitle");

const focusSlotOrder = ["front", "left", "right", "back"];

const defaultCards = [
  {
    id: "dawn",
    label: "圆脸憨憨",
    "sub-label": "主题",
    "label-fill": "white",
    image: "./assets/cards/theme.svg",
    pose: {
      x: "calc(-50% - 75px)",
      y: "calc(-50% - 180px)",
      z: "-26px",
      r: "-16deg",
      rx: "12deg",
      ry: "20deg",
      s: 0.77,
      blur: "1.2px",
      fade: 0.86,
      sat: 0.98,
      parallax: 9,
    },
  },
  {
    id: "blue-planet",
    label: "Eve Chris",
    "sub-label": "181 7446 8740",
    "label-fill": "white",
    image: "./assets/cards/contact.svg",
    pose: {
      x: "calc(-50% - 50px)",
      y: "calc(-50% - 50px)",
      z: "86px",
      r: "-6deg",
      rx: "0deg",
      ry: "0deg",
      s: 1.02,
      blur: "0px",
      fade: 1,
      sat: 1.04,
      parallax: 14,
    },
  },
  {
    id: "nebula",
    label: "WLAN",
    "sub-label": "Huawei-guest",
    "label-fill": "white",
    image: "./assets/cards/wifi.svg",
    pose: {
      x: "calc(-50% + 92px)",
      y: "calc(-50% - 122px)",
      z: "-128px",
      r: "9deg",
      rx: "0deg",
      ry: "0deg",
      s: 0.73,
      blur: "2.7px",
      fade: 0.51,
      sat: 0.8,
      parallax: 4,
    },
  },
  {
    id: "aurora",
    label: "",
    "sub-label": "",
    "label-fill": "",
    image: "./assets/cards/精彩瞬间2.svg",
    pose: {
      x: "calc(-50% + 87px)",
      y: "calc(-50% + 172px)",
      z: "-86px",
      r: "11deg",
      rx: "0deg",
      ry: "0deg",
      s: 0.56,
      blur: "5.5px",
      fade: 0.62,
      sat: 0.86,
      parallax: 6,
    },
  },
];

const defaultFocusLayout = {
  front: {
    label: "前景",
    x: 0,
    y: -62,
    z: 190,
    r: 0,
    rx: 0,
    ry: 0,
    s: 1.06,
    blur: 0,
    fade: 1,
    sat: 1.04,
  },
  left: {
    label: "左侧",
    x: -132,
    y: -80,
    z: -34,
    r: 8,
    rx: 0,
    ry: 45,
    s: 0.76,
    blur: 1.6,
    fade: 0.72,
    sat: 0.82,
  },
  right: {
    label: "右侧",
    x: 132,
    y: -80,
    z: -34,
    r: -8,
    rx: 0,
    ry: -45,
    s: 0.76,
    blur: 1.6,
    fade: 0.72,
    sat: 0.82,
  },
  back: {
    label: "后方",
    x: 0,
    y: -200,
    z: -138,
    r: 0,
    rx: 16,
    ry: 0,
    s: 0.66,
    blur: 3.2,
    fade: 0.58,
    sat: 0.82,
  },
};

let cards = normalizeCards(defaultCards);
let focusLayout = normalizeFocusLayout(defaultFocusLayout);

let state = 3;
let activeIndex = null;
let dragStartX = 0;
let dragStartY = 0;
let dragDeltaX = 0;
let dragDeltaY = 0;
let parallaxX = 0;
let parallaxY = 0;
let isDragging = false;
let isMouseDragging = false;
let isSent = false;
let introTimer = null;
let sentResetTimer = null;
let ripplePulseStartedAt = -2000;
let rippleRenderer = null;
let rippleScene = null;
let rippleCamera = null;
let rippleMaterial = null;
let rippleThree = null;
let rippleReady = false;
let pendingRipplePulse = false;
let imuEnabled = false;

const THREE_MODULE_URL = "./vendor/three.module.js";
const RIPPLE_TO_BLUR_DELAY_MS = 1450;
const BACKGROUND_BLUR_DURATION_MS = 1000;
const INTRO_DURATION_MS = RIPPLE_TO_BLUR_DELAY_MS + BACKGROUND_BLUR_DURATION_MS;
const rippleSettings = {
  bendScale: 0.16,
  shearScale: 0.16,
  lightScale: 0.10,
  chromaScale: 0.56,
  speedScale: 0.64,
  coverage: 0.58,
  baseBrightness: 1,
  gamma: 0.46,
  shadowScale: 0.34,
};
const backgroundSettings = {
  backgroundBlur: 16,
  backgroundBrightness: 0.78,
  backgroundSaturation: 0.88,
};

const rippleVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const rippleFragmentShader = `
  precision highp float;

  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uPulseAge;
  uniform float uPulse;
  uniform float uCanvasRatio;
  uniform float uBendScale;
  uniform float uShearScale;
  uniform float uLightScale;
  uniform float uChromaScale;
  uniform float uSpeedScale;
  uniform float uCoverage;
  uniform float uBaseBrightness;
  uniform float uGamma;
  uniform float uShadowScale;
  varying vec2 vUv;

  float softRing(float distanceToHit, float radius, float width) {
    float delta = abs(distanceToHit - radius);
    return exp(-(delta * delta) / max(width, 0.0001));
  }

  float arcMask(vec2 p) {
    float sideFade = smoothstep(0.86, 0.08, abs(p.x));
    float bottomFade = smoothstep(1.04, 0.34, p.y);
    return sideFade * bottomFade;
  }

  void main() {
    vec2 screenUv = vec2(vUv.x, 1.0 - vUv.y);
    float fromTop = screenUv.y;
    vec2 p = vec2((screenUv.x - 0.5) * uCanvasRatio * 1.12, fromTop + 0.055);
    float d = length(p);

    float age = min(uPulseAge, 1.8);
    float front = 0.08 + age * 0.52 * uSpeedScale;
    float mainRing = softRing(d, front, 0.004);
    float fatRing = softRing(d, front, 0.02);
    float wakeA = softRing(d, front * 0.7, 0.03);
    float wakeB = softRing(d, front * 0.42, 0.048);
    float signedWave = sin((d - front) * 62.0);
    float waveTrain = signedWave * 0.5 + 0.5;
    float longRipple = waveTrain * softRing(d, front * 0.82, 0.18);

    float verticalMask = smoothstep(-0.02, 0.08, fromTop) * smoothstep(uCoverage, max(0.08, uCoverage - 0.36), fromTop);
    float mask = arcMask(p) * verticalMask;
    float caustic = mainRing * 1.6 + fatRing * 0.72 + wakeA * 0.42 + wakeB * 0.2 + longRipple * 0.24;
    float shimmer = sin((screenUv.x * 17.0 + fromTop * 5.0) - uTime * 2.0) * 0.5 + 0.5;
    float glow = smoothstep(0.62, 0.0, d) * 0.12 + caustic * (0.72 + shimmer * 0.2);
    float alpha = clamp(uPulse * mask * glow, 0.0, 0.86);

    vec3 cold = vec3(0.58, 0.86, 1.0);
    vec3 warm = vec3(1.0, 1.0, 0.92);
    vec3 rippleLight = mix(cold, warm, mainRing + fatRing * 0.45) * alpha * uLightScale;

    vec2 radial = normalize(p + vec2(0.0001));
    float bend = uPulse * mask * uBendScale * (
      mainRing * 0.11 +
      fatRing * 0.07 +
      wakeA * 0.045 +
      wakeB * 0.028 +
      signedWave * softRing(d, front * 0.82, 0.2) * 0.045
    );
    vec2 tangent = vec2(-radial.y, radial.x);
    float shear = sin((d - age * 0.32) * 48.0) * uPulse * mask * 0.028 * uShearScale;
    vec2 displacement = radial * bend + tangent * shear;

    vec2 sourceUv = screenUv + vec2(displacement.x, displacement.y * 0.82);
    vec3 original = texture2D(uTexture, clamp(screenUv, 0.001, 0.999)).rgb;
    vec3 refracted = texture2D(uTexture, clamp(sourceUv, 0.001, 0.999)).rgb;
    vec3 redShift = texture2D(uTexture, clamp(sourceUv + displacement * 0.018, 0.001, 0.999)).rgb;
    vec3 blueShift = texture2D(uTexture, clamp(sourceUv - displacement * 0.018, 0.001, 0.999)).rgb;
    refracted.r = mix(refracted.r, redShift.r, uPulse * mask * 0.2 * uChromaScale);
    refracted.b = mix(refracted.b, blueShift.b, uPulse * mask * 0.2 * uChromaScale);

    vec3 corrected = pow(refracted, vec3(uGamma)) * uBaseBrightness;
    float shadowBand = (fatRing * 0.52 + wakeA * 0.28 + longRipple * 0.18) * uPulse * mask;
    float effectStrength = clamp(uPulse * mask + alpha, 0.0, 1.0);
    vec3 effected = corrected * (1.0 - shadowBand * 0.12 * uShadowScale) + rippleLight * 0.5;
    vec3 color = mix(original, effected, effectStrength);

    gl_FragColor = vec4(color, 1.0);
  }
`;

async function setupRippleRenderer() {
  try {
    rippleThree = await import(THREE_MODULE_URL);
    const texture = await createScreenTexture(rippleThree);
    initThreeRipple(rippleThree, texture);
  } catch (error) {
    console.warn("Ripple renderer failed to initialize", error);
  }
}

function createScreenTexture(THREE) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const bitmap = document.createElement("canvas");
        bitmap.width = image.naturalWidth;
        bitmap.height = image.naturalHeight;
        const bitmapContext = bitmap.getContext("2d", { willReadFrequently: true });
        bitmapContext.drawImage(image, 0, 0);

        const pixels = bitmapContext.getImageData(0, 0, bitmap.width, bitmap.height);
        const texture = new THREE.DataTexture(
          pixels.data,
          bitmap.width,
          bitmap.height,
          THREE.RGBAFormat,
          THREE.UnsignedByteType,
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = false;
        texture.flipY = false;
        texture.unpackAlignment = 1;
        texture.needsUpdate = true;
        resolve(texture);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = reject;
    image.src = "./screen2.jpg";
  });
}

function initThreeRipple(THREE, texture) {
  rippleRenderer = new THREE.WebGLRenderer({
    canvas: rippleCanvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  rippleRenderer.setClearColor(0x000000, 0);

  rippleScene = new THREE.Scene();
  rippleCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  rippleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTexture: { value: texture },
      uTime: { value: 0 },
      uPulseAge: { value: 0 },
      uPulse: { value: 0 },
      uCanvasRatio: { value: 1 },
      uBendScale: { value: rippleSettings.bendScale },
      uShearScale: { value: rippleSettings.shearScale },
      uLightScale: { value: rippleSettings.lightScale },
      uChromaScale: { value: rippleSettings.chromaScale },
      uSpeedScale: { value: rippleSettings.speedScale },
      uCoverage: { value: rippleSettings.coverage },
      uBaseBrightness: { value: rippleSettings.baseBrightness },
      uGamma: { value: rippleSettings.gamma },
      uShadowScale: { value: rippleSettings.shadowScale },
    },
    vertexShader: rippleVertexShader,
    fragmentShader: rippleFragmentShader,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rippleMaterial);
  rippleScene.add(mesh);
  resizeRippleCanvas();
  rippleMaterial.uniforms.uTime.value = performance.now() / 1000;
  rippleMaterial.uniforms.uPulseAge.value = 10;
  rippleMaterial.uniforms.uPulse.value = 0;
  rippleRenderer.render(rippleScene, rippleCamera);
  rippleReady = true;
  applyRippleSettingsToShader();
  phone.classList.add("ripple-ready");
  if (pendingRipplePulse) {
    pendingRipplePulse = false;
    startRipplePulse();
  }
  window.addEventListener("resize", resizeRippleCanvas);
  window.requestAnimationFrame(renderRipple);
}

function resizeRippleCanvas() {
  const rect = rippleCanvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  if (!rippleRenderer) return;
  rippleRenderer.setPixelRatio(pixelRatio);
  rippleRenderer.setSize(rect.width, rect.height, false);
  if (rippleMaterial) {
    rippleMaterial.uniforms.uCanvasRatio.value = rect.width / Math.max(rect.height, 1);
  }
}

function applyRippleSettingsToShader() {
  if (!rippleMaterial) return;
  rippleMaterial.uniforms.uBendScale.value = rippleSettings.bendScale;
  rippleMaterial.uniforms.uShearScale.value = rippleSettings.shearScale;
  rippleMaterial.uniforms.uLightScale.value = rippleSettings.lightScale;
  rippleMaterial.uniforms.uChromaScale.value = rippleSettings.chromaScale;
  rippleMaterial.uniforms.uSpeedScale.value = rippleSettings.speedScale;
  rippleMaterial.uniforms.uCoverage.value = rippleSettings.coverage;
  rippleMaterial.uniforms.uBaseBrightness.value = rippleSettings.baseBrightness;
  rippleMaterial.uniforms.uGamma.value = rippleSettings.gamma;
  rippleMaterial.uniforms.uShadowScale.value = rippleSettings.shadowScale;
}

function applyBackgroundSettings() {
  phone.style.setProperty("--background-blur", `${backgroundSettings.backgroundBlur}px`);
  phone.style.setProperty("--background-brightness", backgroundSettings.backgroundBrightness);
  phone.style.setProperty("--background-saturation", backgroundSettings.backgroundSaturation);
}

function startRipplePulse() {
  if (!rippleReady) {
    pendingRipplePulse = true;
    return;
  }
  ripplePulseStartedAt = performance.now();
}

function getRipplePulse(time) {
  const age = Math.max(0, (time - ripplePulseStartedAt) / 1000);
  const attack = Math.min(1, age / 0.08);
  const decay = Math.max(0, 1 - age / 1.45);
  return Math.sin(attack * Math.PI * 0.5) * Math.pow(decay, 1.08);
}

function renderRipple(time) {
  resizeRippleCanvas();
  const age = Math.max(0, (time - ripplePulseStartedAt) / 1000);
  const pulse = getRipplePulse(time);
  rippleMaterial.uniforms.uTime.value = time / 1000;
  rippleMaterial.uniforms.uPulseAge.value = age;
  rippleMaterial.uniforms.uPulse.value = pulse;
  rippleRenderer.render(rippleScene, rippleCamera);
  window.requestAnimationFrame(renderRipple);
}

function normalizeCards(input) {
  const source = Array.isArray(input) && input.length ? input : defaultCards;
  return source.map((card, index) => {
    const fallback = defaultCards[index % defaultCards.length];
    return {
      id: card.id || fallback.id || `card-${index + 1}`,
      label: card.label ?? card.title ?? fallback.label,
      subLabel: card["sub-label"] ?? card.subLabel ?? fallback["sub-label"] ?? "",
      labelFill: card["label-fill"] ?? card.labelFill ?? fallback["label-fill"] ?? "#111317",
      image: card.image || fallback.image,
      pose: {
        ...fallback.pose,
        ...(card.pose || {}),
      },
    };
  });
}

function parsePoseNumber(value, fallback = 0) {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function poseToControlValues(pose) {
  return {
    x: parsePoseNumber(pose.x),
    y: parsePoseNumber(pose.y),
    z: parsePoseNumber(pose.z),
    r: parsePoseNumber(pose.r),
    rx: parsePoseNumber(pose.rx),
    ry: parsePoseNumber(pose.ry),
    s: Number(pose.s ?? 1),
    blur: parsePoseNumber(pose.blur),
    fade: Number(pose.fade ?? 1),
    parallax: Number(pose.parallax ?? 0),
  };
}

function controlValuesToPose(values, currentPose) {
  return {
    ...currentPose,
    x: `calc(-50% ${values.x < 0 ? "-" : "+"} ${Math.abs(values.x)}px)`,
    y: `calc(-50% ${values.y < 0 ? "-" : "+"} ${Math.abs(values.y)}px)`,
    z: `${values.z}px`,
    r: `${values.r}deg`,
    rx: `${values.rx}deg`,
    ry: `${values.ry}deg`,
    s: values.s,
    blur: `${values.blur}px`,
    fade: values.fade,
    parallax: values.parallax,
  };
}

function normalizeFocusLayout(input) {
  return Object.fromEntries(
    focusSlotOrder.map((slot) => {
      const fallback = defaultFocusLayout[slot];
      const source = input?.[slot] || {};
      return [
        slot,
        {
          label: source.label || fallback.label,
          x: Number(source.x ?? fallback.x),
          y: Number(source.y ?? fallback.y),
          z: Number(source.z ?? fallback.z),
          r: Number(source.r ?? fallback.r),
          rx: Number(source.rx ?? fallback.rx),
          ry: Number(source.ry ?? fallback.ry),
          s: Number(source.s ?? fallback.s),
          blur: Number(source.blur ?? fallback.blur),
          fade: Number(source.fade ?? fallback.fade),
          sat: Number(source.sat ?? fallback.sat),
        },
      ];
    }),
  );
}

function focusSlotToPose(slot, overrides = {}) {
  const config = { ...focusLayout[slot], ...overrides };
  return {
    x: `calc(-50% ${config.x < 0 ? "-" : "+"} ${Math.abs(config.x)}px)`,
    y: `calc(-50% ${config.y < 0 ? "-" : "+"} ${Math.abs(config.y)}px)`,
    z: `${config.z}px`,
    r: `${config.r}deg`,
    rx: `${config.rx}deg`,
    ry: `${config.ry}deg`,
    s: config.s,
    blur: `${config.blur}px`,
    fade: config.fade,
    sat: config.sat,
    parallax: 0,
    layer: Math.round(42 + config.z / 8),
  };
}

async function loadFocusLayoutFromJson() {
  if (window.location.protocol === "file:") {
    return;
  }

  try {
    const response = await fetch(`./data/focus-layout.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    focusLayout = normalizeFocusLayout(await response.json());
    renderCards();
  } catch (error) {
    console.info("Using built-in focus layout because focus-layout.json could not be loaded.", error);
  }
}

function escapeCssUrl(url) {
  return String(url).replace(/"/g, "%22").replace(/\\/g, "/");
}

function createCards() {
  cardSpace.innerHTML = "";
  cards.forEach((card, index) => {
    const node = document.createElement("button");
    node.className = "hop-card";
    node.type = "button";
    node.setAttribute("aria-label", card.label || card.subLabel || card.id);
    node.dataset.index = index;
    node.style.setProperty("--card-image", `url("${escapeCssUrl(card.image)}")`);
    node.style.setProperty("--enter-delay", `${index * 70}ms`);
    node.style.setProperty("--label-fill", card.labelFill || "#111317");

    const background = document.createElement("div");
    background.className = "card-bg";
    background.setAttribute("aria-hidden", "true");

    node.append(background);
    if (card.label || card.subLabel) {
      const label = document.createElement("div");
      label.className = `card-label${card.subLabel ? " has-sub-label" : ""}`;
      if (card.label) {
        const labelText = document.createElement("span");
        labelText.className = "card-label-main";
        labelText.textContent = card.label;
        label.append(labelText);
      }
      if (card.subLabel) {
        const subLabelText = document.createElement("span");
        subLabelText.className = "card-label-sub";
        subLabelText.textContent = card.subLabel;
        label.append(subLabelText);
      }
      node.append(label);
    }
    node.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (activeIndex !== null) {
        beginCardDrag(event);
        event.stopPropagation();
      }
    });
    node.addEventListener("mousedown", (event) => {
      event.preventDefault();
      if (activeIndex !== null) {
        beginMouseCardDrag(event);
        event.stopPropagation();
      }
    });
    node.addEventListener("click", () => focusCard(index));
    cardSpace.appendChild(node);
  });
  renderCards();
}

function setCardVars(node, pose) {
  const parallax = pose.parallax ?? 0;
  node.style.setProperty("--x", pose.x);
  node.style.setProperty("--y", pose.y);
  node.style.setProperty("--z", pose.z);
  node.style.setProperty("--r", pose.r);
  node.style.setProperty("--rx", pose.rx ?? "0deg");
  node.style.setProperty("--ry", pose.ry ?? "0deg");
  node.style.setProperty("--s", pose.s);
  node.style.setProperty("--blur", pose.blur ?? "0px");
  node.style.setProperty("--fade", pose.fade ?? 1);
  node.style.setProperty("--sat", pose.sat ?? 1);
  node.style.setProperty("--px", `${parallaxX * parallax}px`);
  node.style.setProperty("--py", `${parallaxY * parallax * 0.72}px`);
  node.style.zIndex = pose.layer;
}

function renderCards() {
  const nodes = [...document.querySelectorAll(".hop-card")];
  nodes.forEach((node, index) => {
    node.classList.toggle("active", activeIndex === index);
    node.classList.toggle("back", activeIndex !== null && activeIndex !== index);

    if (activeIndex === null) {
      setCardVars(node, { ...cards[index].pose, layer: 42 + Math.round((cards[index].pose.parallax ?? index) * 2) });
      return;
    }

    const relative = circularDistance(index, activeIndex);
    if (relative === 0) {
      const front = focusLayout.front;
      setCardVars(node, {
        ...focusSlotToPose("front", {
          x: front.x + dragDeltaX,
          y: front.y + Math.min(0, dragDeltaY / 2),
          r: front.r + dragDeltaX / 30,
          rx: front.rx + Math.min(28, Math.max(-8, -dragDeltaY / 7)),
          ry: front.ry + Math.min(10, Math.max(-10, -dragDeltaX / 18)),
        }),
        layer: 70,
      });
      return;
    }

    setCardVars(node, getFocusSlotPose(relative));
  });
}

function getFocusSlotPose(relative) {
  return focusSlotToPose(getFocusSlotKey(relative));
}

function getFocusSlotKey(relative) {
  if (relative === -1) return "left";
  if (relative === 1) return "right";
  return "back";
}

function circularDistance(index, active) {
  const total = cards.length;
  let diff = index - active;
  if (diff > total / 2) diff -= total;
  if (diff < -total / 2) diff += total;
  return diff;
}

function focusCard(index) {
  activeIndex = index;
  state = 4;
  isSent = false;
  stageLabel.textContent = "横滑切换";
  sentTitle.textContent = cards[index].label || cards[index].subLabel || cards[index].id;
  parallaxX = 0;
  parallaxY = 0;
  setStateClass();
  renderCards();
}

function moveActive(direction) {
  if (activeIndex === null) {
    focusCard(0);
    return;
  }
  activeIndex = (activeIndex + direction + cards.length) % cards.length;
  dragDeltaX = direction * -44;
  renderCards();
  window.setTimeout(() => {
    dragDeltaX = 0;
    renderCards();
  }, 80);
}

function resetToScatter() {
  activeIndex = null;
  dragDeltaX = 0;
  dragDeltaY = 0;
  parallaxX = 0;
  parallaxY = 0;
  isSent = false;
  state = 3;
  stageLabel.textContent = "卡片选择";
  setStateClass();
  renderCards();
}

function resetDemo() {
  window.clearTimeout(introTimer);
  window.clearTimeout(sentResetTimer);
  activeIndex = null;
  dragDeltaX = 0;
  dragDeltaY = 0;
  parallaxX = 0;
  parallaxY = 0;
  isSent = false;
  state = 1;
  stageLabel.textContent = "卡片选择";
  setStateClass();
  renderCards();
}

function setState(next) {
  state = next;
  isSent = false;
  if (state < 4) {
    activeIndex = null;
    dragDeltaX = 0;
    dragDeltaY = 0;
    parallaxX = 0;
    parallaxY = 0;
  }
  setStateClass();
  renderCards();
}

function setStateClass() {
  phone.classList.remove("state-1", "state-2", "state-3", "state-4");
  phone.classList.toggle("sent", isSent);
  phone.classList.toggle("sending-preview", activeIndex !== null && isDragging && dragDeltaY < -8 && !isSent);
  phone.classList.add(`state-${state}`);
  shareHint.style.setProperty("--share-pull", `${Math.min(0, dragDeltaY / 3)}px`);
}

function playIntro() {
  if (state !== 1 && state !== 3) return;
  window.clearTimeout(introTimer);
  window.clearTimeout(sentResetTimer);
  activeIndex = null;
  dragDeltaX = 0;
  dragDeltaY = 0;
  isSent = false;
  startRipplePulse();
  setState(2);
  introTimer = window.setTimeout(() => {
    if (state === 2) {
      resetToScatter();
    }
  }, INTRO_DURATION_MS);
}

function sendActiveCard() {
  if (activeIndex === null) return;
  window.clearTimeout(sentResetTimer);
  isSent = true;
  dragDeltaX = 0;
  dragDeltaY = 0;
  sentTitle.textContent = cards[activeIndex].label || cards[activeIndex].subLabel || cards[activeIndex].id;
  setStateClass();
  sentResetTimer = window.setTimeout(() => {
    resetDemo();
  }, 980);
}

function updateScatterParallaxMouse(event) {
  if (activeIndex !== null || state < 3) return;
  const rect = cardSpace.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  parallaxX = Math.max(-1, Math.min(1, x * 2));
  parallaxY = Math.max(-1, Math.min(1, y * 2));
  renderCards();
}

function handleDeviceOrientation(event) {
  if (activeIndex !== null || state < 3) return;
  const gamma = event.gamma || 0;
  const beta = event.beta || 0;
  parallaxX = Math.max(-1, Math.min(1, gamma / 35));
  parallaxY = Math.max(-1, Math.min(1, (beta - 60) / 35));
  renderCards();

  const debug = document.getElementById('imuDebug');
  if (debug) {
    debug.textContent = `γ:${gamma.toFixed(1)} β:${beta.toFixed(1)} px:${parallaxX.toFixed(2)} py:${parallaxY.toFixed(2)}`;
    debug.style.opacity = '1';
  }
}

async function requestIMUPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      return response === 'granted';
    } catch (e) {
      return false;
    }
  }
  return true;
}

async function enableIMU() {
  if (imuEnabled) return;
  const granted = await requestIMUPermission();
  if (granted) {
    imuEnabled = true;
    window.addEventListener('deviceorientation', handleDeviceOrientation);

    const debug = document.getElementById('imuDebug');
    if (debug) {
      debug.textContent = 'IMU: listening...';
      debug.style.opacity = '1';
    }

    window.setTimeout(() => {
      const d = document.getElementById('imuDebug');
      if (d && d.textContent.includes('listening')) {
        d.textContent = 'IMU: unavailable';
        d.style.color = '#f55';
      }
    }, 3000);
  }
}

function beginCardDrag(event) {
  if (activeIndex === null || isDragging) return;
  isDragging = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragDeltaX = 0;
  dragDeltaY = 0;
  cardSpace.setPointerCapture(event.pointerId);
}

function beginMouseCardDrag(event) {
  if (activeIndex === null || isDragging) return;
  isDragging = true;
  isMouseDragging = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragDeltaX = 0;
  dragDeltaY = 0;
}

function updateCardDrag(clientX, clientY) {
  dragDeltaX = Math.max(-92, Math.min(92, clientX - dragStartX));
  dragDeltaY = Math.max(-150, Math.min(50, clientY - dragStartY));
  if (Math.abs(dragDeltaY) > Math.abs(dragDeltaX) * 1.2) {
    dragDeltaX = 0;
  }
  setStateClass();
  renderCards();
}

function finishCardDrag() {
  isDragging = false;
  isMouseDragging = false;
  if (activeIndex !== null && dragDeltaY < -78) {
    sendActiveCard();
    return;
  }
  const threshold = 42;
  if (dragDeltaX > threshold) {
    dragDeltaX = 0;
    moveActive(-1);
    return;
  }
  if (dragDeltaX < -threshold) {
    dragDeltaX = 0;
    moveActive(1);
    return;
  }
  dragDeltaX = 0;
  dragDeltaY = 0;
  setStateClass();
  renderCards();
}

let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;

function onDoubleTap(event) {
  const now = Date.now();
  const dt = now - lastTapTime;
  const dist = Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY);

  if (dt < 350 && dist < 50) {
    event.preventDefault();
    enableIMU();
    playIntro();
  }

  lastTapTime = now;
  lastTapX = event.clientX;
  lastTapY = event.clientY;
}

async function loadCardsFromJson() {
  if (window.location.protocol === "file:") {
    return;
  }

  try {
    const response = await fetch(`./data/cards.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    cards = normalizeCards(data);
    createCards();
  } catch (error) {
    console.info("Using built-in cards because cards.json could not be loaded.", error);
  }
}

proximityTrigger.addEventListener("pointerdown", onDoubleTap);

cardSpace.addEventListener("pointerdown", (event) => {
  beginCardDrag(event);
});

cardSpace.addEventListener("mousedown", (event) => {
  beginMouseCardDrag(event);
});

cardSpace.addEventListener("click", (event) => {
  if (activeIndex !== null || state !== 3) return;
  const directCard = document
    .elementsFromPoint(event.clientX, event.clientY)
    .find((element) => element.classList?.contains("hop-card"));
  if (directCard) {
    focusCard(Number(directCard.dataset.index));
    return;
  }

  const nearest = [...document.querySelectorAll(".hop-card")]
    .map((card) => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      return {
        index: Number(card.dataset.index),
        distance: Math.hypot(event.clientX - cx, event.clientY - cy),
      };
    })
    .sort((a, b) => a.distance - b.distance)[0];

  if (nearest && nearest.distance < 170) {
    focusCard(nearest.index);
  }
});

cardSpace.addEventListener("pointermove", (event) => {
  if (!isDragging) {
    if (!imuEnabled) updateScatterParallaxMouse(event);
    return;
  }
  updateCardDrag(event.clientX, event.clientY);
});

cardSpace.addEventListener("pointerup", (event) => {
  if (!isDragging) return;
  cardSpace.releasePointerCapture(event.pointerId);
  finishCardDrag();
});

window.addEventListener("mousemove", (event) => {
  if (!isMouseDragging) return;
  updateCardDrag(event.clientX, event.clientY);
});

window.addEventListener("mouseup", () => {
  if (!isMouseDragging) return;
  finishCardDrag();
});

cardSpace.addEventListener("pointerleave", () => {
  if (activeIndex !== null || isDragging) return;
  parallaxX = 0;
  parallaxY = 0;
  renderCards();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") moveActive(-1);
  if (event.key === "ArrowRight") moveActive(1);
  if (event.key === "Escape") resetToScatter();
});

applyBackgroundSettings();
setupRippleRenderer();
createCards();
loadCardsFromJson();
loadFocusLayoutFromJson();
setState(1);
