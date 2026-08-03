// Inspeciona o estado do emulador: quantas mensagens estão na fila/subscription
// ativa e quantas na DLQ, com o body de cada uma. Usa peek — não consome nada.
//
//   node local-dev/check-dlq.js

const { ServiceBusClient } = require('@azure/service-bus');
const { CONNECTION_STRING, QUEUE, TOPIC, SUBSCRIPTION } = require('./emulator-config');

async function peekAll(client, args, options, label) {
  const receiver = client.createReceiver(...args, options);
  const msgs = await receiver.peekMessages(100);
  await receiver.close();
  console.log(`\n${label}: ${msgs.length} mensagem(ns)`);
  for (const m of msgs) {
    // o body chega como Buffer ou string JSON; objetos já vêm desserializados
    let parsed = m.body;
    if (Buffer.isBuffer(parsed)) parsed = parsed.toString('utf8');
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { /* body não-JSON: mostra cru */ }
    }
    const resumo = typeof parsed === 'object' && parsed !== null
      ? `${parsed.pedido?.id} valor=${parsed.pagamento?.valor} status=${parsed.pagamento?.status}`
      : String(parsed);
    console.log(`  ${m.messageId} · ${resumo}`);
  }
}

(async () => {
  const client = new ServiceBusClient(CONNECTION_STRING);
  try {
    await peekAll(client, [QUEUE], {}, `FILA ${QUEUE} (ativa)`);
    await peekAll(client, [QUEUE], { subQueueType: 'deadLetter' }, `FILA ${QUEUE} (DLQ)`);
    await peekAll(client, [TOPIC, SUBSCRIPTION], {}, `${TOPIC}/${SUBSCRIPTION} (ativa)`);
    await peekAll(client, [TOPIC, SUBSCRIPTION], { subQueueType: 'deadLetter' }, `${TOPIC}/${SUBSCRIPTION} (DLQ)`);
  } finally {
    await client.close();
  }
})().catch((err) => {
  console.error('Falhou:', err.message);
  process.exit(1);
});
