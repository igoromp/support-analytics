# CSV → JSON

Converte um arquivo CSV em um array JSON, com controle total sobre quais campos
entram no resultado, seus nomes e campos fixos adicionais.

## Como usar

1. **Escolha o arquivo**: da pasta compartilhada ou envie outro arquivo.
   O delimitador (`,`, `;` ou tab) é detectado automaticamente.
2. **Carregar preview**: mostra as 10 primeiras linhas para conferência.
3. **Campos do JSON**: marque quais colunas compõem cada item do array.
   O campo *renomear para* troca o nome da chave no JSON gerado (opcional).
4. **Campos fixos** (opcional): adicione campos com valor constante incluídos em
   **todos** os itens. Escolha o tipo do valor: `string`, `number` ou `boolean`.
5. **Gerar**: baixe o JSON ou salve na pasta compartilhada para usar em outros módulos.

## Dot notation

Se o CSV tiver colunas nomeadas em dot notation (ex.: `cliente.endereco.cidade`),
você escolhe o formato do JSON gerado:

**Manter dot notation** (chaves planas):

```json
[{ "cliente.endereco.cidade": "São Paulo" }]
```

**Criar objetos aninhados**:

```json
[{ "cliente": { "endereco": { "cidade": "São Paulo" } } }]
```

> A opção também vale para campos renomeados ou fixos com pontos no nome:
> no modo aninhado, `meta.origem` vira `{"meta": {"origem": …}}`.

## Regras e limites

- Os valores das células são exportados como **string** (como estão no CSV).
  Somente campos fixos têm tipagem explícita.
- Campos fixos com o mesmo nome de um campo selecionado sobrescrevem o valor da coluna.
- Ao salvar na pasta compartilhada, se já existir arquivo com o mesmo nome é
  criado um sufixo (`resultado(1).json`).

## API

| Rota | Método | Descrição |
| ---- | ------ | --------- |
| `/api/csv-to-json/preview` | POST `{source, name}` | Headers, 10 primeiras linhas e total |
| `/api/csv-to-json/convert` | POST `{source, name, fields, fixedFields, nested, save, filename}` | Gera o JSON (retorna `content` ou salva e retorna `savedAs`) |

Formato de `fields`: `[{ "field": "coluna_origem", "rename": "novo_nome" }]`.
Formato de `fixedFields`: `[{ "name": "origem", "type": "string", "value": "reproc" }]`.
