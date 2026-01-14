export type AllOptional<T> = {
    [K in keyof T]?: T[K];
};

export type AllRequired<T> = {
    [K in keyof T]-?: T[K];
};

export type NotNever<T> = [T] extends [never] ? false : true;