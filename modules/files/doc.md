# Arquivos — pasta compartilhada

Módulo central de arquivos do Support Analytics. Tudo que é enviado aqui fica na
**pasta compartilhada** (`data/shared`) e pode ser usado por qualquer outro módulo:
os conversores, o visualizador de CSV, o api-executor e o dlq-explorer.

## Como funciona

- **Enviar**: clique ou arraste um ou mais arquivos para a área de upload.
  Se já existir um arquivo com o mesmo nome, um sufixo numérico é adicionado
  (`arquivo(1).csv`) — nada é sobrescrito.
- **Preview**: mostra os primeiros 20 KB do arquivo como texto.
- **Baixar**: faz o download do arquivo original.
- **Excluir**: remove o arquivo da pasta compartilhada (pede confirmação).

## Integração com os outros módulos

Os módulos que **leem** arquivos oferecem duas origens:

| Origem | O que significa |
| ------ | --------------- |
| Pasta compartilhada | Lista os arquivos deste módulo |
| Enviar outro arquivo | Upload avulso para uso imediato (vai para `data/tmp`, limpo após 24h) |

Os módulos que **geram** arquivos oferecem a opção *Salvar na pasta compartilhada*,
deixando o resultado disponível para os demais módulos, além do download direto.

## API

| Rota | Método | Descrição |
| ---- | ------ | --------- |
| `/api/files/list` | GET | Lista os arquivos da pasta compartilhada |
| `/api/files/upload?dest=shared\|tmp` | POST (multipart) | Envia um arquivo |
| `/api/files/save` | POST `{name, content}` | Grava conteúdo texto na pasta compartilhada |
| `/api/files/download/:name` | GET | Download do arquivo |
| `/api/files/preview/:name` | GET | Primeiros 20 KB do arquivo |
| `/api/files/:name` | DELETE | Exclui o arquivo |

## Limites

- Tamanho máximo de upload: **200 MB** por arquivo.
- Nomes de arquivo são sanitizados (sem caminhos, sem arquivos ocultos).
