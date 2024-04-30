import dotenv from 'dotenv';

dotenv.config();

import client from './app';

const topic = '/commsenso/sensores'

client.on('connect', () => {
    console.log('Connected to MQTT broker');

    client.subscribe([topic], () => {
        console.log(`Subscribed to topic: ${topic}`)
        
        client.publish(topic, JSON.stringify(`NodeJS MQTT client connected to broker`), {qos: 0, retain: false}, (error) => {
            if (error)
                console.log(error);
        });

    });
});

client.on('message', (topic, payload) => {
    try {
        const message = payload.toString();

        const data = JSON.parse(message);

        console.log(data);

    } catch (error) {
        throw new Error('Error');
        console.log('Error parsing message', error)
    }
    
});

client.on('error', (error) => {
    console.error('connection failed', error)
});