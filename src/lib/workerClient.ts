import type {
  PhiSpyRunParameters,
  PhiSpyRunResult,
} from "./phispyTypes";

type StatusCallback = (message: string, elapsedMs?: number) => void;
type LogCallback = (text: string, stream: "stdout" | "stderr") => void;

export class PhiSpyWorkerClient {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL("../workers/phispyWorker.ts", import.meta.url),
      { type: "module" }
    );
  }

  init(
    onStatus: StatusCallback,
    onLog: LogCallback
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        console.log("[PhiSpyWorker message]", event.data);
        const msg = event.data;
        if (msg.type === "status") {
          onStatus(msg.message, msg.elapsedMs);
          if (msg.message === "ready") {
            this.worker.removeEventListener("message", handler);
            resolve();
          }
        } else if (msg.type === "stdout") {
          onLog(msg.text, "stdout");
        } else if (msg.type === "stderr") {
          onLog(msg.text, "stderr");
        } else if (msg.type === "error") {
          this.worker.removeEventListener("message", handler);
          reject(new Error(`${msg.message}\n${msg.details ?? ""}`));
        }
      };
      this.worker.addEventListener("message", handler);
      this.worker.postMessage({ type: "init" });
    });
  }

  run(
    filename: string,
    fileBuffer: ArrayBuffer,
    params: PhiSpyRunParameters,
    onStatus: StatusCallback,
    onLog: LogCallback
  ): Promise<PhiSpyRunResult> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        console.log("[PhiSpyWorker message]", event.data);
        const msg = event.data;
        if (msg.type === "status") {
          onStatus(msg.message, msg.elapsedMs);
        } else if (msg.type === "stdout") {
          onLog(msg.text, "stdout");
        } else if (msg.type === "stderr") {
          onLog(msg.text, "stderr");
        } else if (msg.type === "result") {
          this.worker.removeEventListener("message", handler);
          resolve(msg.result as PhiSpyRunResult);
        } else if (msg.type === "error") {
          this.worker.removeEventListener("message", handler);
          reject(new Error(`${msg.message}\n${msg.details ?? ""}`));
        }
      };
      this.worker.addEventListener("message", handler);
      this.worker.postMessage(
        { type: "run", filename, fileBuffer, params },
        [fileBuffer]
      );
    });
  }

  terminate(): void {
    this.worker.terminate();
  }
}
