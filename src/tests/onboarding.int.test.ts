import mqtt, { IClientOptions, MqttClient } from "mqtt";
import crypto, {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

// ====== CONFIG via env ======
const BROKER_URL = process.env.BROKER_URL || "mqtt://localhost:1883";
const SVC_USER = process.env.BROKER_SVC_USER || "api-publisher";
const SVC_PASS = process.env.BROKER_SVC_PASS || "super-secreto";

const DEVICE_ID = process.env.DEVICE_ID || "dev-999"; // clientId do onboarding
const REDEEM_CODE = process.env.REDEEM_CODE || "ABC-123"; // o code (vira a chave p/ cifra)

const TENANT_ID = process.env.TENANT_ID || "t-tenant";
const APP_ID = process.env.APP_ID || "a-app";
const MQTT_USER = process.env.MQTT_USER || "dev-999-user"; // credenciais finais reconhecidas pela sua API
const MQTT_PASS = process.env.MQTT_PASS || "dev-999-pass";

// ====== helpers MQTT ======
function connectClient(url: string, opts: IClientOptions): Promise<MqttClient> {
	return new Promise((resolve, reject) => {
		const c = mqtt.connect(url, { ...opts, reconnectPeriod: 0 });
		const onErr = (e: any) => {
			c.end(true);
			reject(e);
		};
		c.once("error", onErr);
		c.once("connect", () => {
			c.removeListener("error", onErr);
			resolve(c);
		});
	});
}

function subscribeOnce(
	c: MqttClient,
	topic: string,
	qos = 1
): Promise<{ qos: number }> {
	return new Promise((resolve, reject) => {
		c.subscribe(topic, { qos: qos as 0 | 1 | 2 }, (err, granted) => {
			if (err) return reject(err);
			resolve({ qos: granted?.[0]?.qos ?? -1 });
		});
	});
}

function publishQoS1(
	c: MqttClient,
	topic: string,
	payload: string | Buffer,
	retain = false
): Promise<void> {
	return new Promise((resolve, reject) => {
		c.publish(topic, payload, { qos: 1, retain }, (err) =>
			err ? reject(err) : resolve()
		);
	});
}

function waitMessage(
	c: MqttClient,
	topic: string,
	timeoutMs = 2000
): Promise<{ payload: Buffer; retain: boolean }> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("timeout waiting message")),
			timeoutMs
		);
		const handler = (t: string, m: Buffer, pkt: any) => {
			if (t === topic) {
				clearTimeout(timer);
				c.removeListener("message", handler);
				resolve({ payload: m, retain: !!pkt?.retain });
			}
		};
		c.on("message", handler);
	});
}
export type AesGcmPayload = {
	v: 1;
	alg: "A256GCM";
	iv: string; // base64url(12 bytes)
	tag: string; // base64url(16 bytes)
	data: string; // base64url(ciphertext)
	aad?: string; // base64url(AAD), opcional (ex.: deviceId)
};

// ---------- helpers ----------
const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64u = (u8: Uint8Array) =>
	Buffer.from(u8)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

const fromB64u = (s: string) =>
	new Uint8Array(
		Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")
	);

const view = (buf: Buffer) =>
	new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

function concatU8(a: Uint8Array, b: Uint8Array): Uint8Array {
	const out = new Uint8Array(a.length + b.length);
	out.set(a, 0);
	out.set(b, a.length);
	return out;
}

export function encryptByCode(
	code: string,
	obj: unknown,
	aad?: string | Uint8Array
): AesGcmPayload {
	const key = new Uint8Array(
		createHash("sha256").update(code, "utf8").digest()
	); // Uint8Array 32B
	const ivB = randomBytes(12); // Buffer 12B
	const iv = view(ivB); // Uint8Array view

	const cipher = createCipheriv("aes-256-gcm", key, iv);

	// AAD opcional (amarra a um identificador)
	let aadU8: Uint8Array | undefined;
	if (aad) {
		aadU8 = typeof aad === "string" ? enc.encode(aad) : aad;
		cipher.setAAD(aadU8); // aceita ArrayBufferView
	}

	const plainU8 = enc.encode(JSON.stringify(obj));
	const p1 = view(cipher.update(plainU8)); // Buffer -> Uint8Array view
	const p2 = view(cipher.final());
	const ct = concatU8(p1, p2);

	const tag = view(cipher.getAuthTag()); // 16B

	return {
		v: 1,
		alg: "A256GCM",
		iv: toB64u(iv),
		tag: toB64u(tag),
		data: toB64u(ct),
		...(aadU8 && { aad: toB64u(aadU8) }),
	};
}

export function decryptByCode<T = unknown>(
	code: string,
	payload: AesGcmPayload,
	opts?: { aad?: string | Uint8Array } // passe o MESMO AAD usado na cifra (se houver)
): T {
	const key = new Uint8Array(
		createHash("sha256").update(code, "utf8").digest()
	);
	const iv = fromB64u(payload.iv);
	const tag = fromB64u(payload.tag);
	const ct = fromB64u(payload.data);

	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	if (opts?.aad) {
		const aadU8 =
			typeof opts.aad === "string" ? enc.encode(opts.aad) : opts.aad;
		decipher.setAAD(aadU8);
	} else if (payload.aad) {
		decipher.setAAD(fromB64u(payload.aad));
	}
	decipher.setAuthTag(tag);

	const d1 = view(decipher.update(ct));
	const d2 = view(decipher.final());
	const pt = concatU8(d1, d2);

	return JSON.parse(dec.decode(pt)) as T;
}

