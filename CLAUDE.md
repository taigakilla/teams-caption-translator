# Guia para adaptar o tradutor

Leia primeiro `README.md`. Este repositório contém somente a extensão Chrome e
o host Python de legendas do Teams. Não depende de Ciel, Hyprland ou Omarchy.

O objetivo da adaptação macOS é criar uma interface para o `live.json` já
produzido pelo host. A captura/tradução pertence à extensão; o host persiste
as falas. Não implemente uma segunda captura de áudio para reproduzir isso.

Comece executando `python3 -m unittest discover -s tests -v`. Os testes usam
dados artificiais e diretórios temporários. Testes reais do Chrome/Teams e do
macOS devem ser feitos na máquina de destino; não declare compatibilidade
validada só porque os testes Python passam no Linux.

Preserve stdout exclusivamente para o protocolo native messaging; logs vão
para stderr. Mantenha `ciel.legendas` igual no background, popup e instalador.
A `key` do manifest é pública e fixa o ID; não é uma credencial.

O destino `pt` está definido em `content.js` e `popup.js`; altere ambos se
adicionar escolha de idioma. Ajuste `SEL` em `content.js` se o Teams mudar o DOM.
Uma fala pode receber tradução depois de ser marcada como final: preserve
as atualizações por ID. Preserve o enquadramento binário e a escrita atômica.

Não commite reuniões, nomes reais, transcrições, tokens, caminhos pessoais,
perfis do Chrome ou manifests gerados. Use dados sintéticos nos exemplos.
Não adicione serviços externos de tradução sem decisão explícita do usuário.
