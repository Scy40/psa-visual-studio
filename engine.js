const NS = 'http://www.w3.org/2000/svg';
const word = new Intl.Segmenter('zh', {granularity:'word'});
const letter = new Intl.Segmenter('zh', {granularity:'grapheme'});
const serialize = element => new XMLSerializer().serializeToString(element);
export const artworkMarkup = serialize;
const n = x => Math.round(x * 1000) / 1000;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

function seedRandom(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const grammars = {
  parallel:(i,k) => [.50, .15 + .70 * i/(k-1), 0, .65 + .1*(i%3)],
  cross:(i,k) => [.45 + .1*(i%2), .25 + .5*Math.floor(i/2)/Math.max(1,Math.ceil(k/2)-1), i%2 ? -37 : 37, .85],
  radial:(i,k) => {
    const a = 2*Math.PI*i/k;
    return [.50 + .28*Math.cos(a), .50 + .28*Math.sin(a), a*180/Math.PI, .62];
  },
  stairs:(i,k) => [.23+.54*i/(k-1), .78-.56*i/(k-1), 0, .65],
  frame:(i,k) => {
    const edge = i % 4;
    const shift = .09*Math.floor(i/4);
    return [[.53,.19+shift,0,.90],[.81-shift,.52,90,.90],[.47,.81-shift,0,.90],[.19+shift,.48,90,.90]][edge];
  },
  cluster:(i,k,r) => [.5+(r()-.5)*.49, .5+(r()-.5)*.51, [-22,0,22,90][i%4], .48+r()*.4],
  weave:(i,k) => {
    const f = i / Math.max(1,k-1);
    return i%2 ? [.22+.62*f,.52,90,.76] : [.48,.20+.64*f,0,.92];
  },
  deconstruct:(i,k,r) => [.14 + .72*((i*3%k)+.5)/k, .13+.74*i/(k-1), [-60,-16,12,45,75][i%5], .51+.41*r()]
};

// The third rectangle is a separate English text zone where the layout uses columns.
const placements = {
  poster:{
    bilingual_columns:[[0,0,3,.29],[0,.33,6,.67],[3,0,3,.29]],
    graphic_dominant:[[0,.73,6,.27],[0,0,6,.69]],
    asymmetric:[[0,0,6,.35],[1,.40,5,.60]],
    full_bleed:[[0,0,6,.34],[0,.38,6,.62]],
    information_dominant:[[0,0,6,.55],[0,.61,4,.39]]
  },
  social:{
    bilingual_columns:[[0,0,3,.39],[0,.44,6,.56],[3,0,3,.39]],
    graphic_dominant:[[0,.64,6,.36],[0,0,6,.59]],
    asymmetric:[[0,0,3,1],[3,.08,3,.92]],
    full_bleed:[[0,0,6,.43],[0,.48,6,.52]],
    information_dominant:[[0,0,4,1],[4,.22,2,.58]]
  },
  wechat_cover:{
    bilingual_columns:[[0,0,2,1],[4,0,2,1],[2,0,2,1]],
    graphic_dominant:[[0,0,3,1],[3,0,3,1]],
    asymmetric:[[0,.07,3,.93],[3,0,3,1]],
    full_bleed:[[0,0,3,1],[3.03,0,3,1]],
    information_dominant:[[0,0,4,1],[4,.15,2,.70]]
  }
};

function regions(media, layout, rules) {
  const {width,height} = rules.media[media];
  const short = Math.min(width,height);
  const m = short * rules.grid.marginRatio;
  const g = short * rules.grid.gutterRatio;
  const usable = width - 2*m;
  const pitch = (usable+g) / rules.grid.columns;
  const top = m + short*.046;
  const body = height - top - m - short*.046;
  const boxes = placements[media][layout].map(([col,row,span,depth]) => ({
    x:m+col*pitch, y:top+body*row, w:span*pitch-g, h:depth*body
  }));
  if(layout==='full_bleed') {
    if(media!=='wechat_cover') boxes[1].x=0;
    boxes[1].w=width-boxes[1].x;
  }
  return {width,height,short,m,g,pitch,boxes};
}

function wrap(value, width, context) {
  const lines = [];
  for (const paragraph of value.trim().split(/\r\n|\r|\n/)) {
    let line = '';
    for (const {segment} of word.segment(paragraph)) {
      if (!line && !segment.trim()) continue;
      const next = line + segment;
      if (context.measureText(next).width <= width) { line = next; continue; }
      if (line.trim()) lines.push(line.trimEnd());
      line = '';
      if (context.measureText(segment).width <= width) {line=segment.trimStart(); continue;}
      for (const {segment:char} of letter.segment(segment)) {
        if (line && context.measureText(line+char).width > width) {lines.push(line); line='';}
        line += char;
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}

function planText(context, task, area, rules) {
  const {boxes:[main,,second],short,m,width,height} = area;
  const c=task.content;
  const title = task.design.title_size_ratio;
  const specs=[
    ['title_zh',c.title_zh,title,rules.title[0],750],
    ['title_en',c.title_en,title*.79,rules.title[0],700],
    ['subtitle',c.subtitle,rules.subtitle[0]*1.14,rules.subtitle[0],650],
    ['description',c.description,rules.description[0]*1.06,rules.description[0],400],
    ['date',c.date,rules.description[0],rules.description[0],500],
    ['location',c.location,rules.description[0],rules.description[0],500]
  ];
  function compose(group, box) {
    let rows=[], bottom=box.y;
    for (let attempt=0; attempt<=10; attempt++) {
      rows=[];
      let top=box.y;
      for (const [key,value,preferred,min,weight] of group) {
        if (!value) continue;
        const size=n(short*Math.max(min,preferred*(1-attempt*.055)));
        context.font=weight+' '+size+'px '+rules.font;
        const chunks=wrap(value, box.w-Math.max(6,size*.12), context);
        const lineHeight=size*1.18;
        for (const chunk of chunks) {
          const ink=context.measureText(chunk);
          const ascent=Math.max(size*.84,ink.actualBoundingBoxAscent);
          rows.push({key,text:chunk,x:box.x+Math.max(2,ink.actualBoundingBoxLeft+1),y:top+ascent,size,weight,box});
          top+=lineHeight;
        }
        top+=short*(key.startsWith('title') ? .010 : .006);
      }
      bottom=top;
      if (bottom<=box.y+box.h) break;
    }
    return {rows,overflow:bottom>box.y+box.h+.25};
  }
  const left=compose(second ? specs.filter(([key])=>key!=='title_en') : specs,main);
  const right=second ? compose([specs[1]],second) : {rows:[],overflow:false};
  const size=short*rules.caption[0];
  const topBox={x:m,y:m-1,w:width-2*m,h:short*.045};
  const bottomBox={x:m,y:height-m-short*.035,w:width-2*m,h:short*.036};
  const captions=[
    {key:'identity',text:'PSA  /  VISUAL STUDY',x:m+2,y:m+size*1.4,size,weight:700,box:topBox},
    {key:'notice',text:rules.label,x:m+2,y:height-m-size*.35,size,weight:500,box:bottomBox}
  ];
  return {rows:[...captions,...left.rows,...right.rows],overflow:left.overflow || right.overflow};
}

function graphic(task,rules,box) {
  const {graphic_strategy,graphic_density,seed}=task.design;
  const rng=seedRandom(seed);
  const [min,max]=rules.barCount;
  const count=Math.round(min+(max-min)*(graphic_density-rules.density[0])/(rules.density[1]-rules.density[0]));
  const palette=rules.palettes[task.design.palette_id];
  return Array.from({length:count},(_,i)=>{
    const [cx,cy,angle,scale]=grammars[graphic_strategy](i,count,rng);
    const ratio=rules.barRatios[Math.floor(rng()*rules.barRatios.length)];
    const length=Math.min(box.w,box.h)*(0.32+graphic_density*.34)*scale*(.90+rng()*.17);
    const center=task.design.layout==='full_bleed'&&i===count-1 ? box.x+box.w-length*.08 : box.x+cx*box.w;
    return {cx:n(center),cy:n(box.y+cy*box.h),angle:n(angle),length:n(length),thick:n(length/ratio),ratio,color:palette.graphic[i%palette.graphic.length]};
  });
}

function el(name,attrs={},text) {
  const element=document.createElementNS(NS,name);
  for (const [key,value] of Object.entries(attrs)) element.setAttribute(key,numeric(value));
  if (text !== undefined) element.textContent=text;
  return element;
}
function numeric(value) {return typeof value==='number' ? n(value) : value;}
function boxAttrs(b) {return {x:b.x,y:b.y,width:b.w,height:b.h};}

function paint(task,rules,medium,area,plan,bars,stage,grid,stamp) {
  const {width,height,m,g,pitch,boxes:[,graphicBox]}=area;
  const palette=rules.palettes[task.design.palette_id];
  const svg=el('svg',{width,height,viewBox:'0 0 '+width+' '+height,role:'img','aria-label':task.content.title_zh+' '+rules.media[medium].label});
  svg.append(el('title',{},task.content.title_zh+' · '+rules.media[medium].label),el('desc',{},rules.label+' / '+stage));
  const clip=el('clipPath',{id:stamp});
  clip.append(el('rect',boxAttrs(graphicBox)));
  const defs=el('defs'); defs.append(clip); svg.append(defs);
  svg.append(el('rect',{width,height,fill:palette.background}));
  const graphics=el('g',{'clip-path':'url(#'+stamp+')','data-layer':'graphic'});
  for (const b of bars) {
    graphics.append(el('rect',{x:b.cx-b.length/2,y:b.cy-b.thick/2,width:b.length,height:b.thick,fill:b.color,transform:'rotate('+b.angle+' '+b.cx+' '+b.cy+')'}));
  }
  svg.append(graphics);
  const text=el('g',{fill:palette.ink,'font-family':rules.font,'data-layer':'text'});
  for (const l of plan.rows) text.append(el('text',{x:l.x,y:l.y,'font-size':l.size,'font-weight':l.weight,'xml:space':'preserve','data-key':l.key},l.text));
  svg.append(text);
  if (stage==='草稿') {
    const flag=el('text',{x:width-m,y:m+area.short*rules.caption[0]*1.4,'text-anchor':'end','font-family':rules.font,'font-size':area.short*rules.caption[0],fill:palette.ink},stage);
    svg.append(flag);
  }
  if (grid) {
    const lines=el('g',{fill:'none',stroke:'#EC426F','stroke-opacity':.35,'stroke-width':1,'data-layer':'grid'});
    for(let i=0;i<rules.grid.columns;i++)lines.append(el('rect',{x:m+i*pitch,y:m,width:pitch-g,height:height-2*m}));
    svg.append(lines);
  }
  return {svg,text};
}

const contains=(outer,inner,pad=.65)=>inner.x>=outer.x-pad && inner.y>=outer.y-pad && inner.x+inner.width<=outer.x+outer.w+pad && inner.y+inner.height<=outer.y+outer.h+pad;
const intersects=(a,b)=>Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>.8 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>.8;
function relativeLuminance(c) {
  return [.2126,.7152,.0722].reduce((total,weight,i)=>{
    const s=parseInt(c.slice(1+i*2,3+i*2),16)/255;
    return total+weight*(s<=.04045?s/12.92:((s+.055)/1.055)**2.4);
  },0);
}
function contrast(a,b) {
  const la=relativeLuminance(a), lb=relativeLuminance(b);
  return (Math.max(la,lb)+.05)/(Math.min(la,lb)+.05);
}
function inspect(svg,text,area,task,rules,medium,plan,bars,repeat) {
  const {width,height,m,boxes:[,graph]}=area;
  const pal=rules.palettes[task.design.palette_id];
  const inkContext=document.createElement('canvas').getContext('2d');
  const bounds=[...text.children].map((node,index)=>{
    const line=plan.rows[index], svgBox=node.getBBox();
    inkContext.font=line.weight+' '+line.size+'px '+rules.font;
    const ink=inkContext.measureText(line.text);
    const x=Math.min(svgBox.x,line.x-ink.actualBoundingBoxLeft);
    const right=Math.max(svgBox.x+svgBox.width,line.x+ink.actualBoundingBoxRight);
    return {x,y:line.y-ink.actualBoundingBoxAscent,width:right-x,height:ink.actualBoundingBoxAscent+ink.actualBoundingBoxDescent};
  });
  const breaches=bounds.map((b,i)=>contains({x:m,y:m,w:width-2*m,h:height-2*m},b) ? null : plan.rows[i].key).filter(Boolean);
  const spills=bounds.map((b,i)=>contains(plan.rows[i].box,b) ? null : plan.rows[i].key).filter(Boolean);
  const collisions=bounds.flatMap((b,i)=>bounds.slice(i+1).filter(other=>intersects(b,other)));
  const graphCollisions=bounds.filter(b=>intersects(b,{x:graph.x,y:graph.y,width:graph.w,height:graph.h}));
  const missing=Object.entries(task.content).filter(([key,v])=>{
    if (!v) return false;
    const compact=s=>s.replace(/\s/gu,'');
    return compact(plan.rows.filter(row=>row.key===key).map(row=>row.text).join(''))!==compact(v);
  }).map(([key])=>key);
  const colors=[...svg.querySelectorAll('[fill]')].map(node=>node.getAttribute('fill')).filter(c=>c!=='none');
  const cr=contrast(pal.ink,pal.background);
  const cap=rules.densityCaps[task.brief.category]??rules.density[1];
  const shapeOK=bars.every(b=>rules.barRatios.includes(b.ratio)&&Math.abs(b.length/b.thick-b.ratio)<.015);
  const checks=[
    ['输出尺寸',svg.width.baseVal.value===width&&svg.height.baseVal.value===height,width+' × '+height+' px'],
    ['色板合规',colors.every(color=>pal.colors.includes(color)),task.design.palette_id+' / '+[...new Set(colors)].join('、')],
    ['文字安全边距',!breaches.length,'安全边距 '+n(m)+' px'+(breaches.length?' · '+[...new Set(breaches)].join('、'):'')],
    ['溢出与重叠',!plan.overflow&&!spills.length&&!collisions.length,plan.overflow||spills.length||collisions.length?'超出区域 '+[...new Set(spills)].join('、')+' / 重叠 '+collisions.length+' / 空间不足 '+(plan.overflow?'是':'否')+'。请缩短内容或切换构图。':'已测量 '+bounds.length+' 行 SVG 文字'],
    ['主要信息完整',!missing.length,missing.length?'缺少 '+missing.join('、'):'已核对全部输入字段与实验标识'],
    ['图形参数',shapeOK&&bars.length>=rules.barCount[0]&&bars.length<=rules.barCount[1]&&task.design.graphic_density<=cap,bars.length+' 个条形 · 密度 '+task.design.graphic_density+' / 上限 '+cap],
    ['文字对比度',cr>=4.5,cr.toFixed(2)+':1 / 最低 4.5:1'],
    ['生成复现',repeat,'独立重算同一设计的条形和文字布局'],
    ['图文碰撞',!graphCollisions.length,graphCollisions.length?graphCollisions.length+' 行触及图形裁切区':'文字实测边界与图形裁切区分离']
  ];
  return checks.map(([name,pass,detail])=>({name,pass,detail}));
}

export function generate(task,rules,medium,host,{stage='草稿',grid=false}={}) {
  const area=regions(medium,task.design.layout,rules);
  const ctx=document.createElement('canvas').getContext('2d');
  const compose=()=>({plan:planText(ctx,task,area,rules),bars:graphic(task,rules,area.boxes[1])});
  const result=compose(), {plan,bars}=result;
  const {svg,text}=paint(task,rules,medium,area,plan,bars,stage,grid,'art-'+medium);
  host.replaceChildren(svg);
  const checks=inspect(svg,text,area,task,rules,medium,plan,bars,same(result,compose()));
  return {svg,checks};
}

export async function toPng(svg) {
  await document.fonts.ready;
  const canvas=document.createElement('canvas');
  canvas.width=svg.width.baseVal.value;canvas.height=svg.height.baseVal.value;
  const source=URL.createObjectURL(new Blob([serialize(svg)],{type:'image/svg+xml;charset=utf-8'}));
  try {
    const image=new Image();
    image.src=source;
    await image.decode();
    canvas.getContext('2d').drawImage(image,0,0);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 生成失败')),'image/png'));
  } finally {URL.revokeObjectURL(source);}
}

