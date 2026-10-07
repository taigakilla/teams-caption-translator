# Teams Caption Translator

Captura as **legendas ao vivo do Microsoft Teams no Chrome**, traduz para
português com a Translator API do navegador e salva o original e a tradução
em JSON e Markdown. Não captura áudio nem faz reconhecimento de voz: usa a
transcrição que o próprio Teams exibe.

Extraído do projeto Ciel em 7 de outubro de 2026 para permitir uso independente
 e adaptação para macOS. A extensão e o host Python estão incluídos; a interface
original de desktop Linux, os dotfiles e as integrações pessoais foram omitidos.

## Estado do projeto

- Origem: implementação usada em Linux, integrada ao Ciel.
- Nesta extração: instalador Python para Linux/macOS, caminhos macOS no host e
  preferência de idioma em `chrome.storage.local` (sem sincronização de conta).
- **macOS ainda não foi validado numa máquina real.** Os testes automatizados
  verificam o host e o instalador, não uma reunião real nem a tradução no Chrome.
- Ainda não existe janela/overlay independente: a saída é em arquivos. O popup
  configura o idioma e mostra o estado do tradutor e a conexão com o host.
- Destino atual: `pt`. Origem padrão: `en`, alterável no popup.

## Arquitetura e mapa do código

```text
Teams web: legendas no DOM
  → content.js: observa falas, identifica autor, traduz, fecha falas
  → background.js: encaminha mensagens ao processo nativo
  → bin/ciel-legendas-host: grava live.json e sessões JSON/Markdown
  → sua futura interface macOS: lê os arquivos

page.js: executa no mundo MAIN da página para iniciar o download do modelo
popup.html + popup.js: idioma de origem e diagnóstico de conexão
```

| Arquivo | Responsabilidade / onde adaptar |
| --- | --- |
| `chrome/ciel-legendas/manifest.json` | Domínios Teams, permissões, scripts e ID estável |
| `chrome/ciel-legendas/content.js` | Seletores `SEL`, ciclo da reunião, tradução e limites de frequência |
| `chrome/ciel-legendas/page.js` | Download do modelo após clique/tecla na página |
| `chrome/ciel-legendas/background.js` | Native messaging, reconexão e ponte para o host |
| `chrome/ciel-legendas/popup.js` | Idioma de origem e verificações do tradutor/host |
| `bin/ciel-legendas-host` | Protocolo binário, sessões, escrita atômica, diretórios |
| `bin/ciel-legendas-install` | Registro local do host e launcher com Python absoluto |
| `tests/test_host.py` | Testes com mensagens e reuniões fictícias |
| `CLAUDE.md` | Orientações para um agente adaptar este projeto |

Não há dependência de Ciel, Qt, Hyprland, Wayland ou Obsidian. O namespace
`ciel.legendas` foi preservado como identificador do protocolo/host. Se já houver
uma instalação Ciel, este instalador substitui o registro desse mesmo host.

## Requisitos

