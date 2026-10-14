import test from 'node:test';
import assert from 'node:assert/strict';
import {solarElevation,simulate,summarize,parseCSV,fitExponential,calibrate,sampleCSV,parsePower,albedo} from '../src/science.js';

test('solar geometry: equatorial equinox noon and midnight',()=>{
  assert.ok(solarElevation(new Date('2025-03-20T12:00:00Z'),0,0)>87);
  assert.ok(solarElevation(new Date('2025-03-20T00:00:00Z'),0,0)<-87);
  assert.ok(Math.abs(solarElevation(new Date('2025-06-21T12:00:00Z'),23.44,0)-90)<1);
});
test('southern summer, seasonal change and polar night',()=>{
  const s={date:'2025-01-15',latitude:-34.9,longitude:-56.16,fixed:.23,a:.23,b:0};
  const summer=summarize(simulate(s));
  assert.ok(summer.incoming>20&&summer.incoming<45);
  assert.ok(summer.incoming>summarize(simulate({...s,date:'2025-07-15'})).incoming);
  const night=summarize(simulate({...s,date:'2025-12-21',latitude:90,longitude:0}));
  assert.equal(night.incoming,0);assert.equal(night.weightedAlbedo,null);
});
test('energy conservation, exact constant equivalence and dimensional integration',()=>{
  const rows=simulate({date:'2025-01-15',latitude:0,longitude:0,fixed:.23,a:.23,b:0,weather:Array(24).fill(100)});
  const s=summarize(rows);
  assert.ok(Math.abs(s.incoming-8.64)<1e-10);
  assert.ok(Math.abs(s.absorbed-8.64*.77)<1e-10);
  assert.ok(Math.abs(s.difference)<1e-10);
  assert.ok(rows.every(r=>r.absorbed>=0&&r.absorbed<=r.incoming));
});
test('log-linear regression recovers a known two-parameter exponential',()=>{
  const rows=Array.from({length:30},(_,i)=>({elevation:5+i*2,alpha:albedo(5+i*2,.34,-.009)}));
  const result=fitExponential(rows);
  assert.ok(Math.abs(result.a-.34)<1e-12);assert.ok(Math.abs(result.b+.009)<1e-12);
  assert.throws(()=>fitExponential(rows.map(r=>({...r,elevation:20}))),/wider range/);
});
test('CSV supports BOM, CRLF, quoted fields, and rejects malformed input',()=>{
  const r=parseCSV('\uFEFFtimestamp_utc,incoming_w_m2,reflected_w_m2,note\r\n"2025-01-15T16:00:00Z",800,160,"a, b"\r\n');
  assert.equal(r[0].note,'a, b');
  assert.throws(()=>parseCSV('foo,bar\n1,2'),/Required columns/);
  assert.throws(()=>parseCSV('timestamp_utc,incoming_w_m2,reflected_w_m2\n"oops'),/unclosed quote/);
  assert.throws(()=>parseCSV('timestamp_utc,incoming_w_m2,reflected_w_m2\n1,2'),/expected 3/);
});
test('calibration keeps latest observations out of training and beats constant on synthetic data',()=>{
  const raw=parseCSV(sampleCSV()),fit=calibrate(raw,-34.9,-56.16);
  assert.equal(fit.train.length,Math.floor(raw.length*.75));
  assert.ok(fit.train.at(-1).timestamp<fit.validation[0].timestamp);
  assert.ok(Math.abs(fit.model.a-.34)<.01);
  assert.ok(fit.exponential.rmse<.005);
  assert.ok(fit.exponential.rmse<fit.baseline.rmse);
  const modified=raw.map(r=>({...r}));modified.at(-1).reflected_w_m2=String(Number(modified.at(-1).incoming_w_m2)*.35);
  assert.deepEqual(calibrate(modified,-34.9,-56.16).model,fit.model);
});
test('invalid, ambiguous, duplicate and insufficient measurements are rejected',()=>{
  const raw=parseCSV(sampleCSV());
  assert.throws(()=>calibrate([...raw,raw[0]],-34.9,-56.16),/Duplicate/);
  assert.throws(()=>calibrate([{...raw[0],timestamp_utc:'2025-02-30T16:00:00Z'}],0,0),/invalid date/);
  assert.throws(()=>calibrate([{...raw[0],timestamp_utc:'2025-01-15 16:00'}],0,0),/UTC timestamps/);
  assert.throws(()=>calibrate([{...raw[0],incoming_w_m2:''}],0,0),/invalid date or radiation/);
  assert.throws(()=>calibrate(raw.slice(0,5),-34.9,-56.16),/at least 12/);
});
test('NASA hourly parser enforces units, full 24-hour coverage and missing values',()=>{
  const values=Object.fromEntries(Array.from({length:24},(_,h)=>[`20250115${String(h).padStart(2,'0')}`,h*10]));
  const payload={parameters:{ALLSKY_SFC_SW_DWN:{units:'Wh/m^2'}},properties:{parameter:{ALLSKY_SFC_SW_DWN:values}}};
  assert.equal(parsePower(payload,'2025-01-15')[12],120);
  values['2025011512']=-999;assert.throws(()=>parsePower(payload,'2025-01-15'),/missing/);
  payload.parameters.ALLSKY_SFC_SW_DWN.units='MJ/m^2/day';assert.throws(()=>parsePower(payload,'2025-01-15'),/unexpected/);
});
