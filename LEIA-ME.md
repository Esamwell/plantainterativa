# Planta Interativa

Editor de planta baixa que roda no navegador. Não precisa de AutoCAD, nem instalar nada.

## Como abrir

Dê **duplo clique em `index.html`**. Abre no navegador (Chrome ou Edge) e pronto.

A planta que já vem carregada é exatamente a que você enviou: mesmas paredes,
as duas portas, a bancada da estação de trabalho, a tomada isolada, o quadro de
4 tomadas da sala de reunião, os textos e as cinco cotas (0.59, 0.18, 0.81, 0.49, 0.56).

## O que dá para fazer

| Ferramenta | O que faz |
|---|---|
| **Selecionar** | Clica para escolher um item, arrasta para mover. Blocos ganham 4 alcinhas nos cantos pra redimensionar. Edita os valores no painel da direita. |
| **Parede** | Arrasta de um ponto ao outro. Segure `Shift` para travar na horizontal/vertical. |
| **Porta / janela** | Escolha o tipo na caixa "Tipo de abertura" e clique em cima de uma parede — o vão abre sozinho. |
| **Texto** | Clica e digita (nome de ambiente, observação). |
| **Cota** | Arrasta entre os dois pontos que quer medir. A medida sai sozinha, ou você digita o texto que quiser. |
| **Apagar** | Clica no que quer remover. |

### Tipos de abertura disponíveis

**Portas:** de abrir (giro simples), 2 folhas, pivotante, **de correr**, de correr 2 folhas, correr embutida na parede, sanfonada, e vão livre (sem porta nenhuma).
**Janelas:** comum, de correr, basculante, porta-balcão de correr.

Depois de colocada, seleciona o vão e no painel da direita dá pra: trocar o tipo a qualquer momento (o dropdown "Tipo" reaproveita a mesma abertura), mudar largura e ângulo, e inverter o lado da dobradiça / sentido de abertura. Arrastando, o vão desliza pela parede ou pula pra outra.

### Blocos (mobiliário, eletrônicos, cozinha, banheiro, elétrica, outros)

Escolha a categoria e clique no bloco desejado (mesa, sofá, cama, pia, vaso sanitário, box, televisão, computador, notebook, impressora, tomada, interruptor, ponto de luz, ar-condicionado, escada, seta de norte etc.), depois clique na planta — ou arraste pra já nascer do tamanho que você quiser. Com o bloco selecionado dá pra trocá-lo por outro do catálogo, redimensionar pelas alças, **girar 90°**, **espelhar**, e escrever um rótulo.

### 🧩 Organizar objetos

Reposiciona os móveis (blocos) dentro do cômodo onde cada um está — encostados nas paredes, ao redor do ambiente, sem sobrepor nada e sem invadir a frente das portas. Útil pra ter uma noção de espaço rápida depois de ir jogando móveis meio aleatoriamente. Só mexe em blocos de mobiliário; tomada, interruptor, portas e textos ficam onde estão. Se um móvel for grande demais pro cômodo, ele fica visivelmente "estourando" o cômodo em vez de sumir ou ficar em cima de outra coisa — é o sinal de que ele não cabe ali.

## Atalhos

`V` selecionar · `W` parede · `X` texto · `C` cota · `D` apagar
`P` porta de abrir · `R` porta de correr · `J` janela · `T` tomada · `I` interruptor · `M` bloco retângulo
`Del` apaga o selecionado · `Ctrl+Z` desfaz · `Ctrl+Y` refaz · `Ctrl+D` duplica
`Esc` cancela · `F` enquadra a planta na tela
Roda do mouse = zoom · arrastar o vazio = mover a vista

## Salvar e entregar

- **Salvar JSON** baixa o projeto; **Abrir JSON** carrega de volta. É o formato para guardar/versionar.
- **PNG** e **SVG** exportam o desenho limpo (sem grade, sem seleção). O SVG abre no AutoCAD, Illustrator, Inkscape e Figma sem perder qualidade.
- **Imprimir** → em "Destino" escolha *Salvar como PDF*.
- **↺ Último publicado** volta para o layout publicado mais recente (o mesmo que abre em qualquer aparelho).
- **↺ Planta original (sem móveis)** volta para a planta bem do início, nua, como foi enviada.

## Sincronização entre aparelhos (tempo real)

Editar no computador e o celular atualizar sozinho, sem precisar mandar arquivo pra ninguém: qualquer edição é salva na nuvem ~1,2s depois de parar de mexer, e cada aparelho aberto confere por atualizações a cada 3s. Sem banco de dados — usa o **Vercel Blob** (armazenamento de arquivo simples, já dentro da própria conta Vercel do projeto).

Na barra de baixo do editor aparece o status: `salvando…`, `sincronizado ✓`, `atualizado de outro aparelho ✓`, ou `sem conexão com a nuvem` (se ficar offline, continua funcionando 100% local, só não sincroniza até voltar).

### Configuração (só uma vez)

Isso só funciona depois de ligar o **Vercel Blob** no projeto — é gratuito no plano Hobby e são só 2 passos no painel da Vercel:

1. Entre em **vercel.com** → o projeto **plantainterativa** → aba **Storage** → **Create Database** → escolha **Blob** → dê um nome (ex: `planta-dados`) → **Create**.
2. Na tela seguinte, clique em **Connect to Project** e escolha `plantainterativa`. Isso adiciona sozinho a variável `BLOB_READ_WRITE_TOKEN` no projeto.
3. Espere o próximo deploy terminar (a Vercel redeploya sozinha quando essa variável muda; se não redeployar em ~1 min, vá em **Deployments** → menu ⋯ do último deploy → **Redeploy**).

Antes desse passo, o app funciona normalmente, só que cada aparelho fica isolado de novo (como estava antes desta conversa). Depois de configurado, é automático — não precisa repetir isso, nem mandar mais JSON pra mim.

### Se algo der errado

- Status fica sempre em `sem conexão com a nuvem`: o Blob provavelmente não foi conectado ainda (passo acima), ou o deploy não pegou a variável nova.
- Duas pessoas mexendo ao mesmo tempo em aparelhos diferentes: quem salvar por último "ganha" (não existe mesclagem de edições simultâneas) — não é feito pra edição colaborativa em conjunto, é pra você mesmo revezar entre computador e celular.

O site publicado (o mesmo em qualquer aparelho) fica em: **https://plantainterativa.vercel.app**

## Unidades

O desenho usa exatamente a escala da planta original, em metros — igual às cotas que já estavam lá.
Os campos do painel também são em metros (`0.125` = doze centímetros e meio).

> Observação sobre a planta original: as cotas do lado direito (0.49 + 0.56 = 1.05)
> não fecham com a cota da esquerda (0.81). Como você pediu para não mexer em nada,
> os cinco textos foram mantidos exatamente como estavam, fixos. Se quiser que passem
> a mostrar a medida real do desenho, é só selecionar a cota e apagar o campo
> "Texto da cota" — ela passa a se calcular sozinha.

## Arquivos

- `index.html` — a página
- `estilo.css` — aparência
- `app.js` — o editor (a planta original está na função `plantaOriginal()`)
- `.claude/launch.json` — só serve para rodar um servidor local de teste; pode ignorar
