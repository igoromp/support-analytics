Eu trabalho em uma empresa de adquirencia e rotineiramente preciso atender incidentes , tratar deadlettlers, converter json em csv , csv em json, fazer atualização de registros usando APIS. Eu quero construir um projeto que eu possa usar para facilitar essas rotinas. Gostaria que as funcionalidades fossem modulares e fáceis de incluir novos, cada modulo deveria mater a sua interface, mas o template padrao seja mantido pelo proprio projeto principal.

Funcionalidades esperadas:

- Interface Web
- Deve ter scripts para compactação do projeto para reduzir tamanho utilizando somente as dependencias necessárias
- Deve conter um modulo onde posso fazer uploads de arquivos e esses arquivos ficarem disponíveis para os outros modulos
- Em modulos que geram arquivos. Esses arquivos devem  ter a opção de serem salvos em uma pasta onde outros modulos possam ter acesso também
- Os modulos que leem arquivos devem ter a opção de ler da pasta compatilhada ou pode puxar outro arquivo
- Recursos que são disponibilizados entre modulos devem ser separados e usados como componentes  para que seja de fácil manutenção
- Cada modulo criado deve conter um arquivo doc que explique como o modulo funciona , quais os parametros e outras informações importantes para a utilização do modulo
- A documentação deve ser acessada usando o padrao de baseURL/modulo/doc
- Criar as interfaces usando boas praticas de UX/UI e usabilidade

Modulos que devem ser criados:

- csv to json: 
    deve poder carregar um arquivo .csv (da pasta compartilhada ou outro), visualizar uma previa do conteudo,  poder escolher quais campos devem compor o item do array de json e deve dar a possibilidade de renomear os campos selecionados. Deve dar a possibilidade de eu colocar um campo fixo que será incluido em todos os items da lista de items no json.

    Se o csv tiver formato dot notation , ao gerar o json deve ter a opção de escolher manter no formato dot notation ou no formato que cria os objetos aninhados.

- json to csv:
    deve poder carregar um arquivo .json (da pasta compartilhada ou outro), visualizar uma previa do conteudo,  poder escolher quais campos , usando o formato dot notation para navegar no json, que devem compor na montagem do arquivo .csv e deve dar a possibilidade de renomear os campos selecionados. 

- csv viewer:
    Deve possibilidar carregar um arquivo .csv (da pasta compartilhada ou outro), Carregar a visualização de forma páginada podendo escolher quantos registros mostram por página (10,25,50,100). Deve possibilitar busca por coluna e dever ter um filtro master com possibilidae de procurar no arquivo inteiro. os controles de paginação devem ficar no começo e no final da lista.

- api-executor:
    deve ter a possibilidade de  cadastrar urls , verbos da url e parametros (body, query ou params) e poder usar algum vinculo para  utilizar essa api com arquivos .csv ou .json ,da pasta compartilhada ou outro, de modo que eu possa definir campo X no parametro x ao utilizar a  url. Quero poder definir se a api tem retorno e quero poder escolher se salvo esse retorno podendo escolher entre salvar o retorno em arquivo com formato json ou txt, completo ou salvar apenas campos de minha escolha. Os campos escolhidos para serem salvos devem ser cadastrados no formato de dot notation.

    As urls  cadastradas podem ser salvas  em um formato simples não precisando de dependencias como um banco de dados por exemplo.

    esse modulo de trabalhar com workers, ou seja posso escolher quantos workers serão criados para executar a chamada da API

- dlq service bus explorer
    O modulo deve trabalhar com o azure Service Bus. Deve trabalhar no formato export  e no formato reprocess. No formato export deve só trazer  as dqls sem afetar a mensagem que está na fila de dead letter e salvar em formato json.

    deve trabalhar com tipo ou  fila e com tópico.

    deve ter a possibilidade de testar a conexão.

    Deve ter a possibilidade de carregar 1 ou mais connection String e poder trocar entre as conexões

    Deve ter a possibilidade de definir quantas mensagens trazer podendo trazer no máximo a quantidade de mensagens existentes na fila de dead letter, ou seja , se o valor definido é 1000 mas só tem 50 mensagens , então deve para de trazer só as 50 mensagens

    No formato reprocess, deve ter a possibilidade de processar nos modos abaixo:

    Processar 1 a 1
        posso escolher trazer 1 dlq, alterar a mensagem e reenviar para a fila ou tópico 
    
    processar atraves de arquivo csv:
        posso carregar um arquivo csv (da pasta compartilhada ou outro), definir qual coluna é a coluna chave, escolher quais campos serão alterados no body usando o formato dot notation, e devo ter a possibilidade de dizer que tipo de valor deve ser incluido (string, number, boolean) 
        
        Exemplo: 
            body.settlement_tax.campo_x = number:csv_2 onde csv_2 quer dizer que o valor será o da coluna 2 do csv
            body.settlement_tax.campo_x = number:10 onde o valor para esse campo em todas as mensagems será o numero 10
            body.settlement_tax.campo_y = string:XPTO onde o valor para esse campo em todas as mensagems será o texto "XPTO"
    
    Verificar se é necessário criar a mesma funcionalide de processar por aruivo json usando o padrao do csv




    





