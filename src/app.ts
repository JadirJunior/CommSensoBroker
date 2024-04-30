import mqtt, { connect } from 'mqtt';

const protocol = `${process.env.MQTT_PROTOCOL || 'mqtts'}`;
const host = `${process.env.MQTT_HOST || 'broker.hivemq.com'}`;
const port = `${process.env.MQTT_PORT || 8883}`;
const clientId = `mqtt_${Math.random().toString(16).slice(3)}`
const connectUrl = `${protocol}://${host}:${port}`

const client = mqtt.connect(connectUrl, {
    clientId,
    clean: true,
    connectTimeout: 4000,
    username: `${process.env.MQTT_USER || 'mqtt_user'}`,
    password: `${process.env.MQTT_PASSWORD || 'mqtt_user'}`,
    reconnectPeriod: 1000,
})


export default client;