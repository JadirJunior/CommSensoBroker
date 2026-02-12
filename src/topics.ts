// List publish/subscribe topics authorized foreach role
import { ConnCtx, ns } from "./utils/adapters";

/**
 * Valida se dispositivo pode publicar no tópico
 */
export const authorizePublish = (ctx: ConnCtx, topic: string) => {
	const n = ns(ctx);

	switch (ctx.role) {
		case "service":
			// Serviço pode publicar em bootstrap e comandos
			return topic.startsWith("bootstrap/") || topic.includes("/cmd");

		case "device":
			// Device só pode publicar em seus próprios tópicos de telemetria
			return (
				topic === n.state || topic === n.measure || topic === `${n.cmd}/ack`
			);

		case "app":
			// App pode enviar comandos (validado pela API)
			return topic.includes("/cmd");

		default:
			return false;
	}
};

/**
 * Valida se cliente pode se inscrever no tópico
 * IMPORTANTE: Wildcards são validados aqui
 */
export const authorizeSubscribe = (ctx: ConnCtx, topic: string) => {
	const n = ns(ctx);

	switch (ctx.role) {
		case "onboarding":
			// Onboarding só pode se inscrever no próprio bootstrap
			return topic === `bootstrap/${ctx.mqttClientId}`;

		case "device":
			// Device só se inscreve em comandos (sem wildcards)
			return topic === n.cmd || topic.startsWith(`${n.cmd}/`);

		case "service":
			// Service pode se inscrever em qualquer tópico de telemetria
			// Aceita tanto tópicos específicos quanto wildcards
			// Padrões válidos:
			// - +/telemetry/#
			// - +/telemetry/measure
			// - +/telemetry/state
			// - {deviceId}/telemetry/measure
			if (topic.includes("/telemetry/")) return true;
			if (topic === n.measure || topic === n.state) return true;
			// Aceita wildcards que incluem telemetry
			if (topic.match(/^\+\/telemetry\/(#|measure|state)$/)) return true;
			return false;

		case "app":
			// App: wildcards são validados pela API (ver Aedes.authorizeSubscribe)
			// Esta função não é usada para apps
			return false;

		default:
			return false;
	}
};

/**
 * Valida se um tópico com wildcard é permitido para o contexto
 * Verifica se o wildcard não extrapola o escopo do tenant/scenario
 */
export const isWildcardAllowed = (ctx: ConnCtx, topic: string): boolean => {
	if (!ctx.tenantId || !ctx.scenarioId) return false;

	// Prefixo esperado: {tenantId}-{scenarioId}-
	const allowedPrefix = `${ctx.tenantId}-${ctx.scenarioId}-`;

	// Remove wildcards para verificar prefixo
	const topicPrefix = topic.split("/")[0].replace(/[+#]/g, "");

	// Se o tópico começa com o prefixo permitido, OK
	if (topic.startsWith(allowedPrefix)) return true;

	// Verifica padrões seguros
	const safePatterns = [
		`${allowedPrefix}+/telemetry/#`,
		`${allowedPrefix}+/telemetry/measure`,
		`${allowedPrefix}+/telemetry/state`,
	];

	return safePatterns.includes(topic);
};
