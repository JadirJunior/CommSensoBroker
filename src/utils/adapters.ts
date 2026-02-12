import * as aedes from "aedes";

export type CtxRoles = "onboarding" | "service" | "app" | "device";

export type ConnCtx = {
	mqttClientId: string;
	deviceScenarioId?: string;
	deviceId?: string;
	tenantId?: string;
	scenarioId?: string;

	token?: string;
	role: CtxRoles;
};

export const attachCtx = (client: aedes.Client, ctx: Partial<ConnCtx>) => {
	(client as any).__ctx = { ...(client as any).__ctx, ...ctx };
};

export const getCtx = (client?: aedes.Client): ConnCtx | undefined => {
	return client ? (client as any).__ctx : undefined;
};

/**
 * Namespace de tópicos baseado em mqttClientId
 * Estrutura simplificada: {mqttClientId}/telemetry/{type}
 */
export const ns = (ctx: ConnCtx) => {
	const base = `${ctx.mqttClientId}/telemetry`;

	return {
		// Tópicos do dispositivo
		bootstrap: `bootstrap/${ctx.mqttClientId}`,
		state: `${base}/state`,
		measure: `${base}/measure`,
		cmd: `${ctx.mqttClientId}/cmd`,

		// Padrões para apps (com wildcards) - validados por tenant/scenario
		deviceAll: `${ctx.mqttClientId}/telemetry/#`,
		tenantPattern:
			ctx.tenantId && ctx.scenarioId
				? `${ctx.tenantId}-${ctx.scenarioId}-+/telemetry/#`
				: undefined,
	};
};
