import axios, { AxiosResponse } from "axios";
import { QueryMeasure } from "./types/QueryMeasure";
import { cfg } from "./config";

const instance = axios.create({
	baseURL: cfg.api.baseURL,
	timeout: cfg.api.timeoutMs,
});

const responseBody = (response: AxiosResponse) => response.data;

const requests = {
	get: (url: string) => instance.get(url).then(responseBody),
	post: (url: string, body: {}, token?: string) =>
		instance
			.post(url, body, {
				headers: {
					"Content-Type": "application/json",
					...(token && { Authorization: `Bearer ${token}` }),
				},
			})
			.then(responseBody),
	put: (url: string, body: {}) =>
		instance
			.put(url, body, { headers: { "Content-Type": "application/json" } })
			.then(responseBody),
	delete: (url: string) => instance.delete(url).then(responseBody),
};

export const api = {
	sendMeasurement: (data: {}): Promise<QueryMeasure | any> =>
		requests.post("measure", data, cfg.api.brokerToken),

	authenticateMqtt: ({
		mqttClientId,
		username,
		password,
	}: {
		mqttClientId: string;
		username: string;
		password: string;
	}) =>
		requests.post(
			"internal/mqtt/auth-device",
			{ mqtt_client_id: mqttClientId, username, password },
			cfg.api.brokerToken,
		),

	authenticateApp: ({ username, token }: { username: string; token: string }) =>
		requests.post(
			"internal/mqtt/auth-app",
			{ username, token },
			cfg.api.brokerToken,
		),

	authorizeMqtt: ({
		token,
		action,
		topic,
		tenantId,
		scenarioId,
	}: {
		token: string;
		action: string;
		topic: string;
		tenantId?: string;
		scenarioId?: string;
	}) =>
		requests.post(
			"internal/mqtt/authorize",
			{ token, action, topic, tenant_id: tenantId, scenario_id: scenarioId },
			cfg.api.brokerToken,
		),
};
