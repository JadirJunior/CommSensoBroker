import axios, { Axios, AxiosResponse } from 'axios';
import { QueryMeasure } from './types/QueryMeasure';

const instance = axios.create({
    baseURL: process.env.BASE_URL || 'http://localhost:3000/',
    timeout: 15000
});

const responseBody = (response: AxiosResponse) => response.data;

const requests = {
    get: (url: string) => instance.get(url).then(responseBody),
    post: (url: string, body: {}) => instance.post(url, body).then(responseBody),
    put: (url: string, body: {}) => instance.put(url, body).then(responseBody),
    delete: (url: string) => instance.delete(url).then(responseBody)
}

export const api = {
    sendMeasurement: (data: {}): Promise<QueryMeasure | any> => requests.post('measure', data)
}