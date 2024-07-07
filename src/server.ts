import dotenv from 'dotenv';
import * as aedes from 'aedes';
import * as server from 'net';
import {api} from './api';


dotenv.config();

const sendMeasures = '/commsenso/send-measure'

const Aedes = aedes.createBroker();
const Server = server.createServer(Aedes.handle);
const port = process.env.PORT || 1883;

Server.listen(port, () => {
    console.log('Server started and listening on port ', port);
});


Aedes.on('client', (client) => {
    console.log(`${client.id} connected`);
});

Aedes.on('clientDisconnect', (client) => {
    console.log(`${client.id} disconnected`);
});


Aedes.on('subscribe', (subscriptions, client) => {
    console.log(`${client.id} subscribed to topics: ${subscriptions.map(sub => sub.topic).join(', ')}`);
});


Aedes.on('unsubscribe', (subscriptions, client) => {
    console.log(`${client.id} unsubscribed to topics: ${subscriptions.map(sub => sub).join(', ')}`);
});

Aedes.on('publish', async (packet, client) => {
    try {
        
        if (packet.topic === sendMeasures) {
            
            const data = JSON.parse(packet.payload.toString());
            console.log(data);
            const ret = await api.sendMeasurement(data);
            console.log(ret);

        }


    } catch (error) {
        console.log('a');
    }
});