- Chrome desktop com `Translator` disponível e suporte ao par de idiomas.
  Consulte a [documentação da Translator API](https://developer.chrome.com/docs/ai/translator-api).
  O código verifica a disponibilidade; versão, plataforma e políticas podem afetá-la.
- Teams **web no Chrome**, com legendas ao vivo habilitadas. O app nativo do Teams
  e o Safari não são alvos desta extensão.
- Python **3.9+**, biblioteca padrão apenas. No Mac, instale Python caso `python3`
  não esteja disponível.
- Node.js é opcional, somente para a verificação de sintaxe dos scripts.

## Instalação no Linux ou macOS

Clone este repositório numa pasta permanente e entre nela. Depois:

```sh
python3 bin/ciel-legendas-install
```

O instalador procura perfis de dados existentes do Chrome/Chromium. Abra o
navegador uma vez antes de instalar. Para um diretório de dados personalizado:

```sh
python3 bin/ciel-legendas-install --browser-dir "/caminho/para/dados/do/Chrome"
```

Esse caminho é o diretório de dados do navegador, **não** a subpasta `Default`.
O registro segue o mecanismo de [native messaging do Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
O launcher registra o Python usado na instalação com caminho absoluto, para
não depender do PATH do Chrome — relevante para Python instalado por Homebrew.
Se mover o checkout ou reinstalar Python, execute o instalador novamente.

1. Abra `chrome://extensions`.
2. Ligue **Modo do desenvolvedor** e escolha **Carregar sem compactação**.
3. Selecione a pasta `chrome/ciel-legendas` deste checkout.
4. Abra o popup e confirme que **Host local** está conectado.
5. Entre numa reunião no Teams web e ative **Mais → Idioma e fala → Ativar legendas ao vivo**.
6. Configure o idioma falado no Teams e a mesma origem no popup da extensão.
7. Clique ou pressione uma tecla na página do Teams para iniciar o download
   do modelo, se necessário. Aguarde o tradutor ficar pronto.

Repita o carregamento da extensão para cada perfil Chrome usado para reuniões.
Após editar a extensão, clique em **Recarregar** em `chrome://extensions` e
recarregue a aba do Teams. O host novo será usado numa nova conexão.

Para remover o registro (mantém as transcrições):

```sh
python3 bin/ciel-legendas-install --uninstall
```

Remova também a extensão em `chrome://extensions`. Não use esta desinstalação
se quiser preservar um registro anterior de Ciel sem primeiro restaurá-lo.

## Onde encontrar as saídas

| Sistema | Últimas falas | Sessões completas |
| --- | --- | --- |
| Linux | `$XDG_RUNTIME_DIR/ciel/legendas/live.json` (fallback `/run/user/<uid>`) | `${XDG_STATE_HOME:-~/.local/state}/ciel/legendas/` |
| macOS | `~/Library/Caches/ciel/legendas/live.json` | `~/Library/Application Support/ciel/legendas/` |

Se `XDG_RUNTIME_DIR` ou `XDG_STATE_HOME` forem definidos no ambiente do processo,
eles têm precedência inclusive no Mac. `CIEL_SANDBOX` acrescenta um sufixo ao
namespace do diretório de runtime. O Chrome pode não herdar variáveis de um
terminal; para uso normal, prefira os caminhos padrão.

Cada sessão tem um ID como `2026-10-07_143210` e dois arquivos: `.json` estruturado
 e `.md` legível. O host é iniciado pelo Chrome, não precisa ficar rodando como daemon.

## Contrato de dados e mensagens

`live.json` contém as três últimas falas, incluindo parciais. Exemplo sintético:

```json
{
  "v": 1,
  "active": true,
  "session": "2026-10-07_143210",
  "meeting": "Reunião de exemplo",
  "source": "en",
  "target": "pt",
  "translator": "ready",
  "updated": 1791379930000,
  "transcript": "/caminho/local/2026-10-07_143210.md",
  "lines": [
    {"id": "c1", "speaker": "Pessoa A", "text": "Hello", "translation": "Olá", "final": true, "t": 1791379930000}
  ]
}
```

`translator`: `ready`, `downloading`, `needs-click`, `unavailable` ou `off`.
Timestamps são milissegundos Unix; os horários no Markdown usam o fuso local.
`active: false` indica encerramento. Uma tradução pode chegar depois da fala
ser fechada: atualize entradas pelo `id`, sem duplicá-las.

A sessão `.json` contém `v`, `session`, `meeting`, `source`, `target`, `started`
 e `lines` com falas finalizadas (`id`, `speaker`, `text`, `translation`, `t`).
O host retoma uma sessão existente quando recebe o mesmo ID.

Mensagens extensão → host: `start` (metadados), `status` (tradutor), `line`
(fala parcial/final), `stop` (encerra) e `ping` (responde `pong`). O transporte
é JSON UTF-8 precedido por quatro bytes com comprimento em ordem nativa (`=I`).
**Não escreva logs em stdout do host**: ele é reservado ao protocolo. Use stderr.

Arquivos são escritos em temporário no mesmo diretório e substituídos via
`os.replace`. Uma interface deve observar o diretório ou reabrir o caminho,
pois o inode muda. Polling simples também serve para um primeiro protótipo.

A extensão agrupa envios a cada 250 ms, observa alterações com atraso de 150 ms
 e usa intervalo de 700 ms na atualização de traduções já existentes. Uma fala
fecha ao chegar outra ou após 2 s sem alteração. A ausência das legendas por
6 s encerra a sessão; desconectar a aba/Chrome fecha o host por EOF.

O arquivo `legendas-settings.json`, ao lado da pasta de sessões, aceita
`{"enabled": false}` para descartar novas falas no host. Ausente significa
ligado. Isso não desliga a captura/tradução na extensão e não apaga dados já
salvos. Para interromper a captura, desligue as legendas no Teams ou a extensão.

## Roteiro para adaptar ao Mac com Claude

1. Leia `CLAUDE.md`, execute os testes e instale no Chrome do Mac.
2. Valide `ping/pong`, uma reunião real, download do modelo e arquivos gerados.
3. Crie uma UI que leia `live.json`: por exemplo, janela SwiftUI ou app de menu
   com overlay. Mostre autor, original, tradução e estado do tradutor.
4. Faça a UI reabrir o arquivo após substituição atômica, lidar com arquivo
   ausente e ocultar/encerrar quando `active` ficar falso. Use `updated` para
   indicar dados antigos se o host morrer sem gravar o encerramento.
5. Leia a sessão JSON para o histórico e ofereça abertura/cópia do Markdown.
6. Teste reinício do Chrome, desativação das legendas, reconexão, idioma diferente
   e Python em caminho com espaços. Valide consumo de CPU da UI em repouso.

Prompt sugerido:

> Leia README.md e CLAUDE.md, inspecione extensão e host, rode os testes e valide
> a instalação no meu Mac. Depois implemente uma interface macOS para os arquivos
> existentes, mantendo a tradução local. Documente o que foi testado realmente
> e as limitações. Use falas fictícias nos testes e não publique meus dados.

## Verificação

```sh
python3 -m unittest discover -s tests -v
for file in chrome/ciel-legendas/*.js; do node --check "$file"; done
```

Os testes exercitam o protocolo real por subprocesso, persistência, término por
EOF, retomada e bloqueio de novas falas, além de instalação/desinstalação com
um diretório temporário. Não requerem Chrome, rede ou dados de reuniões.

## Diagnóstico e limitações

| Sintoma | Verificação |
| --- | --- |
| Host não instalado | Execute o instalador; confira o ID da extensão, registro e caminhos do Python/checkout |
| Tradutor indisponível | Confira a API no Chrome, o par de idiomas e políticas; não existe fallback remoto |
| `needs-click` | Clique/tecle na página do Teams e aguarde o download |
| Sem arquivos | Ative as legendas; confirme `SEL` no DOM e que o host está conectado |
| Transcrição incorreta | Ajuste o idioma falado no próprio Teams; a extensão não corrige o reconhecimento |
| JSON existe, nada aparece na tela | Esta extração não inclui UI de desktop; implemente uma consumidora dos arquivos |

Seletores do Teams são frágeis e podem mudar. A implementação atual mantém
uma sessão por host e um único `live.json` por usuário: reuniões simultâneas
podem sobrescrever a saída ao vivo. Encerramento forçado pode deixar estado
antigo. Esses casos precisam ser considerados na adaptação.

## Privacidade, origem e licença

O checkout inclui somente código selecionado, documentação e testes sintéticos,
com histórico Git novo. Não inclui perfis do Chrome, transcrições, credenciais,
configs pessoais ou histórico dos projetos de origem. O `.gitignore` ajuda a
excluir dados locais comuns; revise sempre o que será commitado.

A `key` em `manifest.json` é uma **chave pública**, não um segredo; mantém o
ID `mnahiiepnlmgngcjlhdfilnmjlnanolp`. Alterá-la exige atualizar `allowed_origins`
no instalador. Os manifests instalados contêm caminhos absolutos da máquina
 e são gerados fora do checkout.

A tradução usa o modelo local do Chrome; pode haver download inicial. O Teams
continua usando sua própria infraestrutura para reunião e transcrição. O host
salva nomes e falas em texto simples no disco: estes arquivos são dados privados
 e devem permanecer fora do repositório. A preferência de idioma fica local.

Código extraído do Ciel, preservando a licença **GPL-3.0** em `LICENSE`.
Seletores de legendas foram orientados pelo projeto
[Live Captions Saver](https://github.com/Zerg00s/Live-Captions-Saver).
As alterações específicas desta extração estão descritas em “Estado do projeto”.
