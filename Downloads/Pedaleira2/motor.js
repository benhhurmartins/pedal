let contexto = null;
let fluxo = null;
let nos = {};
let instancias = {};
const silencios = { afinador: false, medicao: false };

const codigoDoDetector = `
class DetectorDeImpulso extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ativo = false;
    this.limite = 0.1;
    this.desde = 0;
    this.port.onmessage = evento => {
      this.ativo = evento.data.ativo;
      this.limite = evento.data.limite;
      this.desde = evento.data.desde;
    };
  }

  process(entradas) {
    const canal = entradas[0] && entradas[0][0];
    if (this.ativo && canal) {
      for (let i = 0; i < canal.length; i++) {
        if (currentFrame + i >= this.desde && Math.abs(canal[i]) > this.limite) {
          this.ativo = false;
          this.port.postMessage({ quadro: currentFrame + i });
          break;
        }
      }
    }
    return true;
  }
}

registerProcessor('detector-de-impulso', DetectorDeImpulso);
`;

function audioLigado() {
  return contexto !== null;
}

function saidaSelecionavel() {
  return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
}

async function abrirFluxo(idDispositivo) {
  if (fluxo) {
    fluxo.getTracks().forEach(faixa => faixa.stop());
  }
  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 },
    latency: { ideal: 0 }
  };
  if (idDispositivo) {
    audio.deviceId = { exact: idDispositivo };
  }
  fluxo = await navigator.mediaDevices.getUserMedia({ audio });
  fluxo.getAudioTracks()[0].addEventListener('ended', () => {
    document.dispatchEvent(new CustomEvent('entrada-perdida'));
  });
}

function construirNos() {
  nos = {};
  nos.fonte = null;
  nos.detector = null;
  nos.separador = contexto.createChannelSplitter(2);

  nos.entradaMono = contexto.createGain();
  nos.entradaMono.channelCount = 1;
  nos.entradaMono.channelCountMode = 'explicit';

  nos.analisadorEntrada = contexto.createAnalyser();
  nos.analisadorEntrada.fftSize = 4096;

  nos.mestre = contexto.createGain();

  nos.limitador = contexto.createDynamicsCompressor();
  nos.limitador.threshold.value = -3;
  nos.limitador.knee.value = 0;
  nos.limitador.ratio.value = 20;
  nos.limitador.attack.value = 0.003;
  nos.limitador.release.value = 0.1;

  nos.analisadorSaida = contexto.createAnalyser();
  nos.analisadorSaida.fftSize = 1024;

  nos.mestre.connect(nos.limitador);
  nos.limitador.connect(nos.analisadorSaida);
  nos.analisadorSaida.connect(contexto.destination);
}

function rotearCanal(canal) {
  if (!nos.fonte) {
    return;
  }
  nos.fonte.disconnect();
  nos.separador.disconnect();
  if (canal === 'esquerdo' || canal === 'direito') {
    nos.fonte.connect(nos.separador);
    nos.separador.connect(nos.entradaMono, canal === 'esquerdo' ? 0 : 1);
  } else {
    nos.fonte.connect(nos.entradaMono);
  }
}

function conectarFonte(canal) {
  if (nos.fonte) {
    nos.fonte.disconnect();
  }
  nos.fonte = contexto.createMediaStreamSource(fluxo);
  rotearCanal(canal);
}

function criarInstancias() {
  instancias = {};
  Object.keys(DEFINICOES).forEach(tipo => {
    const entrada = contexto.createGain();
    const saida = contexto.createGain();
    const nucleo = DEFINICOES[tipo].criar(contexto);
    nucleo.fora.connect(saida);

    const instancia = { entrada, saida, nucleo };
    instancia.ligar = ligado => {
      entrada.disconnect();
      entrada.connect(ligado ? nucleo.dentro : saida);
    };
    instancia.ajustar = (chave, valor) => nucleo.ajustar(chave, valor);

    const dados = estado.pedais[tipo];
    Object.keys(dados.valores).forEach(chave => nucleo.ajustar(chave, dados.valores[chave]));
    instancia.ligar(dados.ligado);
    instancias[tipo] = instancia;
  });
}

function montarCadeia() {
  if (!contexto) {
    return;
  }
  nos.entradaMono.disconnect();
  nos.entradaMono.connect(nos.analisadorEntrada);
  if (nos.detector) {
    nos.entradaMono.connect(nos.detector);
  }

  let anterior = nos.entradaMono;
  estado.ordem.forEach(tipo => {
    const instancia = instancias[tipo];
    instancia.saida.disconnect();
    anterior.connect(instancia.entrada);
    anterior = instancia.saida;
  });
  anterior.connect(nos.mestre);
}

