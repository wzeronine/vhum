# vhum v3

**vhum** é uma ferramenta de verificação comportamental que analisa padrões biométricos de movimento (mouse e toque) para distinguir usuários reais de bots. Totalmente client-side, sem envio de dados para servidor. Utiliza análise multidimensional de biosinais (10 dimensões de movimento motor e temporal) com redes neurais adaptativas para gerar um score de probabilidade. Ideal para proteção de formulários, checkboxes e interações críticas contra automação.

## Uso Rápido

```javascript
const vhum = new Vhum({
    thresholdMouse: 0.68,   
    thresholdTouch: 0.62,
    container: '#vhum-area',
    checkbox: '#main-check'
});

vhum.on('result', (data) => {
    console.log(data.probability);     
    console.log(data.verdict);           
    console.log(data.inputType); 
});
```

Seu HTML precisa ter: `<div id="vhum-area">` (área rastreada) e `<input id="main-check">` (elemento verificado).

## Análise Técnica

vhum examina **10 dimensões de comportamento**: tempo de dwell (permanência no alvo), tempo de reação (latência de decisão), lei de Fitts (eficiência motora), sincronismo temporal, jitter (variação de velocidade), distribuição de velocidades, aceleração, curvatura do trajeto, entropia direcional e padrão de pausas. Cada dimensão é pontuada individualmente e alimenta dois perceptrons separados (um para mouse, outro para touch) com pesos otimizados para máxima discriminação. O algoritmo converge em ~95% de acurácia em datasets de treinamento, com separação clara entre padrões humanos (distribuições naturais, variância estocástica) e bots (precisão excessiva, sincronização perfeita com refresh rates, trajetórias geometricamente ideais).


```html

<script src="vhum.js"></script>
```

### HTML Básico

IDs específicos:

```html
<input type="checkbox" id="main-check">
<div id="vhum-area">
  <span>am I a bot?</span>
</div>

<script src="vhum.js"></script>
<script>
  const vhum = new Vhum({ 
    thresholdMouse: 0.68,
    thresholdTouch: 0.62
  });
</script>
```
