import { InputSchema } from "./ApiTypes";
/**
 * Parses raw input values according to the endpoint schema.
 *
 * This accepts untyped transport input such as HTTP query params, JSON request bodies,
 * or CLI arguments and returns the normalized callback input type.
 *
 * @category API
 */
export declare function parseApiInput<TInput>(inputSchema: InputSchema<TInput>, rawInput: unknown): TInput;
