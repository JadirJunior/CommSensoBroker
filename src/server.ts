import dotenv from "dotenv";
import * as aedes from "aedes";
import * as server from "net";
import { api } from "./api";

import http from "http";
import ws from "ws";
import { cfg } from "./config";
import { attachCtx, ConnCtx, getCtx, ns } from "./utils/adapters";
import { clearBootstrap, safeEqualSecret } from "./utils/utils";
import { authorizePublish, authorizeSubscribe } from "./topics";

dotenv.config();

const Aedes = aedes.createBroker();
const Server = server.createServer(Aedes.handle);
const port = cfg.mqtt.tcpPort;

Server.listen(port, () => {
	console.log("Server started and listening on port ", port);
});

const httpServer = http.createServer();
const wsServer = new ws.Server({ server: httpServer });

wsServer.on("connection", (socket) => {
	const stream = ws.createWebSocketStream(socket);
	Aedes.handle(stream);
});

httpServer.listen(cfg.mqtt.wsPort, () => {
	console.log(
		"WebSocket server started and listening on port ",
		cfg.mqtt.wsPort,
	);
});

Aedes.authenticate = async (client, username, password, done) => {
	try {
		/**
		 * Tipos de sessão:
		 * - Onboarding => Autenticação simples com deviceId na senha
		 * - Service => Autenticação com usuário e senha do serviço (variáveis de ambiente do serviço)
		 * - App => Autenticação com usuário do app e senha com JWT (API)
		 * - Device => Autenticação com credenciais do dispositivo fornecidas no onboarding pela API
		 */

		const user = username?.toString() || "";
		const pass = password?.toString() || "";
		const mqttClientId = client.id || "";

		console.log(`Client ${mqttClientId} requesting auth as ${user}`);

		// (A) Sessão de ONBOARDING
		if (user === "onboarding" && pass) {
			console.log("Onboarding");
			attachCtx(client, {
				mqttClientId: pass,
				role: "onboarding",
			});
			return done(null, true);
		}

		// (B) Sessão do Serviço/API: Permite publicação das credenciais para onboarding
		if (
			user === process.env.BROKER_SVC_USER &&
			safeEqualSecret(pass, process.env.BROKER_SVC_PASS || "")
		) {
			console.log("Service Publisher connected");
			attachCtx(client, { role: "service" } as Partial<ConnCtx>);
			return done(null, true);
		}

		// (C) Sessão do aplicativo: verificar credenciais do app com a API
		if (user === process.env.BROKER_APP_USER) {
			console.log("App connecting");
			const r = await api.authenticateApp({
				username: user,
				token: pass,
			});
			if (r?.status === 200 && r?.data) {
				attachCtx(client, {
					mqttClientId,
					role: "app",
					token: pass,
					tenantId: r.data.tenantId,
					scenarioId: r.data.scenarioId,
				});
				return done(null, true);
			} else {
				return done(null, false);
			}
		}

		console.log("Device connecting");
		// (D) Sessão DEVICE: valida com API usando mqttClientId
		const r = await api.authenticateMqtt({
			username: user,
			password: pass,
			mqttClientId,
		});

		const data = r.data;

		if (r?.status !== 200 || !data) {
			console.warn(
				`Authentication failed for device ${mqttClientId}: ${r?.data?.error || "Unknown error"}`,
			);
			return done(null, false);
		}

		if (data.status !== 200) {
			console.warn(`Authentication error: ${data.error || "Unknown error"}`);
			return done(null, false);
		}

		attachCtx(client, {
			mqttClientId,
			deviceScenarioId: r.data.deviceScenarioId,
			deviceId: r.data.deviceId,
			tenantId: r.data.tenantId,
			scenarioId: r.data.scenarioId,
			role: "device",
		});

		clearBootstrap(Aedes, mqttClientId);
		return done(null, true);
	} catch (e) {
		console.error("authenticate error:", e);
		return done(null, false);
	}
};

Aedes.authorizeSubscribe = async (client, sub, done) => {
	try {
		const topic = sub.topic?.toString() || "";
		const ctx = getCtx(client ?? undefined);
		if (!ctx) return done(new Error("unauthorized"));

		// App: valida wildcards com a API
		if (ctx.role === "app") {
			const r = await api.authorizeMqtt({
				token: ctx.token!,
				action: "subscribe",
				topic,
				tenantId: ctx.tenantId,
				scenarioId: ctx.scenarioId,
			});
			if (r?.status === 200 && r.data?.allow) return done(null, sub);
			console.warn(`App subscription forbidden: ${topic}`);
			return done(new Error("forbidden"));
		}

		// Outras roles: valida localmente
		if (!authorizeSubscribe(ctx, topic)) {
			console.warn(`Subscription forbidden for ${ctx.role}: ${topic}`);
			return done(new Error("forbidden"));
		}

		return done(null, sub);
	} catch (error) {
		console.error("authorizeSubscribe error:", error);
		return done(new Error("forbidden"));
	}
};

Aedes.authorizePublish = async (client, packet, done) => {
	try {
		const topic = packet.topic?.toString() || "";
		const ctx = getCtx(client ?? undefined);

		if (!ctx) return done(new Error("unauthorized"));

		if (ctx.role === "app") {
			const r = await api.authorizeMqtt({
				token: ctx.token!,
				action: "publish",
				topic,
			});
			if (r?.status === 200 && r.data?.allow) return done(null);
			return done(new Error("forbidden"));
		}

		if (!authorizePublish(ctx, topic)) {
			console.warn(`Publish forbidden for ${ctx.role}: ${topic}`);
			return done(new Error("forbidden"));
		}

		return done(null);
	} catch {
		return done(new Error("forbidden"));
	}
};

Aedes.on("client", (client) => {
	console.log(`${client.id} connected`);
});

Aedes.on("clientDisconnect", (client) => {
	console.log(`${client.id} disconnected`);
});

Aedes.on("subscribe", (subscriptions, client) => {
	console.log(
		`${client.id} subscribed to topics: ${subscriptions
			.map((sub) => sub.topic)
			.join(", ")}`,
	);
});

Aedes.on("unsubscribe", (subscriptions, client) => {
	console.log(
		`${client.id} unsubscribed to topics: ${subscriptions
			.map((sub) => sub)
			.join(", ")}`,
	);
});

Aedes.on("publish", async (packet, client) => {
	try {
		const ctx = getCtx(client ?? undefined);

		if (!ctx) return;

		const topic = packet.topic?.toString() || "";
		const nx = ns(ctx);

		// Console log para debug (descomente se necessário)
		// console.log(
		// 	`Message from ${client?.id || "BROKER"} on topic ${topic}: ${
		// 		packet.payload.toString().slice(0, 100)
		// 	}`
		// );

		// Processa mensagem de medidas do dispositivo
		if (topic === nx.measure && ctx.role === "device") {
			const data = JSON.parse(packet.payload.toString());
			console.log(`Measure received from ${ctx.mqttClientId}`);

			await api.sendMeasurement({
				...data,
				mqttClientId: ctx.mqttClientId,
				deviceScenarioId: ctx.deviceScenarioId,
				deviceId: ctx.deviceId,
				tenantId: ctx.tenantId,
				scenarioId: ctx.scenarioId,
			});
			return;
		}

		// Processa estado do dispositivo
		if (topic === nx.state && ctx.role === "device") {
			const data = JSON.parse(packet.payload.toString());
			console.log(`State update from ${ctx.mqttClientId}`, data);
			// TODO: Implementar lógica de atualização de estado se necessário
			return;
		}
	} catch (error) {
		console.error("publish error:", error);
	}
});
