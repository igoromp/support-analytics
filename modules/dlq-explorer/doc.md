# DLQ Explorer — Azure Service Bus

Exporta e reprocessa mensagens de **dead letter queues (DLQ)** do Azure Service
Bus, trabalhando com **filas** e com **tópicos + subscriptions**.

## Conexões

- Cadastre uma ou mais **connection strings** (ex.: produção e homologação) e
  troque entre elas no seletor de conexão ativa.
- As conexões ficam em `data/config/servicebus.json`. A connection string nunca
  é reexibida no navegador — apenas o nome e o endpoint.
- **Testar conexão** valida o acesso à entidade e, se a chave tiver permissão de
  *manage*, mostra a contagem de mensagens ativas e de dead letters.

> A connection string precisa de permissão **Listen** (export), **Listen + Send**
> (reprocessamento) e opcionalmente **Manage** (contagens no teste de conexão).

## Visualizar

Lista as dead letters em tela, também via **peek** — as mensagens continuam na
DLQ. É o ponto de partida natural: dá para inspecionar antes de decidir o que
reprocessar.

- **Quantidade máxima a carregar**: até 2000 mensagens por vez.
- **Filtro** por `messageId`, motivo do dead letter ou conteúdo do body.
- Clique em uma linha para expandir o **body completo** formatado.
- Marque as mensagens desejadas e use **Reprocessar selecionadas**: elas são
  reenviadas para a fila/tópico de origem **sem alteração no body** e removidas
  da DLQ. As não marcadas são devolvidas intactas (abandon).
- "Selecionar todas" marca apenas as mensagens do **filtro atual**; a seleção é
  preservada ao mudar o filtro ou a página.
- Ao terminar, a lista é recarregada automaticamente para refletir o broker.

> Para reenviar **alterando** o body, use *Reprocessar 1 a 1* (edição manual) ou
> *Reprocessar via CSV* (em lote, por regras).

## Export

Lê as mensagens da DLQ via **peek** — **sem afetar a fila**: nada é travado,
consumido ou reenviado. O resultado é salvo como JSON na pasta compartilhada
(`dlq-<entidade>-<data>.json`), com body decodificado, motivo do dead letter,
`applicationProperties` e metadados.

- Defina a **quantidade máxima**: se a DLQ tiver menos mensagens, apenas as
  existentes são trazidas (ex.: pediu 1000, havia 50 → exporta 50).

## Reprocessar 1 a 1

1. **Buscar próxima mensagem**: recebe 1 mensagem da DLQ com *lock* (renovado
   automaticamente enquanto a tela estiver aberta, por até 10 minutos).
2. Edite o **body** no editor.
3. Escolha:
   - **Reenviar para a origem**: envia o body editado para a fila/tópico e
     **remove** a mensagem da DLQ (complete).
   - **Devolver para a DLQ**: libera a mensagem intacta (abandon).

Propriedades preservadas no reenvio: `messageId`, `correlationId`, `subject`,
`sessionId`, `contentType` e `applicationProperties`.

## Reprocessar via CSV

Reprocessamento em lote: cada mensagem da DLQ é casada com uma linha do CSV.

1. Carregue o **CSV** (pasta compartilhada ou upload).
2. Escolha a **coluna chave** do CSV e o **caminho da chave no body** da
   mensagem (dot notation, ex.: `transaction.id`).
3. Defina as **regras de alteração** no formato `caminho = tipo:valor`:

```text
settlement_tax.campo_x → number:csv_2   (valor da coluna 2 do CSV, como número)
settlement_tax.campo_x → number:10      (valor fixo 10 em todas as mensagens)
settlement_tax.campo_y → string:XPTO    (texto fixo "XPTO")
flags.reprocessado     → boolean:true
```

Tipos aceitos: `string`, `number`, `boolean`. `csv_N` = valor da coluna N
(contando a partir de 1) da **linha casada** do CSV.

### Comportamento

- Mensagem **casada** (chave encontrada no CSV): body alterado pelas regras,
  reenviada para a origem e removida da DLQ.
- Mensagem **não casada**: devolvida para a DLQ intacta (abandon).
- O job termina quando todas as chaves do CSV foram processadas ou quando a
  DLQ foi varrida por completo. Chaves sem mensagem correspondente são listadas
  no resultado.
- Acompanhamento em tempo real: varridas, casadas, reenviadas, ignoradas e falhas.

> Reprocessamento por arquivo **JSON** (mesmo padrão do CSV) ainda não foi
> implementado — avalie a necessidade e o módulo pode ser estendido.

## API

| Rota | Método | Descrição |
| ---- | ------ | --------- |
| `/api/dlq-explorer/connections` | GET / POST / DELETE `:id` | Gestão de conexões |
| `/api/dlq-explorer/test` | POST `{connId, entity}` | Testa a conexão e conta mensagens |
| `/api/dlq-explorer/peek` | POST `{connId, entity, max}` | Lista as DLQs para a tela (peek) |
| `/api/dlq-explorer/export` | POST `{connId, entity, max}` | Exporta DLQs via peek |
| `/api/dlq-explorer/reprocess/selected` | POST `{connId, entity, sequenceNumbers}` | Reenvia as mensagens marcadas |
| `/api/dlq-explorer/reprocess/fetch` | POST | Busca 1 mensagem com lock |
| `/api/dlq-explorer/reprocess/send` | POST `{session, body}` | Reenvia e remove da DLQ |
| `/api/dlq-explorer/reprocess/release` | POST `{session}` | Devolve a mensagem |
| `/api/dlq-explorer/reprocess/csv` | POST | Inicia o job em lote |
| `/api/dlq-explorer/jobs/:id` | GET | Progresso do job |

Formato de `entity`: `{"type": "queue", "queue": "nome"}` ou
`{"type": "topic", "topic": "nome", "subscription": "sub"}`.
