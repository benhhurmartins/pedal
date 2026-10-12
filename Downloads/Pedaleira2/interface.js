const $ = id => document.getElementById(id);

let buffers = null;
let temporizadorAfinador = null;
const picosSuavizados = { entrada: 0, saida: 0 };

function mostrar(texto, erro = false) {
  const mensagem = $('mensagem');
  mensagem.textContent = texto;
  mensagem.classList.toggle('com-erro', erro);
}

function anunciar(texto) {
  $('anuncio').textContent = '';
  setTimeout(() => {
    $('anuncio').textContent = texto;
  }, 50);
}

function paraPosicao(parametro, valor) {
  if (parametro.curva === 'log') {
    return Math.log(valor / parametro.min) / Math.log(parametro.max / parametro.min);
  }
  return (valor - parametro.min) / (parametro.max - parametro.min);
}

function deUmaPosicao(parametro, posicao) {
  if (parametro.curva === 'log') {
    return parametro.min * Math.pow(parametro.max / parametro.min, posicao);
  }
  return parametro.min + posicao * (parametro.max - parametro.min);
}

function formatarValor(parametro, valor) {
  const faixa = parametro.max - parametro.min;
  const casas = faixa >= 50 ? 0 : faixa >= 5 ? 1 : 2;
  const texto = valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return `${texto} ${parametro.unidade}`.trim();
}

