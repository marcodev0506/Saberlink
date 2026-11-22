import amqp from 'amqplib';

let channel;

export async function getChannel() {
  if (!channel) {
    const conn = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await conn.createChannel();
  }
  return channel;
}

export async function publish(queue, message) {
  const ch = await getChannel();
  await ch.assertQueue(queue, { durable: true });
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
}
