import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import type { ThinkingConfig } from "@oh-my-pi/pi-catalog/types";
import type { Effort } from "@oh-my-pi/pi-catalog/effort";
import { type Static, Type } from "typebox";
import { fetchJson } from "./http.js";
import { HYPER_API_BASE_URL, HYPER_USER_AGENT } from "./hyper.js";
import { parseSchema } from "./schema.js";

const MODEL_FETCH_TIMEOUT_MS = 3_000;

// `Effort` is a const-enum (not a string-union); the level names are its wire values.
const PI_EFFORTS: readonly Effort[] = [
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as unknown as readonly Effort[];

const ProviderModelSchema = Type.Object(
	{
		id: Type.String({ minLength: 1 }),
		name: Type.String({ minLength: 1 }),
		cost_per_1m_in: Type.Number({ minimum: 0 }),
		cost_per_1m_out: Type.Number({ minimum: 0 }),
		cost_per_1m_in_cached: Type.Number({ minimum: 0 }),
		cost_per_1m_out_cached: Type.Optional(Type.Number({ minimum: 0 })),
		context_window: Type.Integer({ minimum: 1 }),
		default_max_tokens: Type.Integer({ minimum: 1 }),
		can_reason: Type.Boolean(),
		reasoning_levels: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
		default_reasoning_effort: Type.Optional(Type.String({ minLength: 1 })),
		supports_attachments: Type.Boolean(),
	},
	{ additionalProperties: true },
);

const ProviderPayloadSchema = Type.Object(
	{
		models: Type.Array(ProviderModelSchema, { minItems: 1 }),
	},
	{ additionalProperties: true },
);

type ProviderModel = Static<typeof ProviderModelSchema>;

function toProviderModel(model: ProviderModel): ProviderModelConfig {
	const input: ("text" | "image")[] = model.supports_attachments ? ["text", "image"] : ["text"];
	const reasoningLevels = model.reasoning_levels ?? [];
	const supportsReasoningEffort = reasoningLevels.length > 0;
	const thinking = buildThinkingConfig(model, reasoningLevels, supportsReasoningEffort);

	return {
		id: model.id,
		name: model.name,
		api: "openai-completions",
		reasoning: model.can_reason,
		thinking,
		input,
		cost: {
			input: model.cost_per_1m_in,
			output: model.cost_per_1m_out,
			cacheRead: model.cost_per_1m_out_cached ?? 0,
			cacheWrite: model.cost_per_1m_in_cached,
		},
		contextWindow: model.context_window,
		maxTokens: model.default_max_tokens,
		headers: { "User-Agent": HYPER_USER_AGENT },
		compat: {
			supportsStore: false,
			supportsReasoningEffort,
			thinkingFormat: "openai",
			maxTokensField: "max_tokens",
		},
	};
}

/**
 * Build OMP's ThinkingConfig for a Hyper model.
 *
 * Hyper models with reasoning levels expose those levels as pi efforts; models
 * without levels are on/off-only, represented by a single max effort (on means
 * maximum effort, matching upstream pi's on/off handling).
 */
function buildThinkingConfig(
	model: ProviderModel,
	reasoningLevels: string[],
	supportsReasoningEffort: boolean,
): ThinkingConfig | undefined {
	if (!model.can_reason) return undefined;

	const available = new Set(reasoningLevels);
	const efforts = supportsReasoningEffort
		? (PI_EFFORTS.filter(level => available.has(level)) as Effort[])
		: (["max"] as unknown as Effort[]);

	if (efforts.length === 0) return undefined;

	const effortMap: Partial<Record<Effort, string>> = {};
	for (const effort of efforts) {
		effortMap[effort] = effort;
	}

	const config: ThinkingConfig = {
		mode: "effort",
		efforts,
		effortMap,
	};
	const defaultReasoningEffort = model.default_reasoning_effort;
	if (defaultReasoningEffort) {
		const isKnownLevel = (PI_EFFORTS as readonly string[]).includes(defaultReasoningEffort);
		const defaultLevel = isKnownLevel ? (defaultReasoningEffort as Effort) : ("max" as unknown as Effort);
		config.defaultLevel = defaultLevel;
	}
	return config;
}

export async function fetchHyperModels(signal?: AbortSignal): Promise<ProviderModelConfig[]> {
	const payload = await fetchJson(`${HYPER_API_BASE_URL}/provider`, {
		signal,
		timeoutMs: MODEL_FETCH_TIMEOUT_MS,
	});
	const provider = parseSchema(ProviderPayloadSchema, payload, "Hyper /provider response");
	return provider.models.map(toProviderModel);
}