function formatarMilissegundos(valor, casas = 1) {
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} ms`;
}

function criarBotao(parametro, valorInicial, aoMudar) {
  const caixa = document.createElement('div');
  caixa.className = 'botao-giratorio';

  const botao = document.createElement('div');
  botao.className = 'knob';
  botao.tabIndex = 0;
  botao.setAttribute('role', 'slider');
  botao.setAttribute('aria-label', parametro.rotulo);
  botao.setAttribute('aria-valuemin', parametro.min);
  botao.setAttribute('aria-valuemax', parametro.max);

  const marca = document.createElement('span');
  marca.className = 'marca';
  botao.append(marca);

  const rotulo = document.createElement('span');
  rotulo.className = 'rotulo';
  rotulo.textContent = parametro.rotulo;

  const leitura = document.createElement('output');
  leitura.className = 'leitura';

  caixa.append(botao, rotulo, leitura);

  let posicao = Math.min(Math.max(paraPosicao(parametro, valorInicial), 0), 1);

  const atualizar = () => {
    const valor = deUmaPosicao(parametro, posicao);
    botao.style.setProperty('--angulo', `${-135 + 270 * posicao}deg`);
    leitura.textContent = formatarValor(parametro, valor);
    botao.setAttribute('aria-valuenow', valor);
    botao.setAttribute('aria-valuetext', leitura.textContent);
    return valor;
  };

  const mover = nova => {
    posicao = Math.min(Math.max(nova, 0), 1);
    aoMudar(atualizar());
  };

  atualizar();

  let inicioY = 0;
  let inicioPosicao = 0;

  botao.addEventListener('pointerdown', evento => {
    botao.setPointerCapture(evento.pointerId);
    inicioY = evento.clientY;
    inicioPosicao = posicao;
    botao.focus();
    evento.preventDefault();
  });

  botao.addEventListener('pointermove', evento => {
    if (!botao.hasPointerCapture(evento.pointerId)) {
      return;
    }
    mover(inicioPosicao + (inicioY - evento.clientY) / 160);
  });

  botao.addEventListener('keydown', evento => {
    const passo = evento.shiftKey ? 0.1 : 0.02;
    const teclas = {
      ArrowUp: posicao + passo,
      ArrowRight: posicao + passo,
      ArrowDown: posicao - passo,
      ArrowLeft: posicao - passo,
      PageUp: posicao + 0.1,
      PageDown: posicao - 0.1,
      Home: 0,
      End: 1
    };
    if (evento.key in teclas) {
      evento.preventDefault();
      mover(teclas[evento.key]);
    }
  });

  botao.addEventListener('dblclick', () => mover(paraPosicao(parametro, parametro.padrao)));

  return caixa;
}

function marcarPersonalizada() {
  $('seletorPredefinicao').value = 'personalizado';
}

function alterarParametro(tipo, chave, valor) {
  estado.pedais[tipo].valores[chave] = valor;
  if (instancias[tipo]) {
    instancias[tipo].ajustar(chave, valor);
  }
  marcarPersonalizada();
  salvarEstado();
}

function alternarPedal(tipo) {
  const dados = estado.pedais[tipo];
  dados.ligado = !dados.ligado;
  if (instancias[tipo]) {
    instancias[tipo].ligar(dados.ligado);
  }

  const pedal = document.querySelector(`.pedal[data-tipo="${tipo}"]`);
  pedal.dataset.ligado = String(dados.ligado);
  pedal.querySelector('.pe').setAttribute('aria-pressed', String(dados.ligado));
  pedal.querySelector('.pe-texto').textContent = dados.ligado ? 'Ligado' : 'Desligado';

  marcarPersonalizada();
  salvarEstado();
  anunciar(`${DEFINICOES[tipo].nome} ${dados.ligado ? 'ligado' : 'desligado'}.`);
}

function moverPedal(tipo, direcao) {
  const posicao = estado.ordem.indexOf(tipo);
  const destino = posicao + direcao;
  if (destino < 0 || destino >= estado.ordem.length) {
    return;
  }
  [estado.ordem[posicao], estado.ordem[destino]] = [estado.ordem[destino], estado.ordem[posicao]];

  desenharPedais();
  montarCadeia();
  marcarPersonalizada();
  salvarEstado();

  const pedal = document.querySelector(`.pedal[data-tipo="${tipo}"]`);
  const botaoDaDirecao = pedal.querySelector(`[data-direcao="${direcao}"]`);
  const alvo = botaoDaDirecao.disabled ? pedal.querySelector(`[data-direcao="${-direcao}"]`) : botaoDaDirecao;
  alvo.focus();
  anunciar(`${DEFINICOES[tipo].nome} na posição ${destino + 1} de ${estado.ordem.length}.`);
}

function desenharPedais() {
  const recipiente = $('pedais');
  recipiente.innerHTML = '';

  estado.ordem.forEach((tipo, posicao) => {
    const definicao = DEFINICOES[tipo];
    const dados = estado.pedais[tipo];
    const ultimo = posicao === estado.ordem.length - 1;

    const pedal = document.createElement('article');
    pedal.className = 'pedal';
    pedal.dataset.tipo = tipo;
    pedal.dataset.ligado = String(dados.ligado);
    pedal.style.setProperty('--cor-pedal', definicao.cor);
    pedal.setAttribute('aria-label', `Pedal ${definicao.nome}`);

    pedal.innerHTML = `
      <span class="led" aria-hidden="true"></span>
      <span class="jack esq" aria-hidden="true"></span>
      <span class="jack dir" aria-hidden="true"></span>
      <span class="parafuso esq" aria-hidden="true"></span>
      <span class="parafuso dir" aria-hidden="true"></span>
      <header class="pedal-topo">
        <h3>${definicao.nome}</h3>
        <div class="mover">
          <button type="button" class="mover-botao" data-direcao="-1" aria-label="Mover ${definicao.nome} para a esquerda"${posicao === 0 ? ' disabled' : ''}>&lsaquo;</button>
          <button type="button" class="mover-botao" data-direcao="1" aria-label="Mover ${definicao.nome} para a direita"${ultimo ? ' disabled' : ''}>&rsaquo;</button>
        </div>
      </header>
      <div class="botoes"></div>
      <button type="button" class="pe" aria-label="Ativar ${definicao.nome}" aria-pressed="${dados.ligado}">
        <span class="pe-texto">${dados.ligado ? 'Ligado' : 'Desligado'}</span>
      </button>`;

    const areaDosBotoes = pedal.querySelector('.botoes');
    definicao.parametros.forEach(parametro => {
      areaDosBotoes.append(
        criarBotao(parametro, dados.valores[parametro.chave], valor => alterarParametro(tipo, parametro.chave, valor))
      );
    });

    pedal.querySelector('.pe').addEventListener('click', () => alternarPedal(tipo));
    pedal.querySelectorAll('.mover-botao').forEach(botao => {
      botao.addEventListener('click', () => moverPedal(tipo, Number(botao.dataset.direcao)));
    });

    recipiente.append(pedal);
  });
}

const PADRAO_ENTRADA_P2 = /headset|headphone|fone|line|linha|extern|jack|combo/i;

function preencherSeletor(seletor, dispositivos, selecionado, prefixo) {
  seletor.innerHTML = '';
  seletor.add(new Option('Padrão do sistema', ''));
  dispositivos.forEach((dispositivo, indice) => {
    let texto = dispositivo.label || `${prefixo} ${indice + 1}`;
    if (prefixo === 'Entrada' && PADRAO_ENTRADA_P2.test(dispositivo.label)) {
      texto += ' (provável entrada P2)';
    }
    seletor.add(new Option(texto, dispositivo.deviceId));
  });
  const existe = Array.from(seletor.options).some(opcao => opcao.value === selecionado);
  seletor.value = existe ? selecionado : '';
}

async function atualizarListas() {
  const { entradas, saidas } = await listarDispositivos();
  const configuracao = configuracaoDaEntrada();
  const entradaAtual = configuracao && configuracao.deviceId ? configuracao.deviceId : $('seletorEntrada').value;
  preencherSeletor($('seletorEntrada'), entradas, entradaAtual, 'Entrada');
  preencherSeletor($('seletorSaida'), saidas, $('seletorSaida').value, 'Saída');
}

function atualizarInformacoes() {
  if (!audioLigado()) {
    ['infoTaxa', 'infoBase', 'infoSaida', 'infoCanais'].forEach(id => {
      $(id).textContent = '—';
    });
    return;
  }
  $('infoTaxa').textContent = `${contexto.sampleRate} Hz`;
  $('infoBase').textContent = typeof contexto.baseLatency === 'number' ? formatarMilissegundos(contexto.baseLatency * 1000) : 'indisponível';
  $('infoSaida').textContent = typeof contexto.outputLatency === 'number' ? formatarMilissegundos(contexto.outputLatency * 1000) : 'indisponível';
  const configuracao = configuracaoDaEntrada();
  $('infoCanais').textContent = configuracao && configuracao.channelCount ? String(configuracao.channelCount) : 'indisponível';
}

function mensagemDeErro(falha) {
  const mensagens = {
    NotAllowedError: 'O navegador bloqueou o acesso ao microfone. Permita o uso nas configurações do site e tente de novo.',
    NotFoundError: 'Nenhum dispositivo de entrada de áudio foi encontrado. Confira a conexão da placa.',
    OverconstrainedError: 'O dispositivo escolhido não está disponível. Escolha outra entrada.',
    NotReadableError: 'Outro programa está usando esse dispositivo de áudio. Feche-o e tente de novo.'
  };
  return mensagens[falha.name] || `Não foi possível ligar o áudio: ${falha.message}`;
}

async function detectarEntradas() {
  const botao = $('botaoDetectar');
  botao.disabled = true;
  try {
    const teste = await navigator.mediaDevices.getUserMedia({ audio: true });
    teste.getTracks().forEach(faixa => faixa.stop());
    await atualizarListas();
    mostrar('Entradas atualizadas. Escolha a do P2 (fone/headset) e clique em Ligar áudio.');
  } catch (falha) {
    mostrar(mensagemDeErro(falha), true);
  } finally {
    botao.disabled = false;
  }
}

async function ativar() {
  $('botaoLigar').disabled = true;
  try {
    await ligarAudio($('seletorEntrada').value, $('seletorCanal').value);
    await atualizarListas();
    if ($('seletorSaida').value) {
      await trocarSaida($('seletorSaida').value);
    }
    buffers = {
      entrada: new Float32Array(nos.analisadorEntrada.fftSize),
      saida: new Float32Array(nos.analisadorSaida.fftSize),
      afinador: new Float32Array(nos.analisadorEntrada.fftSize)
    };
    $('botaoLigar').textContent = 'Desligar áudio';
    $('botaoAfinador').disabled = false;
    $('botaoMedir').disabled = false;
    atualizarInformacoes();
    setTimeout(atualizarInformacoes, 1000);
    mostrar('Áudio ligado. Toque o instrumento e ative os pedais.');
  } catch (falha) {
    mostrar(mensagemDeErro(falha), true);
  } finally {
    $('botaoLigar').disabled = false;
  }
}

async function desativar(aviso) {
  pararAfinador();
  await desligarAudio();
  buffers = null;
  $('botaoLigar').textContent = 'Ligar áudio';
  $('botaoAfinador').disabled = true;
  $('botaoMedir').disabled = true;
  atualizarInformacoes();
  mostrar(aviso || 'Áudio desligado.', Boolean(aviso));
}

function atualizarBarra(elemento, chave, pico) {
  picosSuavizados[chave] = Math.max(pico, picosSuavizados[chave] * 0.9);
  const suavizado = picosSuavizados[chave];
  const decibeis = suavizado > 0 ? 20 * Math.log10(suavizado) : -100;
  const largura = Math.min(Math.max((decibeis + 60) / 60, 0), 1);
  elemento.style.width = `${largura * 100}%`;
  elemento.className = suavizado >= 0.98 ? 'barra saturado' : decibeis > -6 ? 'barra alto' : 'barra';
}

function animarMedidores() {
  requestAnimationFrame(animarMedidores);
  if (!audioLigado() || !buffers) {
    atualizarBarra($('barraEntrada'), 'entrada', 0);
    atualizarBarra($('barraSaida'), 'saida', 0);
    return;
  }
  atualizarBarra($('barraEntrada'), 'entrada', picoDoAnalisador(nos.analisadorEntrada, buffers.entrada));
  atualizarBarra($('barraSaida'), 'saida', picoDoAnalisador(nos.analisadorSaida, buffers.saida));
}

function atualizarAfinador() {
  if (!audioLigado() || !buffers) {
    return;
  }
  nos.analisadorEntrada.getFloatTimeDomainData(buffers.afinador);
  const frequencia = detectarFrequencia(buffers.afinador, contexto.sampleRate);

  if (!frequencia) {
    $('notaAfinador').textContent = '—';
    $('detalheAfinador').textContent = 'Sem sinal';
    $('agulha').classList.remove('afinado');
    return;
  }

  const nota = descreverNota(frequencia);
  const centavos = Math.round(nota.centavos);
  const limitado = Math.min(Math.max(nota.centavos, -50), 50);
  const afinado = Math.abs(centavos) <= 5;

  $('notaAfinador').textContent = `${nota.nome}${nota.oitava}`;
  $('agulha').style.left = `${50 + limitado}%`;
  $('agulha').classList.toggle('afinado', afinado);

  const frequenciaTexto = frequencia.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const situacao = afinado ? 'Afinado' : centavos > 0 ? `${centavos} centésimos acima` : `${-centavos} centésimos abaixo`;
  $('detalheAfinador').textContent = `${situacao} · ${frequenciaTexto} Hz`;
}

function iniciarAfinador() {
  silencios.afinador = $('silenciarAfinando').checked;
  aplicarVolume();
  temporizadorAfinador = setInterval(atualizarAfinador, 70);
  $('botaoAfinador').textContent = 'Desligar afinador';
  $('botaoAfinador').setAttribute('aria-pressed', 'true');
}

function pararAfinador() {
  if (temporizadorAfinador === null) {
    return;
  }
  clearInterval(temporizadorAfinador);
  temporizadorAfinador = null;
  silencios.afinador = false;
  aplicarVolume();
  $('botaoAfinador').textContent = 'Ligar afinador';
  $('botaoAfinador').setAttribute('aria-pressed', 'false');
  $('notaAfinador').textContent = '—';
  $('detalheAfinador').textContent = 'Sem sinal';
  $('agulha').classList.remove('afinado');
  $('agulha').style.left = '50%';
}

function mostrarMedidas(medidas) {
  const validas = medidas.filter(valor => valor !== null && valor > 0);
  const resultado = $('resultadoLatencia');

  if (validas.length === 0) {
    resultado.textContent = 'Nenhum clique foi detectado. Confira o cabo da saída para a entrada, aumente o volume de saída ou reduza o limite de detecção.';
    return;
  }

  const media = validas.reduce((soma, valor) => soma + valor, 0) / validas.length;
  const linhas = medidas
    .map((valor, indice) => `<tr><td>${indice + 1}</td><td>${valor === null ? 'não detectado' : formatarMilissegundos(valor)}</td></tr>`)
    .join('');

  resultado.innerHTML = `
    <p><strong>Média: ${formatarMilissegundos(media)}</strong> · menor ${formatarMilissegundos(Math.min(...validas))} · maior ${formatarMilissegundos(Math.max(...validas))}</p>
    <table>
      <caption>Medidas</caption>
      <thead><tr><th scope="col">Clique</th><th scope="col">Ida e volta</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p class="dica">É o atraso entre a placa receber o som e devolvê-lo. Como referência aproximada, abaixo de uns 10 ms quase não se percebe e acima de uns 20 ms muitos músicos já sentem o atraso.</p>`;
}

async function medir() {
  if (!audioLigado()) {
    return;
  }
  pararAfinador();
  $('botaoMedir').disabled = true;
  $('resultadoLatencia').textContent = 'Medindo. Não toque o instrumento.';
  try {
    const medidas = await medirLatencia(Number($('sensibilidade').value));
    mostrarMedidas(medidas);
  } catch (falha) {
    $('resultadoLatencia').textContent = `Não foi possível medir: ${falha.message}`;
  } finally {
    $('botaoMedir').disabled = !audioLigado();
  }
}

$('botaoDetectar').addEventListener('click', detectarEntradas);

$('botaoLigar').addEventListener('click', () => {
  if (audioLigado()) {
    desativar();
  } else {
    ativar();
  }
});

$('seletorEntrada').addEventListener('change', async evento => {
  if (!audioLigado()) {
    return;
  }
  try {
    await trocarEntrada(evento.target.value, $('seletorCanal').value);
    atualizarInformacoes();
    mostrar('Entrada trocada.');
  } catch (falha) {
    mostrar(mensagemDeErro(falha), true);
  }
});

$('seletorCanal').addEventListener('change', evento => {
  if (audioLigado()) {
    rotearCanal(evento.target.value);
  }
});

$('seletorSaida').addEventListener('change', async evento => {
  if (!audioLigado()) {
    return;
  }
  try {
    await trocarSaida(evento.target.value);
    mostrar('Saída trocada.');
  } catch (falha) {
    mostrar(`Não foi possível trocar a saída: ${falha.message}`, true);
  }
});

$('ganhoEntrada').addEventListener('input', evento => {
  estado.ganhoEntrada = Number(evento.target.value);
  $('saidaGanho').textContent = `${estado.ganhoEntrada} dB`;
  aplicarGanhoEntrada();
  salvarEstado();
});

$('volumeSaida').addEventListener('input', evento => {
  estado.volume = Number(evento.target.value);
  $('saidaVolume').textContent = `${estado.volume}%`;
  aplicarVolume();
  salvarEstado();
});

$('seletorPredefinicao').addEventListener('change', evento => {
  if (evento.target.value === 'personalizado') {
    return;
  }
  aplicarPredefinicao(evento.target.value);
  desenharPedais();
  sincronizarInstancias();
  salvarEstado();
  anunciar(`Predefinição ${evento.target.selectedOptions[0].textContent} aplicada.`);
});

$('botaoAfinador').addEventListener('click', () => {
  if (!audioLigado()) {
    return;
  }
  if (temporizadorAfinador === null) {
    iniciarAfinador();
  } else {
    pararAfinador();
  }
});

$('silenciarAfinando').addEventListener('change', evento => {
  if (temporizadorAfinador !== null) {
    silencios.afinador = evento.target.checked;
    aplicarVolume();
  }
});

$('sensibilidade').addEventListener('input', evento => {
  $('saidaSensibilidade').textContent = Number(evento.target.value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
});

$('botaoMedir').addEventListener('click', medir);

document.addEventListener('entrada-perdida', () => {
  if (audioLigado()) {
    desativar('A entrada de áudio foi desconectada. Conecte a placa e ligue o áudio de novo.');
  }
});

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (audioLigado()) {
      atualizarListas();
    }
  });
}

function iniciar() {
  $('ganhoEntrada').value = estado.ganhoEntrada;
  $('saidaGanho').textContent = `${estado.ganhoEntrada} dB`;
  $('volumeSaida').value = estado.volume;
  $('saidaVolume').textContent = `${estado.volume}%`;
  desenharPedais();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('botaoLigar').disabled = true;
    mostrar('Este navegador não permite acessar a entrada de áudio. Use o Chrome, o Edge ou o Firefox, em uma página com HTTPS.', true);
  } else if (!window.isSecureContext) {
    mostrar('O acesso ao microfone só funciona em páginas com HTTPS ou em localhost.', true);
  }

  if (!saidaSelecionavel()) {
    $('seletorSaida').disabled = true;
    $('seletorSaida').title = 'Este navegador usa a saída padrão do sistema.';
  }

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    atualizarListas().catch(() => {});
  } else {
    $('botaoDetectar').disabled = true;
  }

  animarMedidores();
}

iniciar();
