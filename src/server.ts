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

const sendMeasures = "/commsenso/send-measure";

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
		cfg.mqtt.wsPort
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
		const deviceId = client.id || "";

		console.log(`Client ${client.id} requesting auth as ${user}`);

		// (A) Sessão de ONBOARDING
		if (user === "onboarding" && pass) {
			console.log("Onboarding");
			attachCtx(client, { deviceId: pass, role: "onboarding" });
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
			if (r?.status === 200) {
				attachCtx(client, {
					role: "app",
					token: pass,
				});
				return done(null, true);
			} else {
				return done(null, false);
			}
		}

		console.log("Device connecting");
		// (D) Sessão NORMAL: valida API para o dispositivo
		const r = await api.authenticateMqtt({
			username: user,
			password: pass,
			deviceId,
		});

		if (r?.status === 200 && r?.data?.deviceId) {
			console.log("Device authenticated", r.data);
			attachCtx(client, {
				deviceId: r.data.deviceId,
				tenantId: r.data.tenantId,
				appId: r.data.appId,
				role: "device",
			});

			clearBootstrap(Aedes, r.data.deviceId);
			return done(null, true);
		}

		return done(null, false);
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

		if (ctx.role === "app") {
			const r = await api.authorizeMqtt({
				token: ctx.token!,
				action: "subscribe",
				topic,
			});
			console.log("Response: ", r);
			if (r?.status === 200 && r.data?.allow) return done(null, sub);
			return done(new Error("forbidden"));
		}

		if (!authorizeSubscribe(ctx, topic)) return done(null, null);

		return done(null, sub);
	} catch (error) {
		console.error("authorizeSubscribe error:", error);
		return done(null, null);
		// return done(new Error("forbidden"));
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

		if (!authorizePublish(ctx, topic)) return done(new Error("forbidden"));

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
			.join(", ")}`
	);
});

Aedes.on("unsubscribe", (subscriptions, client) => {
	console.log(
		`${client.id} unsubscribed to topics: ${subscriptions
			.map((sub) => sub)
			.join(", ")}`
	);
});

Aedes.on("publish", async (packet, client) => {
	try {
		if (packet.topic === sendMeasures) {
			const data = JSON.parse(packet.payload.toString());
			console.log(data);
			const ret = await api.sendMeasurement(data);
			console.log(ret);
		}
	} catch (error) {
		console.log(error);
	}
});
