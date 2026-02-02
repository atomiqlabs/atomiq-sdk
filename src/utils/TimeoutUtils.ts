/**
 * Returns a promise that resolves after given amount seconds
 *
 * @param timeout how many milliseconds to wait for
 * @param abortSignal
 * @category Utilities
 */
export function timeoutPromise(timeout: number, abortSignal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        if (abortSignal != null && abortSignal.aborted) {
            reject(abortSignal.reason);
            return;
        }

        let abortSignalListener: () => void;
        let timeoutHandle: any | null = setTimeout(() => {
            if (abortSignalListener != null && abortSignal != null) abortSignal.removeEventListener("abort", abortSignalListener);
            resolve();
        }, timeout);

        if (abortSignal != null) {
            abortSignal.addEventListener("abort", abortSignalListener = () => {
                if (timeoutHandle != null) clearTimeout(timeoutHandle);
                timeoutHandle = null;
                reject(abortSignal.reason);
            });
        }
    });
}

/**
 * Returns an abort signal that aborts after a specified timeout in milliseconds
 *
 * @param timeout Milliseconds to wait
 * @param abortReason Abort with this abort reason
 * @param abortSignal Abort signal to extend
 * @category Utilities
 */
export function timeoutSignal(timeout: number, abortReason?: any, abortSignal?: AbortSignal): AbortSignal {
    if (timeout == null) throw new Error("Timeout seconds cannot be null!");
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(abortReason || new Error("Timed out")), timeout);
    if (abortSignal != null) {
        abortSignal.addEventListener("abort", () => {
            clearTimeout(timeoutHandle);
            abortController.abort(abortSignal.reason);
        });
    }
    return abortController.signal;
}