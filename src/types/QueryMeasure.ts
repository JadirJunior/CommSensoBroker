

export type QueryMeasure = {
    message: number;
    data: {
        id: number;
        value: number;
        dtMeasure: string;
        sensorId: number;
        containerId: number;
    }
}