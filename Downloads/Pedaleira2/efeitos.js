const emDecibeis = valor => Math.pow(10, valor / 20);

function suave(contexto, parametro, valor) {
  parametro.setTargetAtTime(valor, contexto.currentTime, 0.02);
}

function curvaDeDistorcao() {
  const pontos = 2048;
  const curva = new Float32Array(pontos);
  for (let i = 0; i < pontos; i++) {
    const x = (i * 2) / (pontos - 1) - 1;
    curva[i] = Math.tanh(x * 2.2);
  }
  return curva;
}

function gerarRespostaDeImpulso(contexto, duracao) {
  const taxa = contexto.sampleRate;
  const tamanho = Math.max(1, Math.floor(taxa * duracao));
  const buffer = contexto.createBuffer(2, tamanho, taxa);
  for (let canal = 0; canal < 2; canal++) {
    const dados = buffer.getChannelData(canal);
    for (let i = 0; i < tamanho; i++) {
      const queda = Math.pow(1 - i / tamanho, 3);
      dados[i] = (Math.random() * 2 - 1) * queda;
    }
  }
  return buffer;
}

const DEFINICOES = {
  compressor: {
    nome: 'Compressor',
    cor: '#2f5d8c',
    parametros: [
      { chave: 'limiar', rotulo: 'Limiar', min: -60, max: 0, padrao: -24, unidade: 'dB' },
      { chave: 'taxa', rotulo: 'Taxa', min: 1, max: 20, padrao: 4, unidade: ':1' },
      { chave: 'ataque', rotulo: 'Ataque', min: 1, max: 100, padrao: 10, unidade: 'ms' },
      { chave: 'nivel', rotulo: 'Nível', min: 0, max: 18, padrao: 4, unidade: 'dB' }
    ],
    criar(contexto) {
      const compressor = contexto.createDynamicsCompressor();
      const nivel = contexto.createGain();
      compressor.knee.value = 6;
      compressor.release.value = 0.25;
      compressor.connect(nivel);
      const acoes = {
        limiar: valor => suave(contexto, compressor.threshold, valor),
        taxa: valor => suave(contexto, compressor.ratio, valor),
        ataque: valor => suave(contexto, compressor.attack, valor / 1000),
        nivel: valor => suave(contexto, nivel.gain, emDecibeis(valor))
      };
      return { dentro: compressor, fora: nivel, ajustar: (chave, valor) => acoes[chave](valor) };
    }
  },

  overdrive: {
    nome: 'Overdrive',
    cor: '#3c7a4b',
    parametros: [
      { chave: 'ganho', rotulo: 'Ganho', min: 1, max: 60, padrao: 14, unidade: '×' },
      { chave: 'tom', rotulo: 'Tom', min: 500, max: 8000, padrao: 3500, unidade: 'Hz', curva: 'log' },
      { chave: 'nivel', rotulo: 'Nível', min: 0, max: 1.5, padrao: 0.6, unidade: '' }
    ],
    criar(contexto) {
      const passaAltas = contexto.createBiquadFilter();
      passaAltas.type = 'highpass';
      passaAltas.frequency.value = 90;
      const ganho = contexto.createGain();
      const distorcao = contexto.createWaveShaper();
      distorcao.curve = curvaDeDistorcao();
      distorcao.oversample = '4x';
      const tom = contexto.createBiquadFilter();
      tom.type = 'lowpass';
      const nivel = contexto.createGain();
      passaAltas.connect(ganho);
      ganho.connect(distorcao);
      distorcao.connect(tom);
      tom.connect(nivel);
      const acoes = {
        ganho: valor => suave(contexto, ganho.gain, valor),
        tom: valor => suave(contexto, tom.frequency, valor),
        nivel: valor => suave(contexto, nivel.gain, valor)
      };
      return { dentro: passaAltas, fora: nivel, ajustar: (chave, valor) => acoes[chave](valor) };
    }
  },

  eq: {
    nome: 'Equalizador',
    cor: '#7d8791',
    parametros: [
      { chave: 'graves', rotulo: 'Graves', min: -15, max: 15, padrao: 0, unidade: 'dB' },
      { chave: 'medios', rotulo: 'Médios', min: -15, max: 15, padrao: 0, unidade: 'dB' },
      { chave: 'agudos', rotulo: 'Agudos', min: -15, max: 15, padrao: 0, unidade: 'dB' }
    ],
    criar(contexto) {
      const graves = contexto.createBiquadFilter();
      graves.type = 'lowshelf';
      graves.frequency.value = 120;
      const medios = contexto.createBiquadFilter();
      medios.type = 'peaking';
      medios.frequency.value = 900;
      medios.Q.value = 0.9;
      const agudos = contexto.createBiquadFilter();
      agudos.type = 'highshelf';
      agudos.frequency.value = 3500;
      graves.connect(medios);
      medios.connect(agudos);
      const acoes = {
        graves: valor => suave(contexto, graves.gain, valor),
        medios: valor => suave(contexto, medios.gain, valor),
        agudos: valor => suave(contexto, agudos.gain, valor)
      };
      return { dentro: graves, fora: agudos, ajustar: (chave, valor) => acoes[chave](valor) };
    }
  },

  chorus: {
    nome: 'Chorus',
    cor: '#3f94b4',
    parametros: [
      { chave: 'velocidade', rotulo: 'Velocidade', min: 0.1, max: 8, padrao: 1.2, unidade: 'Hz' },
      { chave: 'profundidade', rotulo: 'Profundidade', min: 0, max: 10, padrao: 4, unidade: 'ms' },
      { chave: 'mistura', rotulo: 'Mistura', min: 0, max: 100, padrao: 50, unidade: '%' }
    ],
    criar(contexto) {
      const soma = contexto.createGain();
      const seco = contexto.createGain();
      const atraso = contexto.createDelay(0.05);
      atraso.delayTime.value = 0.02;
      const molhado = contexto.createGain();
      const lfo = contexto.createOscillator();
      const profundidade = contexto.createGain();
      const saida = contexto.createGain();
      lfo.connect(profundidade);
      profundidade.connect(atraso.delayTime);
      soma.connect(seco);
      seco.connect(saida);
      soma.connect(atraso);
      atraso.connect(molhado);
      molhado.connect(saida);
      lfo.start();
      const acoes = {
        velocidade: valor => suave(contexto, lfo.frequency, valor),
        profundidade: valor => suave(contexto, profundidade.gain, valor / 1000),
        mistura: valor => suave(contexto, molhado.gain, valor / 100)
      };
      return { dentro: soma, fora: saida, ajustar: (chave, valor) => acoes[chave](valor) };
    }
  },

  tremolo: {
    nome: 'Tremolo',
    cor: '#b4651f',
    parametros: [
      { chave: 'velocidade', rotulo: 'Velocidade', min: 0.5, max: 12, padrao: 5, unidade: 'Hz' },
      { chave: 'profundidade', rotulo: 'Profundidade', min: 0, max: 100, padrao: 60, unidade: '%' }
    ],
    criar(contexto) {
      const tremolo = contexto.createGain();
      const lfo = contexto.createOscillator();
      const profundidade = contexto.createGain();
      lfo.connect(profundidade);
      profundidade.connect(tremolo.gain);
      lfo.start();
      const acoes = {
        velocidade: valor => suave(contexto, lfo.frequency, valor),
        profundidade: valor => {
          const intensidade = valor / 100;
          suave(contexto, tremolo.gain, 1 - intensidade / 2);
          suave(contexto, profundidade.gain, intensidade / 2);
        }
      };
      return { dentro: tremolo, fora: tremolo, ajustar: (chave, valor) => acoes[chave](valor) };
    }
  },

  delay: {
    nome: 'Delay',
    cor: '#6e4f9e',
    parametros: [
      { chave: 'tempo', rotulo: 'Tempo', min: 40, max: 1000, padrao: 380, unidade: 'ms' },
      { chave: 'repeticoes', rotulo: 'Repetições', min: 0, max: 90, padrao: 35, unidade: '%' },
      { chave: 'tom', rotulo: 'Tom', min: 800, max: 8000, padrao: 3200, unidade: 'Hz', curva: 'log' },
      { chave: 'mistura', rotulo: 'Mistura', min: 0, max: 100, padrao: 30, unidade: '%' }
    ],
    criar(contexto) {
      const soma = contexto.createGain();
      const seco = contexto.createGain();
      const atraso = contexto.createDelay(2);
      const molhado = contexto.createGain();
      const realimentacao = contexto.createGain();
      const filtro = contexto.createBiquadFilter();
      filtro.type = 'lowpass';
      const saida = contexto.createGain();
      soma.connect(seco);
      seco.connect(saida);
      soma.connect(atraso);
      atraso.connect(molhado);
      molhado.connect(saida);
      atraso.connect(filtro);
      filtro.connect(realimentacao);
      realimentacao.connect(atraso);
      const acoes = {
        tempo: valor => suave(contexto, atraso.delayTime, valor / 1000),
        repeticoes: valor => suave(contexto, realimentacao.gain, valor / 100),
        tom: valor => suave(contexto, filtro.frequency, valor),
        mistura: valor => suave(contexto, molhado.gain, valor / 100)
      };
      return { dentro: soma, fora: saida, ajustar: (chave, valor) => acoes[chave](valor) };
    }
  },

  reverb: {
    nome: 'Reverb',
    cor: '#1f6f78',
    parametros: [
      { chave: 'tamanho', rotulo: 'Tamanho', min: 0.3, max: 4, padrao: 1.8, unidade: 's' },
      { chave: 'tom', rotulo: 'Tom', min: 1000, max: 12000, padrao: 5500, unidade: 'Hz', curva: 'log' },
      { chave: 'mistura', rotulo: 'Mistura', min: 0, max: 100, padrao: 25, unidade: '%' }
    ],
    criar(contexto) {
      const soma = contexto.createGain();
      const seco = contexto.createGain();
      const convolucao = contexto.createConvolver();
      const tom = contexto.createBiquadFilter();
      tom.type = 'lowpass';
      const molhado = contexto.createGain();
      const saida = contexto.createGain();
      soma.connect(seco);
      seco.connect(saida);
      soma.connect(convolucao);
      convolucao.connect(tom);
      tom.connect(molhado);
      molhado.connect(saida);
      convolucao.buffer = gerarRespostaDeImpulso(contexto, 1.8);
      let temporizador = null;
      const acoes = {
        tamanho: valor => {
          clearTimeout(temporizador);
          temporizador = setTimeout(() => {
            convolucao.buffer = gerarRespostaDeImpulso(contexto, valor);
          }, 150);
        },
        tom: valor => suave(contexto, tom.frequency, valor),
        mistura: valor => suave(contexto, molhado.gain, valor / 100)
      };
      return { dentro: soma, fora: saida, ajustar: (chave, valor) => acoes[chave](valor) };
    }
  }
};
