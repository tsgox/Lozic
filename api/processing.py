"""
노이즈 적용 및 필터링 함수 모음 (추후 구현 영역)

규칙
- 입력: OpenCV 형식 이미지 (numpy.ndarray, dtype=uint8, shape=(H, W, 3), 채널 순서 BGR)
- 출력: 같은 형식의 numpy.ndarray
        float 배열을 반환해도 server.py가 0~255로 잘라 uint8로 변환한다.
        흑백(H, W) 배열을 반환해도 된다.
- 입력 배열을 직접 수정하지 말고 복사본을 만들어 처리한다.
"""
import numpy as np


def apply_noise(img: np.ndarray) -> np.ndarray:
    out = img.copy()
    # TODO: 노이즈 모델 구현
    # 예시(가우시안 노이즈, 표준편차 20):
    rng = np.random.default_rng()
    out = img.astype(np.float32) + rng.normal(0, 20, img.shape)
    return out


def filter_conventional(img: np.ndarray) -> np.ndarray:
    out = img.copy()
    # TODO: 기존 필터 구현
    # 예시(3x3 중간값 필터): 
    import cv2; out = cv2.medianBlur(img, 3)
    return out


def filter_proposed(img: np.ndarray) -> np.ndarray:
    out = img.copy()
    # TODO: 비교 대상 필터 구현
    return out
