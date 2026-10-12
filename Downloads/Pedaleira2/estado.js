const ordemInicial = ['compressor', 'overdrive', 'eq', 'chorus', 'tremolo', 'delay', 'reverb'];
const chaveDeArmazenamento = 'pedaleira-estado';

const predefinicoes = {
  limpo: {
    pedais: {
      compressor: { limiar: -28, taxa: 3, ataque: 12, nivel: 3 },
      reverb: { tamanho: 1.4, tom: 5500, mistura: 15 }
    }
  },
  blues: {
    pedais: {
      overdrive: { ganho: 12, tom: 3000, nivel: 0.8 },
      eq: { graves: 2, medios: 3, agudos: -2 },
      reverb: { tamanho: 1.6, tom: 4500, mistura: 25 }
    }
  },
  rock: {
    pedais: {
      overdrive: { ganho: 35, tom: 4200, nivel: 0.6 },
      eq: { graves: 3, medios: -2, agudos: 4 },
      delay: { tempo: 320, repeticoes: 25, tom: 3000, mistura: 18 }
    }
  },
  ambiente: {
    pedais: {
      chorus: { velocidade: 0.8, profundidade: 5, mistura: 55 },
      delay: { tempo: 480, repeticoes: 50, tom: 2500, mistura: 40 },
      reverb: { tamanho: 3.2, tom: 5000, mistura: 45 }
    }
  }
};

function valoresPadrao(tipo) {
  const valores = {};
  DEFINICOES[tipo].parametros.forEach(parametro => {
    valores[parametro.chave] = parametro.padrao;
  });
  return valores;
}

function estadoPadrao() {
  const pedais = {};
  Object.keys(DEFINICOES).forEach(tipo => {
    pedais[tipo] = { ligado: false, valores: valoresPadrao(tipo) };
  });
  return { ordem: [...ordemInicial], pedais, ganhoEntrada: 0, volume: 70 };
}

function carregarEstado() {
  const padrao = estadoPadrao();
  try {
    const salvo = JSON.parse(localStorage.getItem(chaveDeArmazenamento));
    if (!salvo) {
      return padrao;
    }

    const ordem = Array.isArray(salvo.ordem) ? salvo.ordem.filter(tipo => DEFINICOES[tipo]) : [];
    ordemInicial.forEach(tipo => {
      if (!ordem.includes(tipo)) {
        ordem.push(tipo);
      }
    });
    padrao.ordem = ordem;

    Object.keys(padrao.pedais).forEach(tipo => {
      const doSalvo = salvo.pedais && salvo.pedais[tipo];
      if (!doSalvo) {
        return;
      }
      padrao.pedais[tipo].ligado = Boolean(doSalvo.ligado);
      Object.keys(padrao.pedais[tipo].valores).forEach(chave => {
        const bruto = doSalvo.valores ? doSalvo.valores[chave] : undefined;
        if (typeof bruto === 'number' && Number.isFinite(bruto)) {
          padrao.pedais[tipo].valores[chave] = bruto;
        }
      });
    });

    if (typeof salvo.ganhoEntrada === 'number' && Number.isFinite(salvo.ganhoEntrada)) {
      padrao.ganhoEntrada = salvo.ganhoEntrada;
    }
    if (typeof salvo.volume === 'number' && Number.isFinite(salvo.volume)) {
      padrao.volume = salvo.volume;
    }
    return padrao;
  } catch (falha) {
    return padrao;
  }
}

let estado = carregarEstado();

function salvarEstado() {
  try {
    localStorage.setItem(chaveDeArmazenamento, JSON.stringify(estado));
  } catch (falha) {
    return;
  }
}

function aplicarPredefinicao(chave) {
  const predefinicao = predefinicoes[chave];
  if (!predefinicao) {
    return;
  }
  estado.ordem = [...ordemInicial];
  Object.keys(estado.pedais).forEach(tipo => {
    const ajuste = predefinicao.pedais[tipo];
    estado.pedais[tipo] = {
      ligado: Boolean(ajuste),
      valores: { ...valoresPadrao(tipo), ...(ajuste || {}) }
    };
  });
}
