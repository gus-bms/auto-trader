import { z } from "zod";

import type { AnalystDecisionOutput, AnalystLlmInput } from "@app/domain";

import { analystDecisionOutputSchema } from "./analyst-decision.schema";

const openAiChatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().min(1)
        })
      })
    )
    .min(1)
});

export interface LlmAnalystClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  endpoint: string;
  fetchFn?: typeof fetch;
}

export class LlmAnalystError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "LlmAnalystError";
  }
}

export class LlmAnalystClient {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: LlmAnalystClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async analyze(input: AnalystLlmInput): Promise<AnalystDecisionOutput> {
    if (this.options.apiKey.trim().length === 0) {
      throw new LlmAnalystError("OPENAI_API_KEY is required for LLM analyst call");
    }

    const response = await this.fetchWithTimeout(this.options.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "analyst_decision",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                decision: {
                  type: "string",
                  enum: ["BUY", "WAIT"]
                },
                confidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 100
                },
                riskLevel: {
                  type: "string",
                  enum: ["LOW", "MEDIUM", "HIGH"]
                },
                rationale: {
                  type: "string",
                  minLength: 1,
                  maxLength: 300
                }
              },
              required: ["decision", "confidence", "riskLevel", "rationale"]
            }
          }
        },
        messages: [
          {
            role: "system",
            content:
              "You are a conservative US stock entry analyst. Return strict JSON only. If uncertain, choose WAIT."
          },
          {
            role: "user",
            content: JSON.stringify(input)
          }
        ]
      })
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new LlmAnalystError(`LLM endpoint returned HTTP ${response.status}: ${responseBody}`);
    }

    const responseJson = (await response.json()) as unknown;
    const parsed = openAiChatCompletionSchema.parse(responseJson);
    const content = parsed.choices[0]?.message.content;
    if (content === undefined) {
      throw new LlmAnalystError("LLM response did not include message content");
    }

    let decisionPayload: unknown;
    try {
      decisionPayload = JSON.parse(content) as unknown;
    } catch (error) {
      throw new LlmAnalystError("LLM output was not valid JSON", error);
    }

    return analystDecisionOutputSchema.parse(decisionPayload);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, this.options.timeoutMs);

    try {
      return await this.fetchFn(url, {
        ...init,
        signal: abortController.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new LlmAnalystError("LLM request timed out", error);
      }

      throw new LlmAnalystError("LLM request failed", error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
