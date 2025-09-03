import axios, { Axios, AxiosResponse } from "axios";
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
		requests.post("measure", data),

	authenticateMqtt: ({
		deviceId,
		username,
		password,
	}: {
		deviceId: string;
		username: string;
		password: string;
	}) =>
		requests.post(
			"internal/mqtt/auth",
			{ client_id: deviceId, username, password },
			cfg.api.brokerToken
		),
};
