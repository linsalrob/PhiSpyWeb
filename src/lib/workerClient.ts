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
        const msg = event.data;
        if (msg.type === "status") {
          console.log("[PhiSpyWorker message]", { type: msg.type, message: msg.message, elapsedMs: msg.elapsedMs });
          onStatus(msg.message, msg.elapsedMs);
          if (msg.message === "ready") {
            this.worker.removeEventListener("message", handler);
            resolve();
          }
        } else if (msg.type === "stdout") {
          console.log("[PhiSpyWorker message]", { type: msg.type, text: msg.text });
          onLog(msg.text, "stdout");
        } else if (msg.type === "stderr") {
          console.log("[PhiSpyWorker message]", { type: msg.type, text: msg.text });
          onLog(msg.text, "stderr");
        } else if (msg.type === "error") {
          console.log("[PhiSpyWorker message]", { type: msg.type, message: msg.message, details: msg.details, elapsedMs: msg.elapsedMs });
          this.worker.removeEventListener("message", handler);
          reject(new Error(`${msg.message}\n${msg.details ?? ""}`));
        } else {
          console.log("[PhiSpyWorker message]", { type: msg.type });
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
        const msg = event.data;
        if (msg.type === "status") {
          console.log("[PhiSpyWorker message]", { type: msg.type, message: msg.message, elapsedMs: msg.elapsedMs });
          onStatus(msg.message, msg.elapsedMs);
        } else if (msg.type === "stdout") {
          console.log("[PhiSpyWorker message]", { type: msg.type, text: msg.text });
          onLog(msg.text, "stdout");
        } else if (msg.type === "stderr") {
          console.log("[PhiSpyWorker message]", { type: msg.type, text: msg.text });
          onLog(msg.text, "stderr");
        } else if (msg.type === "result") {
          // Log only lightweight metadata — not the full file contents
          console.log("[PhiSpyWorker message]", {
            type: msg.type,
            prophageCount: msg.result?.summary?.prophageCount,
            outputFileCount: msg.result?.summary?.outputFileCount,
          });
          this.worker.removeEventListener("message", handler);
          resolve(msg.result as PhiSpyRunResult);
        } else if (msg.type === "error") {
          console.log("[PhiSpyWorker message]", { type: msg.type, message: msg.message, details: msg.details, elapsedMs: msg.elapsedMs });
          this.worker.removeEventListener("message", handler);
          reject(new Error(`${msg.message}\n${msg.details ?? ""}`));
        } else {
          console.log("[PhiSpyWorker message]", { type: msg.type });
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
