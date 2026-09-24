"""
서버 동작 확인 스크립트
    1) 다른 터미널에서 python server.py 실행
    2) python test_api.py [이미지 경로]
       경로를 생략하면 테스트용 이미지를 생성해 보낸다.
결과 이미지는 test_output 폴더에 저장된다.
"""
import base64
import sys
from pathlib import Path

import cv2
import numpy as np
import requests

API = "http://127.0.0.1:8000"


def make_test_image() -> bytes:
    img = np.zeros((300, 400, 3), np.uint8)
    img[:] = (200, 180, 60)
    cv2.circle(img, (130, 150), 70, (255, 255, 255), -1)
    cv2.rectangle(img, (230, 90), (350, 210), (30, 30, 30), -1)
    return cv2.imencode(".png", img)[1].tobytes()


def main():
    print("health:", requests.get(API + "/health", timeout=5).json())

    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
        payload = (path.name, path.read_bytes())
    else:
        payload = ("test.png", make_test_image())

    r = requests.post(API + "/process", files={"file": payload}, timeout=120)
    r.raise_for_status()
    result = r.json()

    out_dir = Path("test_output")
    out_dir.mkdir(exist_ok=True)
    print(f"size: {result['width']}x{result['height']}")
    for key in ("original", "noisy", "conventional", "proposed"):
        png = base64.b64decode(result[key]["image"].split(",", 1)[1])
        (out_dir / f"{key}.png").write_bytes(png)
        print(f"{key:13s} {result[key].get('ms', '-')} ms")


if __name__ == "__main__":
    main()
