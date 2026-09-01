/**
 * The seam every job function depends on instead of a concrete Anthropic SDK client. Production
 * code gets `createAnthropicParseFn(getAnthropicClient())`; every test injects a fake `ParseFn`
 * that never touches the network or a real API key. This is what makes the validation/repair/
 * fallback logic in `src/jobs/*` fully unit-testable.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AutoParseableOutputFormat } from '@anthropic-ai/sdk/lib/parser';

export interface ParseCallArgs<T> {
  model: string;
  maxTokens: number;
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  /** Pre-built via `zodOutputFormat(schema)` (see `src/schemas.ts`) — built once per schema at
   *  module load, not per call, so this seam never has to know about zod's own types. */
  outputFormat: AutoParseableOutputFormat<T>;
}

export interface ParseCallResult<T> {
  /** `null` if the response did not conform to the schema — the caller must not trust a null
   *  output as "empty," only as "unparseable." */
  parsedOutput: T | null;
  cacheReadInputTokens: number;
}

export type ParseFn = <T>(args: ParseCallArgs<T>) => Promise<ParseCallResult<T>>;

export function createAnthropicParseFn(client: Anthropic): ParseFn {
  return async <T>(args: ParseCallArgs<T>): Promise<ParseCallResult<T>> => {
    const response = await client.messages.parse({
      model: args.model,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: args.messages,
      output_config: { format: args.outputFormat },
    });
    return {
      parsedOutput: response.parsed_output ?? null,
      cacheReadInputTokens: response.usage?.cache_read_input_tokens ?? 0,
    };
  };
}
