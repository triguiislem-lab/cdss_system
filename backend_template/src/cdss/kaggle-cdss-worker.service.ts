import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

type CdssKaggleMode =
  | "draft"
  | "analyze"
  | "evidence"
  | "validate"
  | "localize"
  | "worker_ready";

export interface KaggleCdssJobSubmission {
  jobId: string;
  kernelRef: string;
  status: "submitted";
  mode: CdssKaggleMode;
  workDir: string;
  stdout?: string;
  stderr?: string;
}

@Injectable()
export class KaggleCdssWorkerService {
  private readonly runtimeRoot =
    process.env.CDSS_KAGGLE_RUNTIME_DIR ||
    path.join(process.cwd(), ".runtime", "cdss-kaggle");

  private readonly notebookTemplatePath =
    process.env.CDSS_KAGGLE_NOTEBOOK_TEMPLATE_PATH || "";

  private readonly codeFile =
    process.env.CDSS_KAGGLE_CODE_FILE || "cdss-worker.ipynb";

  private readonly kernelRefMode =
    process.env.CDSS_KAGGLE_KERNEL_REF_MODE || "shared";

  private readonly sharedKernelRef = process.env.CDSS_KAGGLE_KERNEL_REF || "";

  private readonly kernelSlugPrefix =
    process.env.CDSS_KAGGLE_KERNEL_SLUG_PREFIX || "cdss-worker";

  private readonly accelerator = process.env.CDSS_KAGGLE_ACCELERATOR || "";

