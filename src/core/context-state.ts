import type {
  KernelValue,
  Ref,
  RefsApi,
  RunAncestorsOptions,
  RunDescendantsOptions,
  RunRef,
  RunRecord,
  RunSummary,
  SessionRecentOptions,
  StateApi,
  StateRunsApi,
  TopLevelRunsOptions,
} from "./types.ts";
import type { SessionStore } from "../session/index.ts";
import { cellRefFromRunRef, valueRefFromRef } from "../session/store-refs.ts";
import {
  publicKernelValueFromStored,
  runRecordFromCellRecord,
  runSummaryFromCellSummary,
} from "./types.ts";

export class CommandRefs implements RefsApi {
  constructor(
    private readonly store: SessionStore,
    private readonly cwd: string,
  ) {}

  async read<T>(ref: Ref): Promise<T> {
    return publicKernelValueFromStored(this.store.readRef(valueRefFromRef(ref)) as KernelValue) as T;
  }

  async stat(ref: Ref) {
    return this.store.statRef(valueRefFromRef(ref));
  }

  async writeToFile(ref: Ref, path: string): Promise<void> {
    this.store.writeRefToFile(valueRefFromRef(ref), path, this.cwd);
  }
}

export class CommandRuns implements StateRunsApi {
  constructor(
    private readonly store: SessionStore,
    private readonly currentCellId: string,
  ) {}

  async recent(options?: SessionRecentOptions): Promise<RunSummary[]> {
    return this.store.recent({
      ...options,
      excludeCellId: this.currentCellId,
    }).map(runSummaryFromCellSummary);
  }

  async latest(options?: SessionRecentOptions): Promise<RunSummary | undefined> {
    const summary = this.store.latest({
      ...options,
      excludeCellId: this.currentCellId,
    });
    return summary ? runSummaryFromCellSummary(summary) : undefined;
  }

  async topLevelRuns(options?: TopLevelRunsOptions): Promise<RunSummary[]> {
    return this.store.topLevelRuns(options).map(runSummaryFromCellSummary);
  }

  async get(run: RunRef): Promise<RunRecord> {
    return runRecordFromCellRecord(this.store.sessionId, this.store.readCell(cellRefFromRunRef(run)));
  }

  async parent(run: RunRef): Promise<RunSummary | undefined> {
    const summary = this.store.parent(cellRefFromRunRef(run));
    return summary ? runSummaryFromCellSummary(summary) : undefined;
  }

  async children(run: RunRef, options?: Omit<RunDescendantsOptions, "maxDepth">): Promise<RunSummary[]> {
    return this.store.children(cellRefFromRunRef(run), options).map(runSummaryFromCellSummary);
  }

  async ancestors(run: RunRef, options?: RunAncestorsOptions): Promise<RunSummary[]> {
    return this.store.ancestors(cellRefFromRunRef(run), options).map(runSummaryFromCellSummary);
  }

  async descendants(run: RunRef, options?: RunDescendantsOptions): Promise<RunSummary[]> {
    return this.store.descendants(cellRefFromRunRef(run), options).map(runSummaryFromCellSummary);
  }
}

export class CommandState implements StateApi {
  readonly refs: RefsApi;
  readonly runs: StateRunsApi;

  constructor(store: SessionStore, cwd: string, currentCellId: string) {
    this.refs = new CommandRefs(store, cwd);
    this.runs = new CommandRuns(store, currentCellId);
  }
}
