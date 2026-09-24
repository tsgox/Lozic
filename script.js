"use strict";
import { postProcess } from "./server.js";

/* =========================================================
 * 1. 설정
 * ========================================================= */

// 전시용 이미지 경로를 여기에 추가한다.
// 주의: file:// 로 열면 브라우저 보안 정책 때문에 픽셀을 읽을 수 없으므로
//       로컬 서버(예: python -m http.server, VS Code Live Server)로 실행해야 한다.
// 배열이 비어 있으면 데모용 샘플 이미지를 자동 생성한다.
const IMAGE_LIST = [
  { name: "이미지 1", src: "images/test1.png" },
  { name: "이미지 2", src: "images/test2.jpg" },
  { name: "이미지 3", src: "images/test3.jpg" },
];

const CONFIG = {
  maxSize: 512, // 처리 해상도 상한(긴 변 기준, px). 필터 연산량에 맞춰 조정한다.
  stepDelay: 600, // 단계 사이 연출용 지연(ms). 0이면 즉시 표시한다.
};

/* =========================================================
 * 2. 처리 함수 (추후 구현 영역)
 *    입력과 출력은 모두 ImageData이다. 입력은 수정하지 않는다.
 * ========================================================= */

// 노이즈 적용 함수: 미리저장된 이미지를 로드한다.
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function drawToCanvas(canvas, imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
  canvas.classList.remove("empty");
}

// 서버가 준 data URL을 캔버스에 그린다
async function drawDataUrl(canvas, dataUrl) {
  const img = await loadImage(dataUrl);
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d").drawImage(img, 0, 0);
  canvas.classList.remove("empty");
}

function clearCanvas(canvas) {
  canvas.classList.add("empty");
}

// 이미지 소스를 처리 해상도로 축소한 ImageData로 변환한다.
function imageToImageData(img) {
  const scale = Math.min(
    1,
    CONFIG.maxSize /
      Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height),
  );
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h); // file:// 환경에서는 여기서 SecurityError가 발생한다.
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했다: " + src));
    img.src = src;
  });
}

// 목록 항목을 서버로 보낼 Blob으로 변환한다
//item = {name, src(img file path), sampleKind (파일선택안된경우에)}
async function itemToBlob(item) {
  if (item.file) return item.file; // 업로드한 파일

  const res = await fetch(item.src); // IMAGE_LIST 경로

  if (!res.ok) throw new Error("이미지를 불러오지 못했다: " + item.src);
  return res.blob();
}

/* =========================================================
 * 5. 상태 및 화면 요소
 * ========================================================= */

const els = {
  list: document.getElementById("imageList"),
  file: document.getElementById("fileInput"),
  fullscreen: document.getElementById("fullscreenBtn"),
  canvas: {
    original: document.getElementById("cv-original"),
    noisy: document.getElementById("cv-noisy"),
    conventional: document.getElementById("cv-conventional"),
    proposed: document.getElementById("cv-proposed"),
  },
  status: {
    original: document.getElementById("st-original"),
    noisy: document.getElementById("st-noisy"),
    conventional: document.getElementById("st-conventional"),
    proposed: document.getElementById("st-proposed"),
  },
};

// items: { name, src?, sampleKind? }
const state = { items: [], selected: -1, runId: 0 };

function setStatus(key, text, kind) {
  const el = els.status[key];
  el.textContent = text;
  el.dataset.state = kind || "";
}

function resetStages() {
  for (const key of Object.keys(els.canvas)) {
    clearCanvas(els.canvas[key]);
    setStatus(key, "대기");
  }
}

/* =========================================================
 * 6. 목록 렌더링
 * ========================================================= */
