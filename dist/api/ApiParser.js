"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseApiInput = void 0;
// Errors
function invalidInput(path, expected, value) {
    const actualType = value == null ? String(value) : Array.isArray(value) ? "array" : typeof (value);
    return new Error(`Invalid input "${path}", expected ${expected}, got ${actualType}`);
}
function missingInput(path) {
    return new Error(`Missing required input "${path}"`);
}
function invalidAllowedValue(path, allowedValues, value) {
    return new Error(`Invalid input "${path}", expected one of: ${allowedValues.map(val => val.toString()).join(", ")}, got ${value.toString()}`);
}
// Parsers
function parseNumber(path, value) {
    let result;
    if (typeof (value) === "number") {
        result = value;
    }
    else if (typeof (value) === "string") {
        const trimmedValue = value.trim();
        if (trimmedValue === "")
            throw invalidInput(path, "finite number", value);
        result = Number(trimmedValue);
    }
    else
        throw invalidInput(path, "finite number", value);
    if (!Number.isFinite(result))
        throw invalidInput(path, "finite number", value);
    return result;
}
function parseBigInt(path, value) {
    if (typeof (value) === "bigint")
        return value;
    if (typeof (value) === "number") {
        if (!Number.isSafeInteger(value))
            throw invalidInput(path, "safe integer", value);
        return BigInt(value);
    }
    if (typeof (value) === "string") {
        const trimmedValue = value.trim();
        if (!/^[+-]?\d+$/.test(trimmedValue))
            throw invalidInput(path, "integer", value);
        return BigInt(trimmedValue);
    }
    throw invalidInput(path, "integer", value);
}
function parseBoolean(path, value) {
    Boolean(value);
    if (typeof (value) === "boolean")
        return value;
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    throw invalidInput(path, "boolean", value);
}
// Object type check
function isObject(value) {
    return value != null && typeof (value) === "object" && !Array.isArray(value);
}
// Allowed values for enums
function applyAllowedValues(path, value, allowedValues) {
    if (allowedValues != null && !allowedValues.includes(value)) {
        throw invalidAllowedValue(path, allowedValues, value);
    }
    return value;
}
function parseField(field, value, path) {
    switch (field.type) {
        case "string": {
            if (typeof (value) !== "string")
                throw invalidInput(path, "string", value);
            return applyAllowedValues(path, value, field.allowedValues);
        }
        case "number": {
            const parsedValue = parseNumber(path, value);
            return applyAllowedValues(path, parsedValue, field.allowedValues);
        }
        case "bigint": {
            const parsedValue = parseBigInt(path, value);
            return applyAllowedValues(path, parsedValue, field.allowedValues);
        }
        case "boolean":
            return parseBoolean(path, value);
        case "array": {
            if (!Array.isArray(value))
                throw invalidInput(path, "array", value);
            if (field.items == null)
                return [...value];
            return value.map((item, index) => parseField(field.items, item, `${path}[${index}]`));
        }
        case "object": {
            if (!isObject(value))
                throw invalidInput(path, "object", value);
            if (field.properties == null)
                return { ...value };
            return _parseApiInput(field.properties, value, path);
        }
        default:
            throw new Error(`Unsupported input schema type for "${path}": ${field.type}`);
    }
}
function _parseApiInput(inputSchema, rawInput, parentPath = "") {
    if (!isObject(rawInput)) {
        throw invalidInput(parentPath || "input", "object", rawInput);
    }
    const parsedInput = {};
    for (const key in inputSchema) {
        const field = inputSchema[key];
        const value = rawInput[key];
        const path = parentPath === "" ? key : `${parentPath}.${key}`;
        if (value == null) {
            if (field.required)
                throw missingInput(path);
            continue;
        }
        parsedInput[key] = parseField(field, value, path);
    }
    return parsedInput;
}
/**
 * Parses raw input values according to the endpoint schema.
 *
 * This accepts untyped transport input such as HTTP query params, JSON request bodies,
 * or CLI arguments and returns the normalized callback input type.
 *
 * @category API
 */
function parseApiInput(inputSchema, rawInput) {
    return _parseApiInput(inputSchema, rawInput);
}
exports.parseApiInput = parseApiInput;
