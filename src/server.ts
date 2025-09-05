import dotenv from "dotenv";
import * as aedes from "aedes";
import * as server from "net";
import { api } from "./api";

import http from "http";
import ws from "ws";
import { cfg } from "./config";
import { attachCtx, ConnCtx, getCtx, ns } from "./utils/adapters";
import { clearBootstrap, safeEqualSecret } from "./utils/utils";

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

/*
Passos: 
- Onboarding para primeiro acesso utilizando a rota de redeemDevice passando o code e o deviceId vindo do esp - OK
- Autenticação e validação do dispositivo no broker mqtt para primeiro acesso - OK
- Solicitação dos dados do device pelo broker - OK
- Resposta com os dados solicitados ou erro de autorização - OK
- Verificação de permissões para publicação e assinatura de tópicos - OK
- Sessão do dispositivo validada com broker - OK
- Recebimento dos dados e envio das medições por lote pra api
*/

Aedes.authenticate = async (client, username, password, done) => {
	try {
		const user = username?.toString() || "";
		const pass = password?.toString() || "";
		const deviceId = client.id || "";

		// (A) Sessão de ONBOARDING
		if (user === "onboarding" && deviceId) {
			attachCtx(client, { deviceId, isOnboarding: true });
			return done(null, true);
		}

		// (B) Sessão do Serviço: Permite publicação das credenciais para onboarding
		if (
			user === process.env.BROKER_SVC_USER &&
			safeEqualSecret(pass, process.env.BROKER_SVC_PASS || "")
		) {
			console.log("Service Publisher connected");
			attachCtx(client, { isServicePublisher: true } as Partial<ConnCtx>);
			return done(null, true);
		}

		// (C) Sessão NORMAL: valida API
		const r = await api.authenticateMqtt({
			username: user,
			password: pass,
			deviceId,
		});

		if (r?.status === 200 && r?.data?.deviceId) {
			attachCtx(client, {
				deviceId: r.data.deviceId,
				tenantId: r.data.tenantId,
				appId: r.data.appId,
				isOnboarding: false,
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

Aedes.authorizeSubscribe = (client, sub, done) => {
	try {
		const topic = sub.topic?.toString() || "";
		const ctx = getCtx(client ?? undefined);

		// SERVICE: Serviço interno para salvar primeiras credenciais
		if (ctx?.isServicePublisher) return done(new Error("forbidden"));

		// ONBOARDING: só o próprio bootstrap
		if (ctx?.isOnboarding) {
			console.log("Onboardingg");
			const allowed = `bootstrap/${ctx.deviceId}`;
			return topic === allowed ? done(null, sub) : done(new Error("forbidden"));
		}

		if (!ctx) return done(new Error("unauthorized"));
		const { cmd } = ns(ctx);
		if (topic === cmd.slice(0, -1) || topic.startsWith(cmd)) {
			return done(null, sub);
		}
		return done(new Error("forbidden"));
	} catch {
		return done(new Error("forbidden"));
	}
};

Aedes.authorizePublish = (client, packet, done) => {
	try {
		const topic = packet.topic?.toString() || "";
		const ctx = getCtx(client ?? undefined);

		console.log("Autorizando publish em", topic, "por", client?.id);
		if (ctx?.isServicePublisher)
			return topic.startsWith("bootstrap/")
				? done(null)
				: done(new Error("forbidden"));

		if (ctx?.isOnboarding) return done(new Error("forbidden"));
		if (!ctx) return done(new Error("unauthorized"));

		const n = ns(ctx);
		const ok =
			topic === n.birth ||
			topic === n.state ||
			topic === n.measure ||
			topic.startsWith(n.evt);

		return ok ? done(null) : done(new Error("forbidden"));
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
