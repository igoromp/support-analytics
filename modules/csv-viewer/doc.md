# CSV Viewer

Visualizador de arquivos CSV com paginação e filtros, pensado para inspecionar
rapidamente extrações e relatórios durante o atendimento de incidentes.

## Como usar

1. **Escolha o arquivo**: da pasta compartilhada ou envie outro arquivo avulso.
   Extensões aceitas: `.csv`, `.txt`, `.tsv`. O delimitador (`,`, `;` ou tab)
   é detectado automaticamente, assim como aspas e quebras de linha em campos.
2. Clique em **Abrir arquivo**. O arquivo é parseado uma única vez no servidor
   e a navegação passa a ser instantânea.
3. Navegue com os **controles de paginação** — disponíveis no começo e no final
   da lista. Registros por página: **10, 25, 50 ou 100**.

## Filtros

| Filtro | Onde fica | Comportamento |
| ------ | --------- | ------------- |
| Filtro master | Acima da tabela | Procura o termo em **todas** as colunas do arquivo inteiro |
| Filtro por coluna | Linha abaixo do cabeçalho | Procura o termo apenas naquela coluna |

- Os filtros são combinados: um registro precisa atender ao filtro master **e** a todos os filtros de coluna preenchidos.
- A busca não diferencia maiúsculas/minúsculas e usa correspondência parcial (contém).
- O contador de registros da paginação reflete o total **filtrado**.
- **Limpar filtros** zera o filtro master e todos os filtros de coluna.

## Detalhes técnicos

- A sessão de visualização fica em memória no servidor; até 8 arquivos abertos
  são mantidos simultaneamente. Se a sessão expirar, basta abrir o arquivo de novo.
- Cabeçalhos vazios recebem nomes automáticos (`coluna_1`, `coluna_2`, …).

## API

| Rota | Método | Descrição |
| ---- | ------ | --------- |
| `/api/csv-viewer/open` | POST `{source, name}` | Abre e parseia o arquivo, retorna `session`, `headers` e `total` |
| `/api/csv-viewer/page` | POST `{session, page, pageSize, global, columnFilters}` | Retorna a página filtrada |
