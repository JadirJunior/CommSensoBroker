import dotenv from "dotenv";
dotenv.config();

export const cfg = {
	mqtt: {
		tcpPort: parseInt(process.env.MQTT_PORT ?? "1833", 10),
		wsPort: parseInt(process.env.MQTT_WS_PORT ?? "8888", 10),

		tls: {
			enabled: process.env.MQTT_TLS === "1",
			port: parseInt(process.env.MQTT_TLS_PORT ?? "8883", 10),
			cert: process.env.MQTT_TLS_CERT ?? "",
			key: process.env.MQTT_TLS_KEY ?? "",
		},
	},

	api: {
		baseURL: process.env.API_BASE_URL || "http://localhost:3000",
		brokerToken: process.env.BROKER_TOKEN || "token",
		timeoutMs: parseInt(process.env.API_TIMEOUT_MS || "15000", 10),
	},

	ingest: {
		batchSize: parseInt(process.env.INGEST_BATCH_SIZE ?? "200", 10),
		batchMs: parseInt(process.env.INGEST_BATCH_MS ?? "1000", 10),
		maxBackoffMs: parseInt(process.env.INGEST_MAX_BACKOFF_MS ?? "15000", 10),
	},

	limits: {
		maxPayloadBytes: parseInt(process.env.MQTT_MAX_PAYLOAD_BYTES ?? "1024", 10),
		allowQoS2: false,
	},
};
