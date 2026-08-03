// Popula a DLQ do emulador local com mensagens de teste e gera o CSV de apoio
// para exercitar o reprocessamento em lote do módulo dlq-explorer.
//
//   node local-dev/seed-dlq.js            → 6 mensagens na fila e no tópico
//   node local-dev/seed-dlq.js 20         → 20 mensagens em cada entidade

const { ServiceBusClient } = require('@azure/service-bus');
const sharedFiles = require('../core/shared-files');
const { CONNECTION_STRING, QUEUE, TOPIC, SUBSCRIPTION } = require('./emulator-config');

const TOTAL = Math.max(1, Number(process.argv[2]) || 6);

const MOTIVOS = [
  ['ValidationError', 'Campo pagamento.valor divergente do autorizado'],
  ['TimeoutError', 'Adquirente não respondeu em 30s'],
  ['SchemaError', 'Body fora do contrato esperado'],
];

function buildMessage(i) {
  const [reason] = MOTIVOS[i % MOTIVOS.length];
  return {
    messageId: `msg-${String(i).padStart(3, '0')}`,
    contentType: 'application/json',
    subject: 'liquidacao',
    correlationId: `corr-${i}`,
    applicationProperties: { origem: 'seed-local', tentativa: 1, erroEsperado: reason },
    body: JSON.stringify({
      pedido: { id: `P${String(i).padStart(4, '0')}`, nsu: 100000 + i },
      pagamento: { valor: 10 * i + 0.99, status: 'PENDENTE', bandeira: i % 2 ? 'VISA' : 'MASTER' },
      recebidoEm: new Date(Date.now() - i * 60000).toISOString(),
    }),
  };
}

/** Envia as mensagens e, em seguida, joga todas para a dead letter. */
async function seedEntity(client, sendTo, receiverArgs, label) {
  const sender = client.createSender(sendTo);
  await sender.sendMessages(Array.from({ length: TOTAL }, (_, i) => buildMessage(i + 1)));
  await sender.close();
  console.log(`[${label}] ${TOTAL} mensagens enviadas`);

  const receiver = client.createReceiver(...receiverArgs, { receiveMode: 'peekLock' });
  let moved = 0;
  while (moved < TOTAL) {
    const batch = await receiver.receiveMessages(TOTAL - moved, { maxWaitTimeInMs: 10000 });
    if (!batch.length) break;
    for (const msg of batch) {
      const [reason, description] = MOTIVOS[moved % MOTIVOS.length];
      await receiver.deadLetterMessage(msg, {
        deadLetterReason: reason,
        deadLetterErrorDescription: description,
      });
      moved += 1;
    }
  }
  await receiver.close();
  console.log(`[${label}] ${moved} mensagens movidas para a DLQ`);
}

/** CSV pronto para o reprocess em lote: chave + colunas usadas nas regras. */
function writeCsv() {
  const linhas = ['id,novo_valor,novo_status'];
  for (let i = 1; i <= TOTAL; i++) {
    linhas.push(`P${String(i).padStart(4, '0')},${10 * i},APROVADO`);
  }
  const name = sharedFiles.writeText('shared', 'dlq-reprocess-teste.csv', `${linhas.join('\n')}\n`);
  console.log(`[csv] data/shared/${name} — keyColumn "id", keyPath "pedido.id"`);
}

(async () => {
  const client = new ServiceBusClient(CONNECTION_STRING);
  try {
    await seedEntity(client, QUEUE, [QUEUE], `fila ${QUEUE}`);
    await seedEntity(client, TOPIC, [TOPIC, SUBSCRIPTION], `tópico ${TOPIC}/${SUBSCRIPTION}`);
    writeCsv();
  } finally {
    await client.close();
  }
})().catch((err) => {
  console.error('Falhou:', err.message);
  process.exit(1);
});
