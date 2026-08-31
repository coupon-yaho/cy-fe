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
  /** 서버는 이 값을 {@code queueMode} 로 부릅니다. 이름은 어댑터에서 맞춥니다. */
  mode: QueueMode;
  /**
   * 엔진 버전과 릴리스 단계.
   *
   * <b>화면에 안 쓰지만 들고 있어야 합니다.</b> PUT 이 전체 교체라, 대기열 모드만
   * 바꿔도 나머지 두 값을 그대로 되돌려보내지 않으면 서버가 400 을 냅니다.
   */
  engineVersion: string;
  releaseStage: string;
  /** 동시 수정을 막는 리비전. 값을 바꿀 때 이 번호를 함께 보냅니다. */
  revision: number;
  updatedAt: string;
}
