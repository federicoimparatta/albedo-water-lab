// Independent exploratory model. Romero's original equation is not yet available.
const RAD = Math.PI / 180;
export function dayOfYear(date) {
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
}
export function solarElevation(date, latitude, longitude) {
  const n = dayOfYear(date);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const year=date.getUTCFullYear(),daysInYear=(year%4===0&&(year%100!==0||year%400===0))?366:365;
  const gamma = 2 * Math.PI / daysInYear * (n - 1 + (hour - 12) / 24);
  const dec = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2*gamma) + 0.000907 * Math.sin(2*gamma) - 0.002697 * Math.cos(3*gamma) + 0.00148 * Math.sin(3*gamma);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2*gamma) - 0.040849 * Math.sin(2*gamma));
  const angle = ((hour * 60 + eq + 4 * longitude) / 4 - 180) * RAD;
  return Math.asin(Math.max(-1, Math.min(1, Math.sin(latitude*RAD)*Math.sin(dec)+Math.cos(latitude*RAD)*Math.cos(dec)*Math.cos(angle)))) / RAD;
}
export const albedo = (elevation, a, b) => a * Math.exp(b * elevation);
export function illustrativeRadiation(date, latitude, longitude) {
  const sin = Math.max(0, Math.sin(solarElevation(date, latitude, longitude)*RAD));
  return 1361 * (1 + 0.033*Math.cos(2*Math.PI*dayOfYear(date)/365)) * sin * (0.65 + 0.15*sin);
}
export function simulate({ date, latitude, longitude, fixed, a, b, weather }) {
  return Array.from({length:24}, (_,hour) => {
    const timestamp = new Date(`${date}T${String(hour).padStart(2,'0')}:30:00Z`);
    const samples = Array.from({length:12}, (_,i) => {
      const t = new Date(`${date}T${String(hour).padStart(2,'0')}:${String(i*5+2).padStart(2,'0')}:30Z`);
      const elevation = solarElevation(t,latitude,longitude);
      return { elevation, incoming:illustrativeRadiation(t,latitude,longitude), alpha:albedo(Math.max(0,elevation),a,b) };
    });
    const synthetic = samples.reduce((s,p)=>s+p.incoming,0)/12;
    const incoming = weather ? weather[hour] : synthetic;
    const weighted = samples.reduce((s,p)=>s+p.incoming*p.alpha,0);
    const alpha = synthetic > 0 ? weighted / (12*synthetic) : a;
    return {timestamp:timestamp.toISOString(),hour,elevation:solarElevation(timestamp,latitude,longitude),incoming,alpha, absorbed:incoming*(1-alpha),baseline:incoming*(1-fixed)};
  });
}
export function summarize(rows) {
  const energy = k => rows.reduce((s,r)=>s+r[k]*3600/1e6,0);
  const incoming=energy('incoming'), absorbed=energy('absorbed'), baseline=energy('baseline');
  return {incoming,absorbed,baseline,difference:absorbed-baseline,weightedAlbedo:incoming>0?1-absorbed/incoming:null};
}
export function parseCSV(text) {
  const rows=[]; let row=[], field='', quoted=false;
  const content = text.replace(/^\uFEFF/,'');
  for(let i=0;i<content.length;i++) {
    const c=content[i];
    if(c==='"') { if(quoted && content[i+1]==='"'){field+='"'; i++;}else quoted=!quoted; }
    else if(c===','&&!quoted){row.push(field.trim());field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&content[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('CSV contains an unclosed quote.');
  row.push(field.trim());if(row.some(Boolean))rows.push(row);
  if(rows.length<2)throw new Error('CSV needs a header and measurement rows.');
  const headers=rows.shift();
  const required=['timestamp_utc','incoming_w_m2','reflected_w_m2'];
  if(required.some(k=>!headers.includes(k)))throw new Error(`Required columns: ${required.join(', ')}.`);
  return rows.map((r,i)=>{
    if(r.length!==headers.length)throw new Error(`CSV row ${i+2} has ${r.length} fields; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((k,j)=>[k,r[j]]));
  });
}
export function fitExponential(rows) {
  if(rows.length<3)throw new Error('At least three training measurements are required.');
  const mx=rows.reduce((s,r)=>s+r.elevation,0)/rows.length;
  const my=rows.reduce((s,r)=>s+Math.log(r.alpha),0)/rows.length;
  const variance=rows.reduce((s,r)=>s+(r.elevation-mx)**2,0);
  if(variance/rows.length<4)throw new Error('Measurements need a wider range of solar elevations (standard deviation at least 2°).');
  const b=rows.reduce((s,r)=>s+(r.elevation-mx)*(Math.log(r.alpha)-my),0)/variance;
  return {a:Math.exp(my-b*mx),b};
}
export function calibrate(raw, latitude, longitude) {
  const seen = new Set(); let excluded=0;
  const rows=[];
  for(const r of raw){
    const t=r.timestamp_utc;
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/.test(t))throw new Error('Use ISO UTC timestamps ending in Z, e.g. 2025-01-15T16:00:00Z.');
    const date=new Date(t); const incoming=Number(r.incoming_w_m2), reflected=Number(r.reflected_w_m2);
    if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==t.slice(0,10)||r.incoming_w_m2===''||r.reflected_w_m2===''||!Number.isFinite(incoming)||!Number.isFinite(reflected))throw new Error('A row contains an invalid date or radiation value.');
    if(seen.has(+date))throw new Error('Duplicate timestamps found. Each measurement must have a unique UTC timestamp.');seen.add(+date);
    const elevation=solarElevation(date,latitude,longitude),alpha=reflected/incoming;
    if(incoming<50||elevation<5||elevation>85||alpha<=0||alpha>=1){excluded++;continue;}
    rows.push({timestamp:date.toISOString(),incoming,reflected,elevation,alpha});
  }
  rows.sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  if(rows.length<12)throw new Error(`Only ${rows.length} usable rows. Provide at least 12 with incoming ≥ 50 W/m², solar elevation 5–85°, and 0 < albedo < 1.`);
  const cut=Math.floor(rows.length*.75), train=rows.slice(0,cut), validation=rows.slice(cut);
  const model=fitExponential(train);
  if(![0,90,...rows.map(r=>r.elevation)].every(x=>albedo(x,model.a,model.b)>0&&albedo(x,model.a,model.b)<1))throw new Error('Fitted curve leaves the physical albedo range (0–1). Try a narrower period or a different model.');
  const constant=train.reduce((s,r)=>s+r.alpha,0)/train.length;
  const metrics=fn=>{
    const errors=validation.map(r=>fn(r)-r.alpha);
    const mean=validation.reduce((s,r)=>s+r.alpha,0)/validation.length;
    const sst=validation.reduce((s,r)=>s+(r.alpha-mean)**2,0);
    return {rmse:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length),bias:errors.reduce((s,e)=>s+e,0)/errors.length,r2:sst>1e-12?1-errors.reduce((s,e)=>s+e*e,0)/sst:null,reflectedRMSE:Math.sqrt(validation.reduce((s,r)=>s+((fn(r)-r.alpha)*r.incoming)**2,0)/validation.length)};
  };
  return {model,constant,train,validation,excluded,exponential:metrics(r=>albedo(r.elevation,model.a,model.b)),baseline:metrics(()=>constant)};
}
export function sampleCSV(latitude=-34.9,longitude=-56.16){
  const lines=['timestamp_utc,incoming_w_m2,reflected_w_m2'];
  for(let day=15;day<=18;day++)for(let h=0;h<24;h++){
    const date=new Date(`2025-01-${day}T${String(h).padStart(2,'0')}:30:00Z`);
    const elevation=solarElevation(date,latitude,longitude), incoming=illustrativeRadiation(date,latitude,longitude);
    if(incoming<50||elevation<5||elevation>85)continue;
    const alpha=albedo(elevation,.34,-.009)+.003*Math.sin(h*2.3+day);
    lines.push(`${date.toISOString()},${incoming.toFixed(3)},${(incoming*alpha).toFixed(3)}`);
  }
  return lines.join('\n');
}
export function parsePower(payload,date){
  const values=payload?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
  const unit=payload?.parameters?.ALLSKY_SFC_SW_DWN?.units;
  if(!values||!['Wh/m^2','W/m^2'].includes(unit))throw new Error('NASA returned an unexpected radiation unit or response.');
  return Array.from({length:24},(_,h)=>{
    const value=values[`${date.replaceAll('-','')}${String(h).padStart(2,'0')}`];
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value===payload?.header?.fill_value)throw new Error('NASA has missing hourly data for this location/date. Try another date.');
    // Wh/m² over a one-hour bin has the same numeric value as the hourly mean W/m².
    return value;
  });
}
