import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { registerCreditStatus } from "./credits.js";
import { HYPER_API_BASE_URL, PROVIDER_DISPLAY_NAME, PROVIDER_NAME } from "./hyper.js";
import { fetchHyperModels } from "./models.js";
import { createNotifier } from "./notify.js";
import { loginHyper, refreshHyperToken } from "./oauth.js";
import { migrateHyperSettings } from "./settings.js";

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

	pi.registerProvider(PROVIDER_NAME, {
		baseUrl: HYPER_API_BASE_URL,
		api: "openai-completions",
		apiKey: "HYPER_API_KEY",
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
