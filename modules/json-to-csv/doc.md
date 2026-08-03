# JSON → CSV

Converte um array JSON em CSV, navegando pelos campos com **dot notation** —
inclusive campos aninhados em qualquer profundidade.

## Como usar

1. **Escolha o arquivo**: da pasta compartilhada ou envie outro arquivo `.json`.
2. **Carregar preview**:
   - Se a raiz do JSON for um array, ele é usado diretamente.
   - Se não for, o módulo sugere os arrays encontrados no documento e você
     escolhe o caminho (ex.: `data.items`) antes de carregar de novo.
3. **Campos do CSV**: os campos são detectados automaticamente a partir dos
   50 primeiros itens, já em dot notation (ex.: `body.settlement_tax.amount`).
   - Marque os que devem virar colunas.
   - *Renomear para* define o nome da coluna no CSV.
   - Campos que não foram detectados (raros nos primeiros itens) podem ser
     adicionados manualmente em dot notation.
4. **Gerar CSV**: escolha o delimitador (`,`, `;` ou tab), baixe o arquivo ou
   salve na pasta compartilhada.

## Regras de conversão

| Valor no JSON | Valor na célula |
| ------------- | ---------------- |
| string / number / boolean | valor como texto |
| `null` ou campo ausente | célula vazia |
| objeto ou array | serializado como JSON (`{"a":1}`) |

- Arrays dentro dos itens são navegáveis por índice: `itens.0.sku`.
- O arquivo sai com BOM UTF-8 para o Excel exibir acentuação corretamente.

## API

| Rota | Método | Descrição |
| ---- | ------ | --------- |
| `/api/json-to-csv/preview` | POST `{source, name, arrayPath?}` | Detecta campos e retorna amostra; se a raiz não for array, retorna `arraySuggestions` |
| `/api/json-to-csv/convert` | POST `{source, name, arrayPath?, fields, delimiter, save, filename}` | Gera o CSV (retorna `content` ou salva e retorna `savedAs`) |

Formato de `fields`: `[{ "field": "body.valor", "rename": "valor" }]`.