//state = {name(파일명 또는 이미지번호), src(파일경로)}
function renderList() {
  els.list.innerHTML = "";
  state.items.forEach((item, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<span>${item.name}</span> <img src="${item.src}" alt="${item.name}" class="sidebar-img" />`;
    btn.setAttribute("aria-current", i === state.selected ? "true" : "false");
    btn.setAttribute("class", "sidebar-btn");
    btn.addEventListener("click", () => selectItem(i));
    li.appendChild(btn);
    els.list.appendChild(li);
  });
}

//item = {name, src(img file path)}
async function getItemImageData(item) {
  //samplekind 정의되어 있다면 샘플파일생성
  if (item.sampleKind !== undefined)
    return imageToImageData(makeSample(item.sampleKind));
  const img = await loadImage(item.src);
  // img를 축소해서 반환
  return imageToImageData(img);
}

/* =========================================================
 * 7. 처리 순서 (빨간 화살표 순서)
 *    원본 → 노이즈 적용 → (기존 필터, 다른 필터)
 * ========================================================= */
//item  = {name(img name), src(img file)}
async function runPipeline(item) {
  const myRun = ++state.runId; // 다른 이미지를 고르면 이전 실행을 중단한다.
  const alive = () => myRun === state.runId;

  resetStages();

  // 1단계: 원본
  setStatus("original", "불러오는 중", "busy");
  let original;
  try {
    original = await getItemImageData(item);
  } catch (err) {
    const msg =
      err.name === "SecurityError"
        ? "픽셀 접근 차단됨. 로컬 서버로 실행해야 한다."
        : "불러오기 실패";
    setStatus("original", msg);
    console.error(err);
    return;
  }
  if (!alive()) return;
  drawToCanvas(els.canvas.original, original);
  setStatus("original", original.width + "×" + original.height, "done");
  await sleep(CONFIG.stepDelay);
  if (!alive()) return;

  // 2단계: 노이즈 적용
  setStatus("noisy", "처리 중", "busy");
  await sleep(0); // 상태 표시가 먼저 그려지도록 양보한다.
  let t = performance.now();
  const noisy = applyNoise(original);
  const tNoise = performance.now() - t;
  if (!alive()) return;
  drawToCanvas(els.canvas.noisy, noisy);
  setStatus("noisy", "완료 · " + tNoise.toFixed(1) + " ms", "done");
  await sleep(CONFIG.stepDelay);
  if (!alive()) return;

  // 3단계: 두 필터에 같은 노이즈 이미지를 입력한다.
  setStatus("conventional", "처리 중", "busy");
  setStatus("proposed", "처리 중", "busy");
  await sleep(0);

  t = performance.now();
  const conv = filterConventional(noisy);
  const tConv = performance.now() - t;
  if (!alive()) return;
  drawToCanvas(els.canvas.conventional, conv);
  setStatus("conventional", "완료 · " + tConv.toFixed(1) + " ms", "done");
  await sleep(0);

  t = performance.now();
  const prop = filterProposed(noisy);
  const tProp = performance.now() - t;
  if (!alive()) return;
  drawToCanvas(els.canvas.proposed, prop);
  setStatus("proposed", "완료 · " + tProp.toFixed(1) + " ms", "done");
}

async function selectItem(i) {
  if (i < 0 || i >= state.items.length) return;
  state.selected = i;
  renderList();
  els.list.querySelectorAll("button")[i].focus({ preventScroll: false });
  //runPipeline(state.items[i]);
  await runPipelineRemote(state.items[i]);
}

let currentRequest = null;

// server request  return {
//   "width": w,
//   "height": h,
//   "original": { "image": to_data_url(img) },
//   "noisy": { "image": to_data_url(noisy), "ms": round(t_noise, 1) },
//   "conventional": { "image": to_data_url(conv), "ms": round(t_conv, 1) },
//   "proposed": { "image": to_data_url(prop), "ms": round(t_prop, 1) },
// }

async function runPipelineRemote(item) {
  const myRun = ++state.runId;
  const alive = () => myRun === state.runId;
  const keys = ["original", "noisy", "conventional", "proposed"];

  currentRequest?.abort(); // 이전 요청을 실제로 취소
  currentRequest = new AbortController();

  resetStages();
  keys.forEach((k) => setStatus(k, "서버 처리 중", "busy"));

  let result;
  try {
    const blob = await itemToBlob(item);
    result = await postProcess(blob, {
      filename: item.name,
      signal: currentRequest.signal,
    });
  } catch (err) {
    if (err.name === "AbortError" || !alive()) return;
    keys.forEach((k) => setStatus(k, "오류"));
    setStatus("original", err.message);
    console.error(err);
    return;
  }

  for (const key of keys) {
    if (!alive()) return;
    await drawDataUrl(els.canvas[key], result[key].image);
    setStatus(
      key,
      key === "original"
        ? `${result.width}×${result.height}`
        : `완료 · ${result[key].ms} ms`,
      "done",
    );
    if (key === "original" || key === "noisy") await sleep(CONFIG.stepDelay);
  }
}

/* =========================================================
 * 8. 이벤트
 * ========================================================= */

// 사용자가 추가한 이미지 파일을 목록에 넣는다.
els.file.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  const start = state.items.length;
  files.forEach((f) =>
    state.items.push({ name: f.name, src: URL.createObjectURL(f) }),
  );
  renderList();
  if (files.length) selectItem(start);
  e.target.value = "";
});

// 위아래 방향키로 목록 이동 (전시장 키보드 조작용)
document.addEventListener("keydown", (e) => {
  if (!state.items.length) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectItem(Math.min(state.items.length - 1, state.selected + 1));
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    selectItem(Math.max(0, state.selected - 1));
  }
});

els.fullscreen.addEventListener("click", () => {
  if (!document.fullscreenElement)
    document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

/* =========================================================
 * 9. 초기화
 * ========================================================= */

(function init() {
  state.items = IMAGE_LIST.map((x) => ({ ...x }));
  renderList();
})();
