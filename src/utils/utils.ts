import Aedes from "aedes";

import { createHash, timingSafeEqual } from "crypto";

export const clearBootstrap = (A: Aedes, deviceId: string) => {
	A.publish(
		{
			topic: `bootstrap/${deviceId}`,
			payload: Buffer.alloc(0),
			retain: true,
		} as any,
		(err) => err && console.error("clearBootstrap error:", err)
	);
};

export const safeEqualSecret = (a: string, b: string): boolean => {
	const da = createHash("sha256").update(a, "utf8").digest();
	const db = createHash("sha256").update(b, "utf8").digest();
	return timingSafeEqual(
		new Uint8Array(da.buffer, da.byteOffset, da.byteLength),
		new Uint8Array(db.buffer, db.byteOffset, db.byteLength)
	);
};
