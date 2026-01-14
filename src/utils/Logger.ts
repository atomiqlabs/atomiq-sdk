export type LoggerType = {
    debug: (msg: string, ...args: any[]) => void,
    info: (msg: string, ...args: any[]) => void,
    warn: (msg: string, ...args: any[]) => void,
    error: (msg: string, ...args: any[]) => void
};

export function getLogger(prefix: string): LoggerType {
    return {
        debug: (msg, ...args) => (global as any).atomiqLogLevel >= 3 && console.debug(prefix + msg, ...args),
        info: (msg, ...args) => (global as any).atomiqLogLevel >= 2 && console.info(prefix + msg, ...args),
        warn: (msg, ...args) => ((global as any).atomiqLogLevel == null || (global as any).atomiqLogLevel >= 1) && console.warn(prefix + msg, ...args),
        error: (msg, ...args) => ((global as any).atomiqLogLevel == null || (global as any).atomiqLogLevel >= 0) && console.error(prefix + msg, ...args)
    };
}