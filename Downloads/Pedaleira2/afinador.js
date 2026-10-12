const nomesDasNotas = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];

function detectarFrequencia(amostras, taxa) {
  const tamanho = amostras.length;

  let soma = 0;
  for (let i = 0; i < tamanho; i++) {
    soma += amostras[i] * amostras[i];
  }
  if (Math.sqrt(soma / tamanho) < 0.01) {
    return null;
  }

  const menorAtraso = Math.floor(taxa / 1200);
  const maiorAtraso = Math.min(Math.floor(taxa / 40), tamanho >> 1);
  const janela = tamanho - maiorAtraso;
  const nsdf = new Float32Array(maiorAtraso);

  for (let atraso = 0; atraso < maiorAtraso; atraso++) {
    let correlacao = 0;
    let energia = 0;
    for (let i = 0; i < janela; i++) {
      correlacao += amostras[i] * amostras[i + atraso];
      energia += amostras[i] * amostras[i] + amostras[i + atraso] * amostras[i + atraso];
    }
    nsdf[atraso] = energia === 0 ? 0 : (2 * correlacao) / energia;
  }

  let atraso = menorAtraso;
  while (atraso < maiorAtraso - 1 && nsdf[atraso] > 0) {
    atraso++;
  }

  const picos = [];
  let melhorValor = 0;
  while (atraso < maiorAtraso - 1) {
    while (atraso < maiorAtraso - 1 && nsdf[atraso] <= 0) {
      atraso++;
    }
    let pico = atraso;
    while (atraso < maiorAtraso - 1 && nsdf[atraso] > 0) {
      if (nsdf[atraso] > nsdf[pico]) {
        pico = atraso;
      }
      atraso++;
    }
    if (nsdf[pico] > 0) {
      picos.push(pico);
      melhorValor = Math.max(melhorValor, nsdf[pico]);
    }
  }

  if (melhorValor < 0.5) {
    return null;
  }

  const escolhido = picos.find(pico => nsdf[pico] >= melhorValor * 0.9);
  if (escolhido === undefined || escolhido < 1 || escolhido >= maiorAtraso - 1) {
    return null;
  }

  const a = nsdf[escolhido - 1];
  const b = nsdf[escolhido];
  const c = nsdf[escolhido + 1];
  const divisor = a - 2 * b + c;
  const ajuste = divisor === 0 ? 0 : (0.5 * (a - c)) / divisor;

  return taxa / (escolhido + ajuste);
}

function descreverNota(frequencia) {
  const numero = 69 + 12 * Math.log2(frequencia / 440);
  const arredondado = Math.round(numero);
  return {
    nome: nomesDasNotas[((arredondado % 12) + 12) % 12],
    oitava: Math.floor(arredondado / 12) - 1,
    centavos: (numero - arredondado) * 100
  };
}
