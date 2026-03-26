import {InputSchema, InputSchemaField} from "./ApiTypes";

// Errors
function invalidInput(path: string, expected: string, value: unknown): Error {
    const actualType = value == null ? String(value) : Array.isArray(value) ? "array" : typeof(value);
    return new Error(`Invalid input "${path}", expected ${expected}, got ${actualType}`);
}

function missingInput(path: string): Error {
    return new Error(`Missing required input "${path}"`);
}

function invalidAllowedValue(path: string, allowedValues: readonly (string | number | bigint)[], value: string | number | bigint): Error {
    return new Error(
        `Invalid input "${path}", expected one of: ${allowedValues.map(val => val.toString()).join(", ")}, got ${value.toString()}`
    );
}

// Parsers
function parseNumber(path: string, value: unknown): number {
    let result: number;
    if(typeof(value) === "number") {
        result = value;
    } else if(typeof(value) === "string") {
        const trimmedValue = value.trim();
        if(trimmedValue === "") throw invalidInput(path, "finite number", value);
        result = Number(trimmedValue);
    } else throw invalidInput(path, "finite number", value);

    if(!Number.isFinite(result)) throw invalidInput(path, "finite number", value);
    return result;
}

function parseBigInt(path: string, value: unknown): bigint {
    if(typeof(value) === "bigint") return value;

    if(typeof(value) === "number") {
        if(!Number.isSafeInteger(value)) throw invalidInput(path, "safe integer", value);
        return BigInt(value);
    }

    if(typeof(value) === "string") {
        const trimmedValue = value.trim();
        if(!/^[+-]?\d+$/.test(trimmedValue)) throw invalidInput(path, "integer", value);
        return BigInt(trimmedValue);
    }

    throw invalidInput(path, "integer", value);
}

function parseBoolean(path: string, value: unknown): boolean {
    Boolean(value);
    if(typeof(value) === "boolean") return value;
    if(value === "true") return true;
    if(value === "false") return false;
    throw invalidInput(path, "boolean", value);
}

// Object type check
function isObject(value: unknown): value is Record<string, unknown> {
    return value != null && typeof(value) === "object" && !Array.isArray(value);
}

// Allowed values for enums
function applyAllowedValues<T extends string | number | bigint>(path: string, value: T, allowedValues?: readonly T[]): T {
    if(allowedValues != null && !allowedValues.includes(value)) {
        throw invalidAllowedValue(path, allowedValues, value);
    }
    return value;
}

function parseField<T>(field: InputSchemaField<T>, value: unknown, path: string): T {
    switch(field.type) {
        case "string": {
            if(typeof(value) !== "string") throw invalidInput(path, "string", value);
            return applyAllowedValues(path, value, field.allowedValues as readonly string[] | undefined) as T;
        }
        case "number": {
            const parsedValue = parseNumber(path, value);
            return applyAllowedValues(path, parsedValue, field.allowedValues as readonly number[] | undefined) as T;
        }
        case "bigint": {
            const parsedValue = parseBigInt(path, value);
            return applyAllowedValues(path, parsedValue, field.allowedValues as readonly bigint[] | undefined) as T;
        }
        case "boolean":
            return parseBoolean(path, value) as T;
        case "array": {
            if(!Array.isArray(value)) throw invalidInput(path, "array", value);
            if(field.items == null) return [...value] as T;

            return value.map((item, index) => parseField(field.items as InputSchemaField, item, `${path}[${index}]`)) as T;
        }
        case "object": {
            if(!isObject(value)) throw invalidInput(path, "object", value);
            if(field.properties == null) return {...value} as T;

            return _parseApiInput(field.properties as InputSchema<T>, value, path);
        }
        default:
            throw new Error(`Unsupported input schema type for "${path}": ${(field as InputSchemaField).type}`);
    }
}

function _parseApiInput<TInput>(inputSchema: InputSchema<TInput>, rawInput: unknown, parentPath: string = ""): TInput {
    if(!isObject(rawInput)) {
        throw invalidInput(parentPath || "input", "object", rawInput);
    }

    const parsedInput: Partial<TInput> = {};

    for(const key in inputSchema) {
        const field = inputSchema[key];
        const value = rawInput[key];
        const path = parentPath === "" ? key : `${parentPath}.${key}`;

        if(value == null) {
            if(field.required) throw missingInput(path);
            continue;
        }

        parsedInput[key] = parseField(field as InputSchemaField<TInput[typeof key]>, value, path);
    }

    return parsedInput as TInput;
}

/**
 * Parses raw input values according to the endpoint schema.
 *
 * This accepts untyped transport input such as HTTP query params, JSON request bodies,
 * or CLI arguments and returns the normalized callback input type.
 *
 * @category API
 */
export function parseApiInput<TInput>(inputSchema: InputSchema<TInput>, rawInput: unknown): TInput {
    return _parseApiInput(inputSchema, rawInput);
}
