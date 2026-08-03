# Support Analytics

Toolkit web modular para rotinas de suporte em adquirência: tratamento de
incidentes, dead letters do Azure Service Bus, conversões CSV/JSON e
atualização de registros em massa via APIs.

## Requisitos

- Node.js 18+ (testado com Node 22)

## Como rodar

```bash
npm install
npm start          # http://localhost:3000
```

Em desenvolvimento (reinicia ao salvar arquivos):

```bash
npm run dev
```

Porta customizada: `set PORT=8080 && npm start`.

## Módulos

| Módulo | Rota | O que faz |
| ------ | ---- | --------- |
| Arquivos | `/files` | Pasta compartilhada: upload, preview, download e exclusão |
| CSV Viewer | `/csv-viewer` | Visualização paginada com busca por coluna e filtro master |
| CSV → JSON | `/csv-to-json` | Conversão com seleção/renomeação de campos, campos fixos e dot notation |
| JSON → CSV | `/json-to-csv` | Conversão navegando campos aninhados com dot notation |
| API Executor | `/api-executor` | Cadastro de APIs e execução em lote com workers |
| DLQ Explorer | `/dlq-explorer` | Export e reprocessamento de DLQs do Azure Service Bus |

A documentação de cada módulo fica em **`/<modulo>/doc`** (link `doc` no topo da página).

## Arquitetura

```
server.js            entrada — monta o shell e os módulos
core/                recursos compartilhados entre módulos
  module-loader.js   descobre modules/ e monta rotas automaticamente
  render.js          template padrão (shell) mantido pelo projeto principal
  csv.js             parser/serializador CSV (sem dependências)
  dotnotation.js     get/set/flatten/unflatten via dot notation
  markdown.js        renderiza os doc.md dos módulos
  storage.js         persistência simples em data/config/*.json
  shared-files.js    acesso à pasta compartilhada e à pasta tmp
public/              template, CSS e componentes JS compartilhados
modules/<nome>/      um diretório por módulo
data/shared/         pasta compartilhada (arquivos dos módulos)
data/config/         cadastros (APIs, conexões Service Bus)
scripts/package.js   gera o zip de distribuição
```

### Criando um novo módulo

Crie `modules/meu-modulo/` com:

| Arquivo | Obrigatório | Papel |
| ------- | ----------- | ----- |
| `index.js` | sim | exporta `{ meta: { title, description, icon, order }, router }` |
| `page.html` | não | fragmento HTML injetado no template padrão |
| `client.js` | não | script da página (usa `window.UI` — componentes prontos) |
| `doc.md` | recomendado | documentação servida em `/meu-modulo/doc` |

O loader monta tudo automaticamente: `/api/meu-modulo/*` (rotas do router),
`/meu-modulo` (página) e `/meu-modulo/doc` (documentação). Reinicie o servidor
após criar o módulo.

Componentes compartilhados disponíveis no frontend (`window.UI`):
`filePicker` (pasta compartilhada ou upload), `fieldMapper` (seleção/renomeação
de campos), `pagination`, `renderTable`, `toast`, `download`, `saveToShared`,
`api` (fetch com erros tratados) e `el` (criação de elementos).

## Testes

```bash
npm test
```

Usa o **test runner nativo do Node** (`node:test` + `node:assert`) — sem
dependência de desenvolvimento, coerente com o requisito de empacotamento
enxuto. `npm run test:watch` reexecuta a cada alteração.

Os testes cobrem as funções puras de `core/` (parser CSV, dot notation,
markdown, storage, validação de nomes de arquivo) e dos módulos, além do
contrato que o autodescobridor espera de cada módulo. Os helpers internos dos
módulos são expostos para teste em `module.exports.internals` — o loader lê
apenas `meta` e `router`, então isso não afeta o runtime.

Os testes de `storage` e `shared-files` gravam de verdade em `data/`, com nomes
prefixados por `__test-` e limpeza no final; a pasta compartilhada do usuário
não é alterada.

## Empacotamento para distribuição

```bash
npm run package
```

Gera `dist/support-analytics-<versao>.zip` contendo apenas o código e as
dependências de produção (sem devDependencies, sem `data/`). Para usar:
extrair e rodar `node server.js`.

## Dependências (apenas 3)

- `express` — servidor web
- `multer` — upload de arquivos
- `@azure/service-bus` — DLQ Explorer
