# Ambiente local — Azure Service Bus

Sobe o **emulador oficial** do Azure Service Bus para testar o módulo `dlq-explorer`
sem tocar em nenhum ambiente da empresa.

## Pré-requisito

Rancher Desktop aberto (o engine do Docker só responde com o app rodando). Confirme com:

```bash
docker info
```

## Passo a passo

```bash
npm run sb:up
```

Sobe dois containers: `servicebus-emulator` (portas 5672 AMQP e 5300) e `sqledge`
(estado interno do emulador). A primeira execução baixa ~1,5 GB de imagens.
Acompanhe até aparecer "Emulator Service is Successfully Up!":

```bash
npm run sb:logs
```

Depois popule a DLQ com mensagens de teste:

```bash
npm run sb:seed
```

Isso envia 6 mensagens para `fila-teste` e para `topico-teste/sub-teste`, move todas
para a dead letter e grava `data/shared/dlq-reprocess-teste.csv` para o teste em lote.

Para conferir o estado do broker a qualquer momento (fila ativa vs. DLQ, com o body
de cada mensagem, por `peek` — não consome nada):

```bash
npm run sb:check
```

## Cadastrando a conexão na UI

Com `npm start` rodando, abra o DLQ Explorer e cadastre:

```
Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;
```

Entidades disponíveis: fila `fila-teste`; tópico `topico-teste` / subscription `sub-teste`.

> O emulador **não** implementa o endpoint de administração, então o teste de conexão
> não exibe as contagens de mensagens — ele cai no fallback por `peek`, que é o
> comportamento esperado. Export e reprocessamento funcionam normalmente.

## Encerrando

```bash
npm run sb:down
```

O `-v` apaga os volumes, então o próximo `sb:up` começa com as filas vazias.

## Alterando as entidades

Edite `servicebus-emulator/Config.json` e recrie os containers (`sb:down` + `sb:up`) —
o emulador só lê esse arquivo na inicialização.
