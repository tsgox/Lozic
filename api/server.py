"""
이미지 노이즈/필터링 비교 API 서버

실행
    pip install -r requirements.txt
    python server.py
    (또는) uvicorn server:app --host 127.0.0.1 --port 8000

엔드포인트
    GET  /health   서버 동작 확인 (프런트엔드의 실시간/사전계산 모드 판별용)
    POST /process  multipart/form-data 의 file 필드로 이미지 1장을 받아
                   원본(축소본), 노이즈 적용, 기존 필터, 다른 필터 결과를 반환
    GET  /docs     FastAPI 자동 문서 (브라우저에서 직접 테스트 가능)
"""
import base64
import threading
import time

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import processing

# ---------------------------------------------------------------------------
# 설정
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = [
    "https://tsgox.github.io",   # GitHub Pages 주소로 교체
    "http://localhost:5500",          # VS Code Live Server
    "http://127.0.0.1:5500",
    "http://localhost:8080",          # python -m http.server 8080
]
MAX_UPLOAD_BYTES = 20 * 1024 * 1024   # 업로드 상한 10MB
MAX_SIDE = 1024                       # 긴 변 기준 처리 해상도 상한(px)
MAX_CONCURRENT = 2                    # 동시에 처리할 요청 수 (CPU 코어 수에 맞춰 조정)
WAIT_TIMEOUT = 30                     # 처리 대기열에서 기다릴 최대 시간(초)

_slots = threading.BoundedSemaphore(MAX_CONCURRENT)

app = FastAPI(title="Filter Exhibition API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# 유틸리티
# ---------------------------------------------------------------------------
def decode_image(data: bytes) -> np.ndarray:
    """업로드 바이트를 BGR uint8 배열로 변환한다. 해석 불가 시 None."""
    buf = np.frombuffer(data, dtype=np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def limit_size(img: np.ndarray) -> np.ndarray:
    """긴 변이 MAX_SIDE를 넘으면 비율을 유지해 축소한다."""
    h, w = img.shape[:2]
    scale = MAX_SIDE / max(h, w)
    if scale >= 1:
        return img
    return cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)


def to_uint8(img, step: str) -> np.ndarray:
    """처리 함수의 반환값을 검사하고 uint8로 맞춘다."""
    if not isinstance(img, np.ndarray):
        raise TypeError(f"{step}: numpy.ndarray가 아닌 {type(img).__name__}을(를) 반환했다")
    if img.ndim not in (2, 3):
        raise ValueError(f"{step}: 배열 차원이 {img.ndim}이다 (2 또는 3이어야 한다)")
    if img.dtype != np.uint8:
        img = np.clip(img, 0, 255).astype(np.uint8)
    return img


def to_data_url(img: np.ndarray) -> str:
    """PNG로 인코딩해 <img src>에 바로 넣을 수 있는 data URL로 만든다."""
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise RuntimeError("PNG 인코딩 실패")
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def run_step(fn, img: np.ndarray, step: str):
    t0 = time.perf_counter()
    out = fn(img.copy())                      # 처리 함수가 입력을 수정해도 원본은 보존
    ms = (time.perf_counter() - t0) * 1000
    return to_uint8(out, step), ms


# ---------------------------------------------------------------------------
# 엔드포인트
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True}


@app.post("/process")
def process(file: UploadFile = File(...)):
    # async def가 아닌 def로 선언: 무거운 연산이 스레드풀에서 실행되어
    # 처리 중에도 서버가 /health 등 다른 요청에 응답할 수 있다.
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"파일이 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB를 초과한다")

    img = decode_image(data)
    if img is None:
        raise HTTPException(400, "이미지로 해석할 수 없는 파일이다")
    img = limit_size(img)

    if not _slots.acquire(timeout=WAIT_TIMEOUT):
        raise HTTPException(503, "다른 요청을 처리 중이다. 잠시 후 다시 시도하라")
    try:
        noisy, t_noise = run_step(processing.apply_noise, img, "apply_noise")
        conv, t_conv = run_step(processing.filter_conventional, noisy, "filter_conventional")
        prop, t_prop = run_step(processing.filter_proposed, noisy, "filter_proposed")
    except Exception as e:
        raise HTTPException(500, f"처리 중 오류: {e}")
    finally:
        _slots.release()

    h, w = img.shape[:2]
    return {
        "width": w,
        "height": h,
        "original":     {"image": to_data_url(img)},
        "noisy":        {"image": to_data_url(noisy), "ms": round(t_noise, 1)},
        "conventional": {"image": to_data_url(conv),  "ms": round(t_conv, 1)},
        "proposed":     {"image": to_data_url(prop),  "ms": round(t_prop, 1)},
    }


# 프런트엔드까지 이 서버에서 제공하려면(전부 집 컴퓨터 구성) 아래 두 줄의 주석을 해제한다.
# 반드시 모든 API 경로 선언 뒤에 두어야 한다.
# from fastapi.staticfiles import StaticFiles
# app.mount("/", StaticFiles(directory="../exhibition", html=True), name="frontend")


if __name__ == "__main__":
    # 127.0.0.1: 같은 컴퓨터(cloudflared 포함)에서만 접속 가능. 외부 공개는 터널이 담당한다.
    uvicorn.run(app, host="127.0.0.1", port=8000)
