import { jest } from "@jest/globals";
import { WorkerEventsGateway } from "../../src/modules/websocket/websocket.gateway.js";

describe("WorkerEventsGateway (integration-light)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, "setTimeout");
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function createGateway(throttleMs = 50) {
    process.env.PROGRESS_THROTTLE_MS = String(throttleMs);
    const downloads = {
      updateJobProgress: jest.fn().mockResolvedValue(undefined),
      setJobCompleted: jest.fn().mockResolvedValue(undefined),
      updateJobStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as any;

    const gw = new WorkerEventsGateway(downloads);

    const emitted: Array<{ room: string; event: string; payload: any }> = [];
    const mockServer = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          emitted.push({ room, event, payload });
        },
      }),
      emit: (event: string, payload: any) => {
        emitted.push({ room: "*", event, payload });
      },
      sockets: { adapter: { rooms: new Map() } },
    } as any;

    // @ts-expect-error assign test double
    gw.server = mockServer;

    return { gw, downloads, emitted };
  }

  test("throttle des écritures DB et émission immédiate vers la room", async () => {
    const { gw, downloads, emitted } = createGateway(50);
    const jobId = "job-1";

    // deux progress rapprochés
    await gw.handleProgress({ jobId, stage: "download", progress: 10 });
    await gw.handleProgress({ jobId, stage: "download", progress: 55 });

    // émissions socket immédiates (2)
    expect(
      emitted.filter((e) => e.event === "progress" && e.room === `job:${jobId}`)
    ).toHaveLength(2);

    // avant l’échéance du throttle, aucune écriture DB
    expect(downloads.updateJobProgress).not.toHaveBeenCalled();

    // avance le temps pour déclencher le flush
    jest.advanceTimersByTime(60);

    // DB appelée une fois avec la dernière valeur buffered (55)
    expect(downloads.updateJobProgress).toHaveBeenCalledTimes(1);
    expect(downloads.updateJobProgress).toHaveBeenCalledWith(
      jobId,
      55,
      "download",
      undefined,
      undefined,
      undefined
    );
  });

  test("flush sur completed: clear timers, update DB, émettre completed", async () => {
    const { gw, downloads, emitted } = createGateway(2000);
    const jobId = "job-2";

    // progress qui resterait bufferisé longtemps (throttle haut)
    await gw.handleProgress({ jobId, stage: "download", progress: 90 });

    // pas encore de DB write
    expect(downloads.updateJobProgress).not.toHaveBeenCalled();

    await gw.handleCompleted({
      jobId,
      filename: "foo.mp4",
      size: 1234,
      outputPath: "/tmp/foo.mp4",
    });

    // setJobCompleted appelé
    expect(downloads.setJobCompleted).toHaveBeenCalledTimes(1);

    // event completed émis
    const completedEvents = emitted.filter(
      (e) => e.event === "completed" && e.room === `job:${jobId}`
    );
    expect(completedEvents).toHaveLength(1);
  });

  test("failed: clear timers, update status, émettre failed", async () => {
    const { gw, downloads, emitted } = createGateway(2000);
    const jobId = "job-3";

    await gw.handleProgress({ jobId, stage: "download", progress: 42 });

    await gw.handleFailed({
      jobId,
      errorCode: "NETWORK_ERROR",
      message: "timeout",
    });

    expect(downloads.updateJobStatus).toHaveBeenCalledWith(
      jobId,
      "failed",
      "NETWORK_ERROR",
      "timeout"
    );
    const failedEvents = emitted.filter(
      (e) => e.event === "failed" && e.room === `job:${jobId}`
    );
    expect(failedEvents).toHaveLength(1);
  });
});