  private readonly datasetSources = (
    process.env.CDSS_KAGGLE_DATASET_SOURCES || ""
  )
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);

  async submitJob(
    mode: CdssKaggleMode,
    payload: Record<string, unknown>,
    jobId = `cdss-${Date.now()}-${randomUUID().slice(0, 8)}`,
  ): Promise<KaggleCdssJobSubmission> {
    const kernelRef = this.resolveKernelRef(jobId);
    const workDir = await this.prepareKernelFolder(
      jobId,
      kernelRef,
      mode,
      payload,
    );

    const args = ["kernels", "push", "-p", workDir];
    if (this.accelerator) {
      args.push("--accelerator", this.accelerator);
    }

    const { stdout, stderr } = await this.runKaggle(args, 120000);

    return {
      jobId,
      kernelRef,
      status: "submitted",
      mode,
      workDir,
      stdout,
      stderr,
    };
  }

  async getStatus(
    kernelRef: string,
  ): Promise<{ kernelRef: string; raw: string; normalizedStatus: string }> {
    const { stdout } = await this.runKaggle(
      ["kernels", "status", kernelRef],
      60000,
    );
    return {
      kernelRef,
      raw: stdout,
      normalizedStatus: this.normalizeKaggleStatus(stdout),
    };
  }

  async fetchOutput(
    kernelRef: string,
    jobId?: string,
  ): Promise<Record<string, unknown>> {
    const outputDir = path.join(
      this.runtimeRoot,
      "outputs",
      jobId || this.safeName(kernelRef),
    );
    await fs.mkdir(outputDir, { recursive: true });

    await this.runKaggle(
      ["kernels", "output", kernelRef, "-p", outputDir, "-o"],
      300000,
    );

    const candidateFiles = [
      path.join(outputDir, "result.json"),
      path.join(outputDir, "cdss_job_outputs", "cdss_job_result.json"),
      path.join(outputDir, "cdss_worker_outputs", "worker_ready.json"),
      path.join(outputDir, "cdss_worker_outputs", "worker_metrics.json"),
    ];

    for (const file of candidateFiles) {
      try {
        const text = await fs.readFile(file, "utf8");
        return {
          outputDir,
          resultFile: file,
          result: JSON.parse(text) as unknown,
        };
      } catch {
        // Try the next known output contract.
      }
    }

    throw new NotFoundException({
      message:
        "Kaggle output downloaded, but no known CDSS result JSON was found.",
      outputDir,
      expectedFiles: candidateFiles,
    });
  }

  private async prepareKernelFolder(
    jobId: string,
    kernelRef: string,
    mode: CdssKaggleMode,
    payload: Record<string, unknown>,
  ): Promise<string> {
    if (!this.notebookTemplatePath) {
      throw new InternalServerErrorException(
        "Missing CDSS_KAGGLE_NOTEBOOK_TEMPLATE_PATH.",
      );
    }

    const workDir = path.join(this.runtimeRoot, "jobs", jobId);
    await fs.rm(workDir, { recursive: true, force: true });
    await fs.mkdir(workDir, { recursive: true });

    const templateText = await fs.readFile(this.notebookTemplatePath, "utf8");
    const notebook = JSON.parse(templateText) as { cells?: unknown[] };

    const jobPayload = {
      job_id: jobId,
      mode,
      ...payload,
    };

    const payloadCell = {
      cell_type: "code",
      execution_count: null,
      metadata: {
        generated_by: "NestJS KaggleCdssWorkerService",
        cdss_job_id: jobId,
      },
      outputs: [],
      source: [
        "# ============================================================\n",
        "# AUTO-GENERATED CDSS JOB PAYLOAD BY NESTJS\n",
        "# ============================================================\n",
        `JOB_PAYLOAD = ${JSON.stringify(jobPayload, null, 2)}\n`,
      ],
    };

    notebook.cells = [payloadCell, ...(notebook.cells || [])];

    await fs.writeFile(
      path.join(workDir, this.codeFile),
      JSON.stringify(notebook, null, 2),
      "utf8",
    );

    const metadata = {
      id: kernelRef,
      title: process.env.CDSS_KAGGLE_KERNEL_TITLE || "CDSS Prescription Worker",
      code_file: this.codeFile,
      language: "python",
      kernel_type: "notebook",
      is_private: true,
      enable_gpu: true,
      enable_internet: false,
      dataset_sources: this.datasetSources,
      competition_sources: [],
      kernel_sources: [],
      model_sources: [],
    };

    await fs.writeFile(
      path.join(workDir, "kernel-metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf8",
    );

    return workDir;
  }

  private resolveKernelRef(jobId: string): string {
    if (this.kernelRefMode === "per_job") {
      const username = process.env.KAGGLE_USERNAME;
      if (!username) {
        throw new InternalServerErrorException(
          "KAGGLE_USERNAME is required for per_job mode.",
        );
      }
      return `${username}/${this.kernelSlugPrefix}-${this.safeName(jobId)}`;
    }

    if (!this.sharedKernelRef) {
      throw new InternalServerErrorException(
        "Missing CDSS_KAGGLE_KERNEL_REF for shared mode.",
      );
    }
    return this.sharedKernelRef;
  }

  private async runKaggle(
    args: string[],
    timeout: number,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync("kaggle", args, {
        timeout,
        env: {
          ...process.env,
          KAGGLE_USERNAME: process.env.KAGGLE_USERNAME,
          KAGGLE_KEY: process.env.KAGGLE_KEY,
        },
      });
    } catch (error) {
      const err = error as {
        message?: string;
        stdout?: string;
        stderr?: string;
      };
      throw new InternalServerErrorException({
        message: "Kaggle CLI command failed.",
        command: `kaggle ${args.join(" ")}`,
        error: err.message,
        stdout: err.stdout,
        stderr: err.stderr,
      });
    }
  }

  private normalizeKaggleStatus(raw: string): string {
    const text = raw.toLowerCase();
    if (text.includes("complete")) return "complete";
    if (text.includes("running")) return "running";
    if (text.includes("error") || text.includes("failed")) return "failed";
    if (text.includes("queued")) return "queued";
    if (text.includes("cancel")) return "cancelled";
    return "unknown";
  }

  private safeName(value: string): string {
    return value.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
  }
}
