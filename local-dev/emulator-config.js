// Dados do emulador local do Azure Service Bus (local-dev/servicebus-emulator).
// A SAS key é a chave fixa do emulador — não é segredo.

module.exports = {
  CONNECTION_STRING:
    'Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;' +
    'SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;',
  QUEUE: 'fila-teste',
  TOPIC: 'topico-teste',
  SUBSCRIPTION: 'sub-teste',
};
