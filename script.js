'use strict';

/* =========================================================
 * 1. 설정
 * ========================================================= */

// 전시용 이미지 경로를 여기에 추가한다.
// 주의: file:// 로 열면 브라우저 보안 정책 때문에 픽셀을 읽을 수 없으므로
//       로컬 서버(예: python -m http.server, VS Code Live Server)로 실행해야 한다.
// 배열이 비어 있으면 데모용 샘플 이미지를 자동 생성한다.
const IMAGE_LIST = [
  // { name: '이미지 1', src: 'images/sample1.png' },
  // { name: '이미지 2', src: 'images/sample2.png' },
];

const CONFIG = {
  maxSize: 512,      // 처리 해상도 상한(긴 변 기준, px). 필터 연산량에 맞춰 조정한다.
  stepDelay: 600,    // 단계 사이 연출용 지연(ms). 0이면 즉시 표시한다.
};

/* =========================================================
 * 2. 처리 함수 (추후 구현 영역)
 *    입력과 출력은 모두 ImageData이다. 입력은 수정하지 않는다.
 * ========================================================= */

// 노이즈 적용 함수: 현재는 원본 복사본을 그대로 반환한다.
function applyNoise(imageData) {
  const out = cloneImageData(imageData);
  // TODO: 노이즈 모델 구현 (out.data를 직접 수정)
  return out;
}

// 기존 필터링 방식: 현재는 입력 복사본을 그대로 반환한다.
function filterConventional(imageData) {
  const out = cloneImageData(imageData);
  // TODO: 기존 필터 구현
  return out;
}

// 다른 방식의 필터링: 현재는 입력 복사본을 그대로 반환한다.
function filterProposed(imageData) {
  const out = cloneImageData(imageData);
  // TODO: 비교 대상 필터 구현
  return out;
}

/* =========================================================
 * 3. 유틸리티
 * ========================================================= */

function cloneImageData(src) {
  return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function drawToCanvas(canvas, imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  canvas.classList.remove('empty');
}

function clearCanvas(canvas) {
  canvas.classList.add('empty');
}

// 이미지 소스를 처리 해상도로 축소한 ImageData로 변환한다.
function imageToImageData(img) {
  const scale = Math.min(1, CONFIG.maxSize / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h); // file:// 환경에서는 여기서 SecurityError가 발생한다.
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했다: ' + src));
    img.src = src;
  });
}

/* =========================================================
 * 4. 데모용 샘플 이미지 생성 (IMAGE_LIST가 비어 있을 때만 사용)
 * ========================================================= */

function makeSample(kind) {
  const size = 384;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');

  if (kind === 0) {           // 그라데이션 + 도형
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#3A6EA5'); g.addColorStop(1, '#F2C14E');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(140, 150, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1C232B'; ctx.fillRect(210, 200, 120, 120);
  } else if (kind === 1) {    // 체커보드 (경계 보존 확인용)
    const n = 12, s = size / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#222' : '#EEE';
      ctx.fillRect(x * s, y * s, s, s);
    }
  } else {                    // 동심원 + 글자 (세부 구조 확인용)
    ctx.fillStyle = '#F7F7F2'; ctx.fillRect(0, 0, size, size);
    for (let r = 180; r > 0; r -= 12) {
      ctx.strokeStyle = r % 24 ? '#C0392B' : '#2C3E50';
      ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#111'; ctx.font = '600 48px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('FILTER', size / 2, size / 2 + 16);
  }
  return c;
}

/* =========================================================
 * 5. 상태 및 화면 요소
 * ========================================================= */

const els = {
  list: document.getElementById('imageList'),
  file: document.getElementById('fileInput'),
  fullscreen: document.getElementById('fullscreenBtn'),
  canvas: {
    original: document.getElementById('cv-original'),
    noisy: document.getElementById('cv-noisy'),
    conventional: document.getElementById('cv-conventional'),
    proposed: document.getElementById('cv-proposed'),
  },
  status: {
    original: document.getElementById('st-original'),
    noisy: document.getElementById('st-noisy'),
    conventional: document.getElementById('st-conventional'),
    proposed: document.getElementById('st-proposed'),
  },
};

// items: { name, src?, sampleKind? }
const state = { items: [], selected: -1, runId: 0 };

function setStatus(key, text, kind) {
  const el = els.status[key];
  el.textContent = text;
  el.dataset.state = kind || '';
}

function resetStages() {
  for (const key of Object.keys(els.canvas)) {
    clearCanvas(els.canvas[key]);
    setStatus(key, '대기');
  }
}

