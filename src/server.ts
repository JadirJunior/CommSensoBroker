import dotenv from 'dotenv';
import * as aedes from 'aedes';
import * as server from 'net';
import {api} from './api';

import http from 'http';
import ws from 'ws';


dotenv.config();

const sendMeasures = '/commsenso/send-measure'

const Aedes = aedes.createBroker();
const Server = server.createServer(Aedes.handle);
const port = process.env.PORT || 1883;

Server.listen(port, () => {
    console.log('Server started and listening on port ', port);
});


const httpServer = http.createServer();
const wsServer = new ws.Server({ server: httpServer });

wsServer.on('connection', (socket) =>  {
    const stream = ws.createWebSocketStream(socket);
    Aedes.handle(stream);
});

const wsPort = 8888; // Porta para WebSocket
httpServer.listen(wsPort, () => {
    console.log('WebSocket server started and listening on port ', wsPort);
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
        console.log(error);
    }
});
