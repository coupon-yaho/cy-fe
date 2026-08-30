/** GET/PUT /api/v1/admin/runtime-config 응답 계약과 표시 문구. */

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
