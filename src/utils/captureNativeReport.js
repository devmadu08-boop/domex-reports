// Native browser rendering avoids Canvas text-baseline approximations in badges and tables.
const assets = new Map();
async function assetDataUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  if (!assets.has(url)) assets.set(url, fetch(url).then(response => {
    if (!response.ok) throw new Error('Could not load report artwork. Please refresh and retry.');
    return response.blob();
  }).then(blob => new Promise((resolve,reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
  })).catch(error => { assets.delete(url); throw error; }));
  return assets.get(url);
}
async function embeddedCss(value) {
  const matches = [...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
  let result = value;
  for (const match of matches) {
    if (match[1].startsWith('#') || match[1].startsWith('data:')) continue;
    const data = await assetDataUrl(new URL(match[1], document.baseURI).href);
    result = result.replace(match[0], `url("${data}")`);
  }
  return result;
}
async function copyStyle(source, target, pseudo) {
  const style = getComputedStyle(source, pseudo);
  for (const property of style) {
    if (property.startsWith('animation') || property.startsWith('transition')) continue;
    const value = style.getPropertyValue(property);
    target.style.setProperty(property, value.includes('url(') ? await embeddedCss(value) : value);
  }
  return style;
}
export async function captureNativeReport(element, { scale = 3 } = {}) {
  const clone = element.cloneNode(true);
  const originals = [element, ...element.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  const pseudoRules = [];
  for (let index = 0; index < originals.length; index++) {
    const original = originals[index], copied = copies[index];
    await copyStyle(original, copied);
    if (copied instanceof HTMLImageElement) {
      copied.removeAttribute('srcset'); copied.src = await assetDataUrl(original.currentSrc || original.src);
      copied.loading = 'eager';
    }
    if (copied instanceof HTMLInputElement) { copied.setAttribute('value',original.value); if(original.checked) copied.setAttribute('checked',''); }
    if (copied instanceof HTMLTextAreaElement) copied.textContent = original.value;
    for (const pseudo of ['::before','::after']) {
      const style = getComputedStyle(original,pseudo);
      if (!style.content || ['none','normal'].includes(style.content) || style.display === 'none') continue;
      const marker = `native-capture-${index}-${pseudo.slice(2)}`;
      copied.classList.add(marker);
      const temporary = document.createElement('span');
      await copyStyle(original,temporary,pseudo);
      pseudoRules.push(`.${marker}${pseudo}{${temporary.style.cssText}}`);
    }
  }
  const width = Math.ceil(element.getBoundingClientRect().width);
  const height = Math.ceil(Math.max(element.scrollHeight,element.getBoundingClientRect().height));
  for (const property of ['left','right','top','bottom','inset-inline-start','inset-inline-end','inset-block-start','inset-block-end','margin-inline-start','margin-inline-end','margin-block-start','margin-block-end']) clone.style.removeProperty(property);
  Object.assign(clone.style,{margin:'0',position:'relative',left:'auto',top:'auto',transform:'none',width:`${width}px`,maxWidth:'none'});
  const html = new XMLSerializer().serializeToString(clone);
  const styleNode = document.createElement('style'); styleNode.textContent = pseudoRules.join('');
  const serializedStyle = new XMLSerializer().serializeToString(styleNode);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${serializedStyle}${html}</div></foreignObject></svg>`;
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = width * scale; canvas.height = height * scale;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
  if (element.classList.contains("delivered-monochrome")) context.filter = "grayscale(1)";
  context.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas;
}
