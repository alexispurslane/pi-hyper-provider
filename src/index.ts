import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { registerCreditStatus } from "./credits.js";
import { HYPER_API_BASE_URL, PROVIDER_DISPLAY_NAME, PROVIDER_NAME } from "./hyper.js";
import { fetchHyperModels } from "./models.js";
import { createNotifier } from "./notify.js";
import { loginHyper, refreshHyperToken } from "./oauth.js";
import { migrateHyperSettings } from "./settings.js";

const HYPER_API_KEY_ENV = "HYPER_API_KEY";

export default function (pi: ExtensionAPI) {
	const notifier = createNotifier();
	pi.on("session_start", (_event, ctx) => {
		notifier.activate(ctx);
	});

	try {
		migrateHyperSettings(notifier.warn);
	} catch (err) {
		notifier.warn(`Failed to migrate Hyper settings: ${String(err)}`);
	}

	// Only declare an env-var apiKey when the variable is actually set. OMP's
	// auth resolution gives a config-declared apiKey precedence over OAuth, and
	// an unset env var resolves to the literal "HYPER_API_KEY" string — which
	// would be sent as the bearer token (malformed JWT → 401) instead of the
	// OAuth access token from /login.
	const apiKeyEnvValue = process.env[HYPER_API_KEY_ENV];

	pi.registerProvider(PROVIDER_NAME, {
		baseUrl: HYPER_API_BASE_URL,
		api: "openai-completions",
		...(apiKeyEnvValue ? { apiKey: HYPER_API_KEY_ENV } : {}),
		oauth: {
			name: PROVIDER_DISPLAY_NAME,
			login: loginHyper,
			refreshToken: refreshHyperToken,
			getApiKey: (credential) => credential.access,
		},
		fetchDynamicModels: () => fetchHyperModels(),
	});

	registerCreditStatus(pi, notifier.warn);
}