// ====== topics ======
const topicBootstrap = `bootstrap/${DEVICE_ID}`;
const base = `${TENANT_ID}/${APP_ID}/devices/${DEVICE_ID}`;
const tBirth = `${base}/birth`;
const tState = `${base}/state`;
const tMeasure = `${base}/measure`;
const tEvtFoo = `${base}/evt/foo`;
const tCmdAll = `${base}/cmd/#`;

jest.setTimeout(30_000);

describe("Broker Onboarding e Sessão Normal", () => {
	// 1) limpar bootstrap antes
	test("service publisher publica bootstrap retained (e limpa pré-existente)", async () => {
		const service = await connectClient(BROKER_URL, {
			username: SVC_USER,
			password: SVC_PASS,
			clientId: `${DEVICE_ID}`,
			clean: true,
		});

		// limpa qualquer retained antigo
		await publishQoS1(service, topicBootstrap, "", true);

		// publica o bootstrap sealed
		const clear = {
			ok: true,
			flow: "onboarding",
			next: "reconnect_with_issued_credentials",
			mqtt: { username: MQTT_USER, password: MQTT_PASS },
			tenantId: TENANT_ID,
			appId: APP_ID,
			deviceClientId: DEVICE_ID,
		};

		const sealed = encryptByCode(REDEEM_CODE, clear, DEVICE_ID);
		console.log("sealed:", sealed);
		await publishQoS1(
			service,
			topicBootstrap,
			Buffer.from(JSON.stringify(sealed), "utf8"),
			true
		);

		service.end(true);
	});

	// 2) device onboarding recebe retained
	test("device onboarding só assina bootstrap/<deviceId> e recebe retained", async () => {
		const devOnb = await connectClient(BROKER_URL, {
			clientId: DEVICE_ID,
			username: "onboarding",
			clean: true,
		});
		const { qos } = await subscribeOnce(devOnb, topicBootstrap, 1);
		expect([0, 1, 2].includes(qos)).toBeTruthy(); // SUBACK OK

		// começa a ouvir
		devOnb.subscribe(topicBootstrap); // redundante, mas garante que estamos recebendo
		devOnb.on("message", () => {
			/* noop, waitMessage fará o filtro */
		});

		const msg = await waitMessage(devOnb, topicBootstrap, 4000);
		expect(msg.retain).toBe(true); // deve vir retido
		const sealed = JSON.parse(msg.payload.toString("utf8"));
		expect(sealed).toHaveProperty("iv");
		expect(sealed).toHaveProperty("tag");
		expect(sealed).toHaveProperty("data");

		console.log("sealed recebido:", sealed);
		const clear = decryptByCode(REDEEM_CODE, sealed, { aad: DEVICE_ID });
		console.log("clear:", clear);
		expect(clear).toHaveProperty("ok", true);
		devOnb.end(true);
	});

	// 3) sessão normal autentica e consegue operar no namespace
	// test("device normal autentica e publica/subscreve no namespace", async () => {
	// 	const dev = await connectClient(BROKER_URL, {
	// 		clientId: DEVICE_ID, // ou outro clientId se sua API esperar
	// 		username: MQTT_USER,
	// 		password: MQTT_PASS,
	// 		clean: true,
	// 	});

	// 	// subscribe a cmd/#
	// 	const g = await subscribeOnce(dev, tCmdAll, 1);
	// 	expect([0, 1, 2].includes(g.qos)).toBeTruthy();

	// 	// publish permitido (QoS1) em measure
	// 	await publishQoS1(
	// 		dev,
	// 		tMeasure,
	// 		JSON.stringify({ ping: Date.now() }),
	// 		false
	// 	);

	// 	dev.end(true);
	// });

	// // 4) após login normal, retained do bootstrap deve estar limpo
	// test("bootstrap/<deviceId> não entrega mais retained após sessão normal", async () => {
	// 	const probe = await connectClient(BROKER_URL, {
	// 		clientId: `probe-${Date.now()}`,
	// 		clean: true,
	// 	});
	// 	const { qos } = await subscribeOnce(probe, topicBootstrap, 1);
	// 	expect([0, 1, 2].includes(qos)).toBeTruthy();

	// 	// se o retained tivesse, chegaria imediatamente; esperamos um pouco e não deve vir nada
	// 	let got = false;
	// 	const timer = setTimeout(() => {
	// 		/* timeout OK */
	// 	}, 600);
	// 	probe.on("message", () => {
	// 		got = true;
	// 	});
	// 	await new Promise((r) => setTimeout(r, 700));
	// 	clearTimeout(timer);

	// 	probe.end(true);
	// 	expect(got).toBe(false);
	// });
});