function sincronizarInstancias() {
  if (!contexto) {
    return;
  }
  Object.keys(instancias).forEach(tipo => {
    const dados = estado.pedais[tipo];
    Object.keys(dados.valores).forEach(chave => instancias[tipo].ajustar(chave, dados.valores[chave]));
    instancias[tipo].ligar(dados.ligado);
  });
  montarCadeia();
}

function aplicarGanhoEntrada() {
  if (contexto) {
    suave(contexto, nos.entradaMono.gain, emDecibeis(estado.ganhoEntrada));
  }
}

function aplicarVolume() {
  if (!contexto) {
    return;
  }
  const mudo = silencios.afinador || silencios.medicao;
  const nivel = mudo ? 0 : Math.pow(estado.volume / 100, 2);
  suave(contexto, nos.mestre.gain, nivel);
}

async function ligarAudio(idEntrada, canal) {
  const Classe = window.AudioContext || window.webkitAudioContext;
  contexto = new Classe({ latencyHint: 'interactive' });
  try {
    await abrirFluxo(idEntrada);
  } catch (falha) {
    await contexto.close();
    contexto = null;
    throw falha;
  }
  construirNos();
  conectarFonte(canal);
  criarInstancias();
  montarCadeia();
  aplicarGanhoEntrada();
  aplicarVolume();
  await contexto.resume();
}

async function desligarAudio() {
  if (fluxo) {
    fluxo.getTracks().forEach(faixa => faixa.stop());
  }
  fluxo = null;
  if (contexto) {
    await contexto.close();
  }
  contexto = null;
  nos = {};
  instancias = {};
  silencios.afinador = false;
  silencios.medicao = false;
}

async function trocarEntrada(idDispositivo, canal) {
  await abrirFluxo(idDispositivo);
  conectarFonte(canal);
}

async function trocarSaida(idDispositivo) {
  if (contexto && saidaSelecionavel()) {
    await contexto.setSinkId(idDispositivo);
  }
}

async function listarDispositivos() {
  const todos = await navigator.mediaDevices.enumerateDevices();
  const util = dispositivo => dispositivo.deviceId !== 'default' && dispositivo.deviceId !== 'communications';
  return {
    entradas: todos.filter(dispositivo => dispositivo.kind === 'audioinput' && util(dispositivo)),
    saidas: todos.filter(dispositivo => dispositivo.kind === 'audiooutput' && util(dispositivo))
  };
}

function configuracaoDaEntrada() {
  const faixa = fluxo && fluxo.getAudioTracks()[0];
  return faixa ? faixa.getSettings() : null;
}

function picoDoAnalisador(analisador, memoria) {
  analisador.getFloatTimeDomainData(memoria);
  let pico = 0;
  for (let i = 0; i < memoria.length; i++) {
    const valor = Math.abs(memoria[i]);
    if (valor > pico) {
      pico = valor;
    }
  }
  return pico;
}

async function prepararDetector() {
  if (nos.detector) {
    return;
  }
  const endereco = URL.createObjectURL(new Blob([codigoDoDetector], { type: 'application/javascript' }));
  await contexto.audioWorklet.addModule(endereco);
  URL.revokeObjectURL(endereco);
  nos.detector = new AudioWorkletNode(contexto, 'detector-de-impulso');
  const silencio = contexto.createGain();
  silencio.gain.value = 0;
  nos.detector.connect(silencio);
  silencio.connect(contexto.destination);
  nos.entradaMono.connect(nos.detector);
}

function medirUmaVez(limite) {
  return new Promise(resolver => {
    const taxa = contexto.sampleRate;
    const inicio = contexto.currentTime + 0.25;

    const limiteDeTempo = setTimeout(() => {
      nos.detector.port.onmessage = null;
      resolver(null);
    }, 1500);

    nos.detector.port.onmessage = evento => {
      clearTimeout(limiteDeTempo);
      nos.detector.port.onmessage = null;
      resolver((evento.data.quadro / taxa - inicio) * 1000);
    };
    nos.detector.port.postMessage({ ativo: true, limite, desde: Math.floor(inicio * taxa) });

    const oscilador = contexto.createOscillator();
    const envelope = contexto.createGain();
    oscilador.type = 'square';
    oscilador.frequency.value = 1000;
    envelope.gain.setValueAtTime(0.5, inicio);
    envelope.gain.setValueAtTime(0, inicio + 0.02);
    oscilador.connect(envelope);
    envelope.connect(contexto.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.05);
  });
}

async function medirLatencia(limite, aoMedir) {
  await prepararDetector();
  silencios.medicao = true;
  aplicarVolume();
  const medidas = [];
  try {
    for (let i = 0; i < 5; i++) {
      const milissegundos = await medirUmaVez(limite);
      medidas.push(milissegundos);
      if (aoMedir) {
        aoMedir(i + 1, milissegundos);
      }
      await new Promise(continuar => setTimeout(continuar, 500));
    }
  } finally {
    silencios.medicao = false;
    aplicarVolume();
  }
  return medidas;
}
