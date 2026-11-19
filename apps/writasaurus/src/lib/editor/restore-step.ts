const RESTORE_STEP_TIMEOUT_MS = 10_000;

export class ProjectRestoreTimeout extends Error {
  constructor(step: string) {
    super(`The browser took too long to ${step}.`);
  }
}

export async function restoreStep<T>(step: string, operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProjectRestoreTimeout(step)), RESTORE_STEP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
