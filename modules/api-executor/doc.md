# API Executor

Cadastre APIs uma única vez e execute chamadas em lote a partir de arquivos
CSV ou JSON — útil para atualizar registros em massa durante incidentes.

## Cadastro de APIs

Cada API tem: **nome**, **verbo** (GET/POST/PUT/PATCH/DELETE), **URL**,
**query params**, **headers** e **body** (para verbos com corpo).

O cadastro é salvo em `data/config/apis.json` — um arquivo simples, sem banco
de dados. Você pode versionar ou copiar esse arquivo entre máquinas.

### Placeholders `{{campo}}`

Em qualquer parte da URL, query, headers ou body você pode usar `{{campo}}`.
Na execução, o placeholder é substituído pelo valor do registro atual do arquivo:

- **CSV**: `{{nome_da_coluna}}` (o cabeçalho da coluna)
- **JSON**: dot notation — `{{body.transaction.id}}`

Exemplos:

```text
URL:   https://api.exemplo.com/pedidos/{{id}}/status
query: motivo = ajuste_manual
body:  {"valor": "{{taxa}}", "origem": "reprocessamento"}
```

> Valores usados na URL são automaticamente URL-encoded. Valores no body JSON
> são escapados como string. Campos ausentes viram vazio.

### Modos de body

| Modo | Quando usar |
| ---- | ----------- |
| **Reconstruir manualmente** | Você escreve o JSON inteiro, com `{{campo}}` onde precisar. |
| **Basear em payload existente + alterações** | O arquivo já traz o payload pronto (ex.: o retorno de um GET anterior) e você só quer trocar alguns campos. |

No segundo modo informe o **caminho do payload base** dentro do registro (ex.:
`response`) e uma lista de **alterações** — cada uma com o caminho *dentro do
payload* e o novo valor. O restante do payload vai intacto.

Quando o valor da alteração é **exatamente um placeholder** (ex.: `{{taxa}}`), o
tipo original é preservado — número continua número, boolean continua boolean,
objeto continua objeto. Se você misturar texto com placeholder (ex.:
`ajuste-{{id}}`), o resultado é string.

## Certificado SSL self-signed (proxy corporativo)

Se a chamada falhar com `self-signed certificate in certificate chain` (comum em
rede corporativa com proxy que faz inspeção TLS), marque **"Ignorar verificação
de certificado SSL"** no cadastro da API.

A opção vale **apenas para aquela API** — não é uma configuração global do
processo, então as demais APIs continuam validando o certificado normalmente.

## Execução

1. Escolha a **API cadastrada**.
2. Escolha o **arquivo de dados** (CSV ou JSON, da pasta compartilhada ou
   upload). O módulo mostra os campos disponíveis para usar como placeholder.
   *Sem arquivo, a API executa uma única vez* (bom para testar).
3. Defina os **workers**: quantas chamadas simultâneas (1 a 20). Um worker =
   execução sequencial; 5 workers = 5 chamadas em paralelo até acabar a fila.
4. Defina o **timeout** por chamada (padrão 30s).

## Retorno da API

Se a API tem retorno e você marcar **Salvar o retorno**:

| Opção | Descrição |
| ----- | --------- |
| Formato `json` | Array com um item por chamada: `{index, status, ok, response}` |
| Formato `txt` | Uma linha por chamada: `#linha [status] conteúdo` |
| Retorno completo | Salva o corpo inteiro da resposta |
| Apenas campos escolhidos | Informe os caminhos em dot notation (ex.: `data.status`) com renomeação opcional |

O arquivo é salvo na **pasta compartilhada**, ficando disponível para os outros
módulos (ex.: abrir o resultado no CSV Viewer após converter).

## Acompanhamento

Durante a execução: barra de progresso, contadores de sucesso/falha e tabela
com as primeiras 100 falhas (linha do arquivo, status HTTP e corpo do erro).

## API

| Rota | Método | Descrição |
| ---- | ------ | --------- |
| `/api/api-executor/apis` | GET / POST | Lista / cadastra APIs |
| `/api/api-executor/apis/:id` | PUT / DELETE | Atualiza / exclui |
| `/api/api-executor/fields` | POST `{source, name}` | Campos disponíveis no arquivo |
| `/api/api-executor/run` | POST | Inicia a execução, retorna `jobId` |
| `/api/api-executor/jobs/:id` | GET | Progresso do job |
