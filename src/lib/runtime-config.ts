/**
 * 런타임 설정.
 *
 * 설계도의 RuntimeConfigStore(Redis `config:runtime`) 자리입니다.
 * 관리자가 바꾸면 고객 화면의 동작이 즉시 달라지므로, 관리자 목과 쿠폰 목이
 * 같은 값을 읽어야 합니다. 그래서 두 목이 함께 import 하는 자리에 두었습니다.
 *
 * 실서버가 붙으면 이 파일 대신 GET/PUT /api/v1/admin/runtime-config 를 씁니다.
 */

export type QueueMode = "OFF" | "ALWAYS" | "ADAPTIVE";

export const QUEUE_MODE_LABEL: Record<QueueMode, string> = {
  OFF: "사용 안 함",
  ALWAYS: "항상 사용",
  ADAPTIVE: "혼잡할 때만",
};

export const QUEUE_MODE_NOTE: Record<QueueMode, string> = {
  OFF: "대기열 없이 바로 발급합니다.",
  ALWAYS: "발급 중인 모든 회차에 대기열을 겁니다.",
  ADAPTIVE: "발급 속도가 기준을 넘는 회차에만 대기열을 겁니다.",
};

export interface QueueSettings {
  mode: QueueMode;
  /** 혼잡 판단 기준. 분당 발급 건수가 이 값을 넘으면 대기열을 켭니다. */
  adaptiveThresholdPerMinute: number;
  /** 동시 수정을 막는 리비전. 값을 바꿀 때 이 번호를 함께 보냅니다. */
  revision: number;
  updatedAt: string;
}

const KEY = "coupon-yaho.runtime.v1";

const DEFAULT_SETTINGS: QueueSettings = {
  mode: "ADAPTIVE",
  adaptiveThresholdPerMinute: 120,
  revision: 1,
  updatedAt: new Date(0).toISOString(),
};

let cached: QueueSettings | null = null;

export function readQueueSettings(): QueueSettings {
  if (cached) return cached;
  if (typeof window === "undefined") {
    cached = DEFAULT_SETTINGS;
    return cached;
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as QueueSettings) }
      : DEFAULT_SETTINGS;
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  return cached;
}

export class RuntimeConfigConflictError extends Error {
  constructor() {
    super("다른 곳에서 먼저 바뀌었습니다. 최신 값을 불러온 뒤 다시 저장해 주세요.");
    this.name = "RuntimeConfigConflictError";
  }
}

export function writeQueueSettings(input: {
  mode: QueueMode;
  adaptiveThresholdPerMinute: number;
  expectedRevision: number;
}): QueueSettings {
  const current = readQueueSettings();
  if (input.expectedRevision !== current.revision) throw new RuntimeConfigConflictError();

  const next: QueueSettings = {
    mode: input.mode,
    adaptiveThresholdPerMinute: Math.max(1, Math.round(input.adaptiveThresholdPerMinute)),
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 저장 실패는 무시합니다 */
    }
  }
  return next;
}

/** 이 회차에 대기열을 걸어야 하는지 판단합니다. */
export function isQueueActive(ratePerMinute: number, settings = readQueueSettings()): boolean {
  if (settings.mode === "OFF") return false;
  if (settings.mode === "ALWAYS") return true;
  return ratePerMinute >= settings.adaptiveThresholdPerMinute;
}
