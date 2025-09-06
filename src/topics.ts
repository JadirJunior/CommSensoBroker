// List publish/subscribe topics authorized foreach role
import { ConnCtx, ns } from "./utils/adapters";

export const authorizePublish = (ctx: ConnCtx, topic: string) => {
	const n = ns(ctx);
	switch (ctx.role) {
		case "service":
			return topic.startsWith("bootstrap/");
		case "app":
			return topic === `${n.cmd}/power` || topic === `${n.cmd}/cfg`;
		case "device":
			return (
				topic === n.state || topic === n.measure || topic === `${n.cmd}/ack`
			);
		default:
			return false;
	}
};

export const authorizeSubscribe = (ctx: ConnCtx, topic: string) => {
	const n = ns(ctx);

	console.log("Authorize subscribe", ctx.role, topic, n);

	switch (ctx.role) {
		case "onboarding":
			return topic === `bootstrap/${ctx.deviceId}`;
		case "device":
			return topic === `${n.cmd}/power` || topic === `${n.cmd}/cfg`;
		case "app":
			return topic === `${n.cmd}/ack` || topic === n.state;
		default:
			return false;
	}
};
