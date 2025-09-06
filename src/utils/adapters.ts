import * as aedes from "aedes";

export type CtxRoles = "onboarding" | "service" | "app" | "device";

export type ConnCtx = {
	deviceId: string;
	tenantId: string;
	appId: string;

	token?: string;
	role: CtxRoles;
};

export const attachCtx = (client: aedes.Client, ctx: Partial<ConnCtx>) => {
	(client as any).__ctx = { ...(client as any).__ctx, ...ctx };
};

export const getCtx = (client?: aedes.Client): ConnCtx | undefined => {
	return client ? (client as any).__ctx : undefined;
};

export const ns = (ctx: ConnCtx) => {
	const base = `${ctx.tenantId}/${ctx.appId}/devices/${ctx.deviceId}`;
	return {
		base,
		bootstrap: `bootstrap/${ctx.deviceId}`,
		// birth: `${base}/birth`,
		state: `${base}/state`,
		measure: `${base}/measure`,
		// evt: `${base}/evt/`,
		cmd: `${base}/cmd`,
	};
};
