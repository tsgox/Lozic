"use strict";

//const API_BASE = 'http://127.0.0.1:8000';
const API_BASE = "http://sungchol.tplinkdns.com:8081";

// 서버 오류를 상태 코드와 함께 전달하기 위한 오류 클래스
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0이면 네트워크 오류 또는 시간 초과
  }
}

/**
 * 이미지 한 장을 /process 로 보내고 처리 결과(JSON)를 반환한다.
 * @param {Blob|File} image        보낼 이미지
 * @param {object}    [options]
 * @param {string}    [options.filename='image.png']  File이 아닌 Blob일 때 쓸 파일명
 * @param {number}    [options.timeoutMs=60000]       응답 제한 시간
 * @param {AbortSignal} [options.signal]              외부에서 요청을 취소할 때 사용
 * @returns {Promise<{width:number, height:number,
 *   original:{image:string}, noisy:{image:string, ms:number},
 *   conventional:{image:string, ms:number}, proposed:{image:string, ms:number}}>}
 */
export async function postProcess(
  image,
  { filename = "image.png", timeoutMs = 60000, signal } = {},
) {
  const form = new FormData();
  form.append("file", image, image.name || filename); // 'file'은 서버의 매개변수 이름과 같아야 한다

  // 시간 초과와 외부 취소를 하나의 AbortController로 합친다
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("timeout", "TimeoutError")),
    timeoutMs,
  );
  const onOuterAbort = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) onOuterAbort();
    else signal.addEventListener("abort", onOuterAbort, { once: true });
  }

  try {
    // Content-Type 헤더는 지정하지 않는다 (브라우저가 boundary 포함해 자동 설정)
    const res = await fetch(API_BASE + "/process", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json(); // FastAPI 오류 형식: {"detail": "..."}
        if (body && body.detail) detail = body.detail;
      } catch {
        /* JSON이 아니면 statusText 사용 */
      }
      throw new ApiError(res.status, detail);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (controller.signal.aborted) {
      if (controller.signal.reason?.name === "TimeoutError") {
        throw new ApiError(0, `${timeoutMs / 1000}초 안에 응답이 없다`);
      }
      throw err; // 외부 취소는 AbortError 그대로 전달
    }
    throw new ApiError(
      0,
      "서버에 연결할 수 없다 (서버 실행 여부와 주소를 확인하라)",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}