/* =========================================================
 * 6. 목록 렌더링
 * ========================================================= */

function renderList() {
  els.list.innerHTML = '';
  state.items.forEach((item, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.name;
    btn.setAttribute('aria-current', i === state.selected ? 'true' : 'false');
    btn.addEventListener('click', () => selectItem(i));
    li.appendChild(btn);
    els.list.appendChild(li);
  });
}

async function getItemImageData(item) {
  if (item.sampleKind !== undefined) return imageToImageData(makeSample(item.sampleKind));
  const img = await loadImage(item.src);
  return imageToImageData(img);
}

/* =========================================================
 * 7. 처리 순서 (빨간 화살표 순서)
 *    원본 → 노이즈 적용 → (기존 필터, 다른 필터)
 * ========================================================= */

async function runPipeline(item) {
  const myRun = ++state.runId;              // 다른 이미지를 고르면 이전 실행을 중단한다.
  const alive = () => myRun === state.runId;

  resetStages();

  // 1단계: 원본
  setStatus('original', '불러오는 중', 'busy');
  let original;
  try {
    original = await getItemImageData(item);
  } catch (err) {
    const msg = err.name === 'SecurityError'
      ? '픽셀 접근 차단됨. 로컬 서버로 실행해야 한다.'
      : '불러오기 실패';
    setStatus('original', msg);
    console.error(err);
    return;
  }
  if (!alive()) return;
  drawToCanvas(els.canvas.original, original);
  setStatus('original', original.width + '×' + original.height, 'done');
  await sleep(CONFIG.stepDelay); if (!alive()) return;

  // 2단계: 노이즈 적용
  setStatus('noisy', '처리 중', 'busy');
  await sleep(0);                            // 상태 표시가 먼저 그려지도록 양보한다.
  let t = performance.now();
  const noisy = applyNoise(original);
  const tNoise = performance.now() - t;
  if (!alive()) return;
  drawToCanvas(els.canvas.noisy, noisy);
  setStatus('noisy', '완료 · ' + tNoise.toFixed(1) + ' ms', 'done');
  await sleep(CONFIG.stepDelay); if (!alive()) return;

  // 3단계: 두 필터에 같은 노이즈 이미지를 입력한다.
  setStatus('conventional', '처리 중', 'busy');
  setStatus('proposed', '처리 중', 'busy');
  await sleep(0);

  t = performance.now();
  const conv = filterConventional(noisy);
  const tConv = performance.now() - t;
  if (!alive()) return;
  drawToCanvas(els.canvas.conventional, conv);
  setStatus('conventional', '완료 · ' + tConv.toFixed(1) + ' ms', 'done');
  await sleep(0);

  t = performance.now();
  const prop = filterProposed(noisy);
  const tProp = performance.now() - t;
  if (!alive()) return;
  drawToCanvas(els.canvas.proposed, prop);
  setStatus('proposed', '완료 · ' + tProp.toFixed(1) + ' ms', 'done');
}

function selectItem(i) {
  if (i < 0 || i >= state.items.length) return;
  state.selected = i;
  renderList();
  els.list.querySelectorAll('button')[i].focus({ preventScroll: false });
  runPipeline(state.items[i]);
}

/* =========================================================
 * 8. 이벤트
 * ========================================================= */

// 사용자가 추가한 이미지 파일을 목록에 넣는다.
els.file.addEventListener('change', e => {
  const files = Array.from(e.target.files || []);
  const start = state.items.length;
  files.forEach(f => state.items.push({ name: f.name, src: URL.createObjectURL(f) }));
  renderList();
  if (files.length) selectItem(start);
  e.target.value = '';
});

// 위아래 방향키로 목록 이동 (전시장 키보드 조작용)
document.addEventListener('keydown', e => {
  if (!state.items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); selectItem(Math.min(state.items.length - 1, state.selected + 1)); }
  if (e.key === 'ArrowUp')   { e.preventDefault(); selectItem(Math.max(0, state.selected - 1)); }
});

els.fullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

/* =========================================================
 * 9. 초기화
 * ========================================================= */

(function init() {
  if (IMAGE_LIST.length) {
    state.items = IMAGE_LIST.map(x => ({ ...x }));
  } else {
    state.items = [
      { name: '샘플 1 · 그라데이션', sampleKind: 0 },
      { name: '샘플 2 · 체커보드', sampleKind: 1 },
      { name: '샘플 3 · 동심원', sampleKind: 2 },
    ];
  }
  renderList();
})();
