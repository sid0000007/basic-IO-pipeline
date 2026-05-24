export const QUEUE_INGESTION_PROCESSING = 'ingestion-processing';

export type QueueName = typeof QUEUE_INGESTION_PROCESSING;

export const KNOWN_QUEUES: ReadonlyArray<QueueName> = [QUEUE_INGESTION_PROCESSING];
